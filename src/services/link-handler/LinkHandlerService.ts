// src/services/link-handler/LinkHandlerService.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ProviderDetectionService, CloudProvider } from "../provider-detection/ProviderDetectionService.js";
import { BrowserDownloadService } from "../browser-download/BrowserDownloadService.js";
import { FileValidationService } from "../file-validation/FileValidationService.js";
import { TextExtractionService } from "../text-extraction/TextExtractionService.js";
import { TempStorageService } from "../temp-storage/TempStorageService.js";
import { queryGlobal } from "../../lib/tenantDb.js";
import { sendRestrictedLinkEmail } from "../../lib/email.js";

export interface LinkProcessingResult {
  success: boolean;
  text?: string;
  errorReason?: "LOGIN_REQUIRED" | "PRIVATE_FILE" | "DOWNLOAD_BLOCKED" | "TIMEOUT" | "FAILED" | "VALIDATION_FAILED" | "EXTRACTION_FAILED";
  message?: string;
}

export class LinkHandlerService {
  /**
   * Main entry point to process a candidate's resume link.
   * Downloads the file, validates it, extracts text, logs to audit database, and manages errors.
   */
  public static async process(
    url: string,
    tenantId: string,
    inboxId: string,
    candidateEmail?: string,
    candidateName?: string
  ): Promise<LinkProcessingResult> {
    const startTime = Date.now();
    console.log(`[LinkHandler] Starting processing for link: ${url}`);

    // 1. Detect provider
    const detection = ProviderDetectionService.detect(url);
    console.log(`[LinkHandler] Detected provider: ${detection.provider} (isDirect: ${detection.isDirect})`);

    let tempFilePath = "";
    let downloadSuccess = false;
    let extractionSuccess = false;
    let finalErrorReason: any = null;
    let finalMessage = "";
    let extractedText = "";

    // Retry policy logic (up to 3 attempts on timeout/transient failures)
    let attemptsLeft = 3;
    while (attemptsLeft > 0 && !downloadSuccess) {
      attemptsLeft--;
      try {
        // Decide download strategy
        if (detection.isDirect) {
          // Fast-path: Direct HTTP Download
          const ext = path.extname(new URL(detection.cleanUrl).pathname).toLowerCase() || ".pdf";
          tempFilePath = TempStorageService.getTempPath(inboxId, ext);
          downloadSuccess = await this.downloadDirectly(detection.cleanUrl, tempFilePath);
          
          if (!downloadSuccess) {
            console.log(`[LinkHandler] Direct download failed. Retrying with browser automation...`);
            const browserRes = await BrowserDownloadService.download(detection.cleanUrl, inboxId);
            if (browserRes.success && browserRes.filePath) {
              tempFilePath = browserRes.filePath;
              downloadSuccess = true;
            } else {
              finalErrorReason = browserRes.errorReason || "FAILED";
              finalMessage = browserRes.message || "Direct and browser downloads failed.";
            }
          }
        } else {
          // Browser automation path (e.g. Google Drive /view, Dropbox UI, OneDrive UI)
          const browserRes = await BrowserDownloadService.download(detection.cleanUrl, inboxId);
          if (browserRes.success && browserRes.filePath) {
            tempFilePath = browserRes.filePath;
            downloadSuccess = true;
          } else {
            finalErrorReason = browserRes.errorReason || "FAILED";
            finalMessage = browserRes.message || "Browser automation download failed.";
          }
        }
      } catch (err: any) {
        console.error(`[LinkHandler] Download attempt error:`, err);
        finalErrorReason = "FAILED";
        finalMessage = err.message || "Transient download error.";
      }

      if (!downloadSuccess && attemptsLeft > 0) {
        console.log(`[LinkHandler] Retrying download. Attempts left: ${attemptsLeft}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // 2. Validate file
    if (downloadSuccess && tempFilePath) {
      const valRes = FileValidationService.validate(tempFilePath);
      if (!valRes.valid) {
        downloadSuccess = false;
        finalErrorReason = "VALIDATION_FAILED";
        finalMessage = valRes.errorReason || "File validation failed.";
        TempStorageService.delete(tempFilePath);
        tempFilePath = "";
      }
    }

    // 3. Extract text
    if (downloadSuccess && tempFilePath) {
      try {
        console.log(`[LinkHandler] Beginning text extraction for: ${tempFilePath}`);
        extractedText = await TextExtractionService.extractText(tempFilePath);
        
        if (extractedText && extractedText.trim().length >= 50) {
          extractionSuccess = true;
        } else {
          finalErrorReason = "EXTRACTION_FAILED";
          finalMessage = "Extracted text content was too short or empty.";
        }
      } catch (err: any) {
        console.error(`[LinkHandler] Text extraction failed:`, err);
        finalErrorReason = "EXTRACTION_FAILED";
        finalMessage = err.message || "Failed to extract text from download.";
      } finally {
        // Safe Cleanup: Always delete temporary files on disk
        TempStorageService.delete(tempFilePath);
      }
    }

    const durationMs = Date.now() - startTime;

    // 4. Logging & Audit Trails
    await this.logAudit({
      tenantId,
      inboxId,
      provider: detection.provider,
      downloadSuccess,
      extractionSuccess,
      durationMs,
      errorReason: finalErrorReason,
      errorMessage: finalMessage
    });

    // 5. Handle failure notification (Restricted link auto-message)
    if (!extractionSuccess || !downloadSuccess) {
      if (candidateEmail) {
        console.log(`[LinkHandler] Sending restricted link alert email to candidate: ${candidateEmail}`);
        await sendRestrictedLinkEmail({
          tenantId,
          candidateEmail,
          candidateName: candidateName || "Candidate"
        }).catch((e) => console.error(`[LinkHandler] Failed to send email alert:`, e));
      }

      return {
        success: false,
        errorReason: finalErrorReason || "FAILED",
        message: finalMessage || "Resume link processing failed."
      };
    }

    return {
      success: true,
      text: extractedText
    };
  }

  private static async downloadDirectly(url: string, tempPath: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/octet-stream, */*"
        }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        console.warn(`[LinkHandler] Direct fetch returned HTTP ${response.status} for ${url}`);
        return false;
      }

      const contentType = response.headers.get("content-type") || "";
      // Reject if server returned an HTML page (login wall, Cloudflare challenge, etc.)
      if (contentType.includes("text/html")) {
        console.warn(`[LinkHandler] Direct fetch got text/html content-type (likely login/challenge page). URL: ${url}`);
        return false;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Sanity check: reject tiny responses (likely error pages)
      if (buffer.length < 512) {
        console.warn(`[LinkHandler] Direct fetch response too small (${buffer.length} bytes). Likely not a real file.`);
        return false;
      }

      // Ensure parent directory exists
      const dir = path.dirname(tempPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      await fs.promises.writeFile(tempPath, buffer);
      console.log(`[LinkHandler] Direct download succeeded. Saved ${buffer.length} bytes to ${tempPath}`);
      return true;
    } catch (err: any) {
      console.warn(`[LinkHandler] Direct fetch download failed for ${url}:`, err.message || err);
      return false;
    }
  }

  /**
   * Write processing log record for analytics and reporting.
   */
  private static async logAudit(params: {
    tenantId: string;
    inboxId: string;
    provider: CloudProvider;
    downloadSuccess: boolean;
    extractionSuccess: boolean;
    durationMs: number;
    errorReason?: string;
    errorMessage?: string;
  }): Promise<void> {
    const logId = crypto.randomUUID();
    try {
      await queryGlobal(
        `INSERT INTO resume_processing_logs (id, tenant_id, inbox_id, step, status, provider, duration_ms, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
        [
          logId, 
          params.tenantId, 
          params.inboxId, 
          "CloudLinkRetrieval", 
          params.extractionSuccess ? "Success" : "Failed", 
          params.provider, 
          params.durationMs, 
          params.errorReason ? `[${params.errorReason}] ${params.errorMessage}` : null
        ]
      );
    } catch (err) {
      console.error("[LinkHandler] Failed to log retrieval audit:", err);
    }
  }
}
