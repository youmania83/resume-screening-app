// src/services/file-validation/FileValidationService.ts
import fs from "fs";
import path from "path";

export interface ValidationResult {
  valid: boolean;
  errorReason?: string;
}

export class FileValidationService {
  private static readonly MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
  private static readonly PERMITTED_EXTS = [".pdf", ".docx", ".doc"];
  private static readonly DANGEROUS_EXTS = [".exe", ".js", ".bat", ".zip", ".rar", ".msi", ".apk", ".cmd", ".scr", ".sh"];

  /**
   * Validates a local file size and extension.
   */
  public static validate(filePath: string): ValidationResult {
    try {
      if (!fs.existsSync(filePath)) {
        return { valid: false, errorReason: "File does not exist on disk." };
      }

      const stats = fs.statSync(filePath);
      
      // Check file size
      if (stats.size > this.MAX_FILE_SIZE) {
        return { 
          valid: false, 
          errorReason: `File size exceeds the maximum limit of 25MB (Size: ${Math.round(stats.size / 1024 / 1024 * 10) / 10}MB).` 
        };
      }

      const ext = path.extname(filePath).toLowerCase();

      // Check dangerous extensions
      if (this.DANGEROUS_EXTS.includes(ext)) {
        return {
          valid: false,
          errorReason: `Dangerous file type blocked: ${ext}`
        };
      }

      // Check permitted extensions
      if (!this.PERMITTED_EXTS.includes(ext)) {
        return {
          valid: false,
          errorReason: `Unsupported file format: ${ext}. Only PDF, DOCX, and DOC are supported.`
        };
      }

      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        errorReason: `Validation error: ${err.message}`
      };
    }
  }
}
