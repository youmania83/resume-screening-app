// src/services/browser-download/BrowserDownloadService.ts
import { chromium, Browser, BrowserContext, Page } from "playwright";
import path from "path";
import fs from "fs";
import { TempStorageService } from "../temp-storage/TempStorageService.js";

export interface BrowserDownloadResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  errorReason?: "LOGIN_REQUIRED" | "PRIVATE_FILE" | "DOWNLOAD_BLOCKED" | "TIMEOUT" | "FAILED";
  message?: string;
}

export class BrowserDownloadService {
  private static readonly TIMEOUT_MS = 25000;

  /**
   * Downloads a resume from a cloud storage URL using browser automation.
   */
  public static async download(url: string, inboxId: string): Promise<BrowserDownloadResult> {
    console.log(`[BrowserDownload] Initializing download for URL: ${url}`);
    
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process"
        ]
      });

      context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
        acceptDownloads: true
      });

      page = await context.newPage();
      page.setDefaultTimeout(this.TIMEOUT_MS);

      // Navigate to URL
      console.log(`[BrowserDownload] Navigating to URL...`);
      await page.goto(url, { waitUntil: "networkidle" });

      const pageContent = await page.textContent("body") || "";
      const lowerContent = pageContent.toLowerCase();

      // 1. Detect Permission / Login walls
      if (
        lowerContent.includes("sign in") || 
        lowerContent.includes("log in") || 
        lowerContent.includes("sign-in") ||
        lowerContent.includes("login") ||
        page.url().includes("accounts.google.com") ||
        page.url().includes("login.live.com") ||
        page.url().includes("box.com/login")
      ) {
        console.warn(`[BrowserDownload] Login wall detected: redirect to ${page.url()}`);
        return { success: false, errorReason: "LOGIN_REQUIRED", message: "Private file: Login required to access." };
      }

      if (
        lowerContent.includes("request access") || 
        lowerContent.includes("access denied") || 
        lowerContent.includes("you need permission") ||
        lowerContent.includes("you don't have permission") ||
        lowerContent.includes("private") ||
        lowerContent.includes("permission required")
      ) {
        console.warn(`[BrowserDownload] Access denied or private file detected.`);
        return { success: false, errorReason: "PRIVATE_FILE", message: "Restricted access: Recruiter does not have permission." };
      }

      // 2. Identify and trigger download button
      console.log(`[BrowserDownload] Searching for download elements...`);
      
      // Let's define heuristical download selectors for different providers
      const downloadSelectors = [
        // Google Drive Download buttons
        "button[aria-label='Download']",
        "div[aria-label='Download']",
        "#drive-download-button",
        "a[aria-label='Download']",
        // Dropbox download selectors
        "button[data-testid='preview-header-download-button']",
        "button:has-text('Download')",
        "a:has-text('Download')",
        // OneDrive download selectors
        "button[aria-label='Download']",
        // Box download selectors
        "button[data-testid='download-btn']",
        "button[aria-label='Download File']",
        // Fallbacks
        "[title*='Download']",
        "[aria-label*='Download']",
        "button:has-text('download')",
        "a:has-text('download')"
      ];

      let downloadButton = null;
      for (const selector of downloadSelectors) {
        try {
          const el = await page.locator(selector).first();
          if (await el.isVisible() && await el.isEnabled()) {
            downloadButton = el;
            console.log(`[BrowserDownload] Located download trigger via selector: ${selector}`);
            break;
          }
        } catch {
          // continue
        }
      }

      if (!downloadButton) {
        // Double check if download is explicitly blocked/disabled
        if (lowerContent.includes("disabled download") || lowerContent.includes("download disabled")) {
          return { success: false, errorReason: "DOWNLOAD_BLOCKED", message: "Download disabled by the document owner." };
        }
        
        console.warn(`[BrowserDownload] Could not locate any enabled download buttons.`);
        return { success: false, errorReason: "FAILED", message: "Failed to locate download link or button on preview page." };
      }

      // 3. Handle file download event
      console.log(`[BrowserDownload] Triggering download and waiting for file...`);
      const tempDir = TempStorageService.ensureDir();
      
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15000 }),
        downloadButton.click()
      ]);

      const suggestedName = download.suggestedFilename() || `downloaded_resume_${inboxId}.pdf`;
      const ext = path.extname(suggestedName).toLowerCase() || ".pdf";
      const targetPath = TempStorageService.getTempPath(inboxId, ext);

      await download.saveAs(targetPath);
      console.log(`[BrowserDownload] Successfully saved download to: ${targetPath}`);

      return {
        success: true,
        filePath: targetPath,
        fileName: suggestedName
      };

    } catch (err: any) {
      console.error(`[BrowserDownload] Error during download sequence:`, err);
      if (err.name === "TimeoutError" || err.message?.includes("timeout")) {
        return { success: false, errorReason: "TIMEOUT", message: "Network connection or page rendering timed out." };
      }
      return { success: false, errorReason: "FAILED", message: err.message || "Failed downloading file." };
    } finally {
      // Clean up browser context and page
      if (page) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }
}
