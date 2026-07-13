// src/services/text-extraction/TextExtractionService.ts
import fs from "fs";
import path from "path";
import mammoth from "mammoth";

export class TextExtractionService {
  /**
   * Extracts text from a document based on its extension.
   */
  public static async extractText(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    const buffer = fs.readFileSync(filePath);

    if (ext === ".pdf") {
      return await this.extractPdf(buffer);
    } else if (ext === ".docx") {
      return await this.extractDocx(buffer);
    } else if (ext === ".doc") {
      return await this.extractLegacyDoc(buffer);
    } else if ([".png", ".jpg", ".jpeg", ".tiff", ".bmp"].includes(ext)) {
      return await this.extractImageOcr(filePath);
    } else {
      return buffer.toString("utf-8");
    }
  }

  /**
   * PDF text extraction with dynamic module resolving.
   */
  private static async extractPdf(buffer: Buffer): Promise<string> {
    let text = "";
    try {
      const pdfParseModule = await import("pdf-parse");
      const PDFParseClass = (pdfParseModule as any).PDFParse;
      
      if (typeof PDFParseClass === "function") {
        const parser = new PDFParseClass({ data: buffer });
        const data = await parser.getText();
        text = data.text || "";
      } else {
        let parseFn: any = pdfParseModule;
        
        if (typeof (pdfParseModule as any).default === "function") {
          parseFn = (pdfParseModule as any).default;
        } else if (typeof (pdfParseModule as any).default?.default === "function") {
          parseFn = (pdfParseModule as any).default.default;
        } else if (typeof pdfParseModule === "function") {
          parseFn = pdfParseModule;
        }

        if (typeof parseFn !== "function") {
          throw new Error("Could not find a valid PDF parsing function or constructor.");
        }

        const data = await parseFn(buffer);
        text = data.text || "";
      }
    } catch (err: any) {
      throw new Error(`Failed parsing PDF document: ${err.message}`);
    }

    const cleanText = text.replace(/\s+/g, "").trim();
    if (cleanText.length < 50) {
      console.log("[TextExtraction] PDF contains minimal text. Scanned document suspected.");
      throw new Error("Scanned PDF detected. Text extraction is not readable via standard parsing.");
    }

    return text;
  }

  /**
   * DOCX text extraction using Mammoth.
   */
  private static async extractDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || "";
    } catch (err: any) {
      throw new Error(`Failed parsing Word DOCX document: ${err.message}`);
    }
  }

  /**
   * Legacy DOC file parser (ASCII characters stream extractor).
   */
  private static async extractLegacyDoc(buffer: Buffer): Promise<string> {
    try {
      const cleanString = buffer.toString("binary").replace(/[^\x20-\x7E\x0A\x0D]/g, " ");
      const normalized = cleanString.replace(/\s+/g, " ").trim();
      return normalized;
    } catch (err: any) {
      throw new Error(`Failed parsing legacy Word DOC document: ${err.message}`);
    }
  }

  /**
   * Image text extraction using Tesseract OCR.
   */
  private static async extractImageOcr(filePath: string): Promise<string> {
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      console.log(`[OCR] Initializing Tesseract for image: ${path.basename(filePath)}`);
      const { data: { text } } = await worker.recognize(filePath);
      await worker.terminate();
      return text || "";
    } catch (err: any) {
      throw new Error(`Tesseract OCR failed to extract text from image: ${err.message}`);
    }
  }
}
