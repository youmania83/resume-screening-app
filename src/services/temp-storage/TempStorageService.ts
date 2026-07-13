// src/services/temp-storage/TempStorageService.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";

export class TempStorageService {
  private static readonly TEMP_DIR = path.resolve("uploads", "temp");

  /**
   * Ensures the temporary uploads directory exists.
   */
  public static ensureDir(): string {
    if (!fs.existsSync(this.TEMP_DIR)) {
      fs.mkdirSync(this.TEMP_DIR, { recursive: true });
    }
    return this.TEMP_DIR;
  }

  /**
   * Generates a safe local path for a temporary download.
   */
  public static getTempPath(inboxId: string, ext: string): string {
    this.ensureDir();
    return path.join(this.TEMP_DIR, `${inboxId}${ext.toLowerCase()}`);
  }

  /**
   * Deletes a temporary file if it exists.
   */
  public static delete(filePath: string): void {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[TempStorage] Cleared temporary file: ${filePath}`);
      }
    } catch (err) {
      console.warn(`[TempStorage] Failed to delete temp file ${filePath}:`, err);
    }
  }

  /**
   * Cleans up all files in the temp directory that are older than 1 hour (failsafe).
   */
  public static runGarbageCollector(): void {
    try {
      this.ensureDir();
      const files = fs.readdirSync(this.TEMP_DIR);
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(this.TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > oneHour) {
          fs.unlinkSync(filePath);
          console.log(`[TempStorage GC] Removed expired temp file: ${file}`);
        }
      }
    } catch (err) {
      console.warn("[TempStorage GC] Failed to run garbage collection:", err);
    }
  }
}
