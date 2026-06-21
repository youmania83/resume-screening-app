// src/lib/storage/StorageProvider.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface UploadedFileMetadata {
  fileUrl: string;
  fileKey: string;
  fileName: string;
  version: number;
  uploadedAt: Date;
  lastAccessedAt: Date;
}

export interface IStorageFile {
  fileKey: string;
  sizeBytes: number;
}

export interface IStorageProvider {
  uploadFile(tenantId: string, filename: string, buffer: Buffer): Promise<UploadedFileMetadata>;
  getDownloadUrl(tenantId: string, fileKey: string): Promise<string>;
  listAllFiles(tenantId?: string): Promise<IStorageFile[]>;
  deleteFile(tenantId: string, fileKey: string): Promise<void>;
}

// Helper to recursively list files in directory
function getAllFilesRec(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getAllFilesRec(name, fileList);
    } else {
      fileList.push(name);
    }
  }
  return fileList;
}

// 1. Local Storage Provider (stores files in the local uploads/ folder)
export class LocalStorageProvider implements IStorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve("uploads");
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async uploadFile(tenantId: string, filename: string, buffer: Buffer): Promise<UploadedFileMetadata> {
    const tenantDir = path.join(this.baseDir, tenantId);
    if (!fs.existsSync(tenantDir)) {
      fs.mkdirSync(tenantDir, { recursive: true });
    }

    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const fileKey = `${base}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    const filePath = path.join(tenantDir, fileKey);

    await fs.promises.writeFile(filePath, buffer);

    const now = new Date();
    return {
      fileUrl: `/uploads/${tenantId}/${fileKey}`,
      fileKey: `${tenantId}/${fileKey}`,
      fileName: filename,
      version: 1,
      uploadedAt: now,
      lastAccessedAt: now,
    };
  }

  async getDownloadUrl(tenantId: string, fileKey: string): Promise<string> {
    return `/uploads/${fileKey}`;
  }

  async listAllFiles(tenantId?: string): Promise<IStorageFile[]> {
    const searchDir = tenantId ? path.join(this.baseDir, tenantId) : this.baseDir;
    if (!fs.existsSync(searchDir)) return [];
    
    const absolutePaths = getAllFilesRec(searchDir);
    const results: IStorageFile[] = [];
    
    for (const absPath of absolutePaths) {
      // Exclude temp folders or non-resume logs
      if (absPath.endsWith("email_logs.txt") || absPath.includes(".DS_Store")) continue;
      
      const stats = fs.statSync(absPath);
      // Key is path relative to baseDir uploads/
      const relPath = path.relative(this.baseDir, absPath);
      results.push({
        fileKey: relPath,
        sizeBytes: stats.size
      });
    }
    return results;
  }

  async deleteFile(tenantId: string, fileKey: string): Promise<void> {
    // Prevent directory traversal escape
    const safeKey = path.join(tenantId, path.basename(fileKey));
    const filePath = path.join(this.baseDir, safeKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`[Local Storage] Deleted file: ${filePath}`);
    }
  }
}

// 2. AWS S3 Storage Provider (Placeholder/Integration wrapper)
export class S3StorageProvider implements IStorageProvider {
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.S3_BUCKET_NAME || "ira-resume-bucket";
  }

  async uploadFile(tenantId: string, filename: string, _buffer: Buffer): Promise<UploadedFileMetadata> {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const fileKey = `${tenantId}/${base}-${crypto.randomBytes(4).toString("hex")}${ext}`;
    
    console.log(`[S3 Storage] Uploading ${filename} to bucket ${this.bucketName} with key ${fileKey}...`);
    
    const now = new Date();
    return {
      fileUrl: `https://${this.bucketName}.s3.amazonaws.com/${fileKey}`,
      fileKey,
      fileName: filename,
      version: 1,
      uploadedAt: now,
      lastAccessedAt: now,
    };
  }

  async getDownloadUrl(_tenantId: string, fileKey: string): Promise<string> {
    return `https://${this.bucketName}.s3.amazonaws.com/${fileKey}`;
  }

  async listAllFiles(tenantId?: string): Promise<IStorageFile[]> {
    console.log(`[S3 Storage] Listing files in bucket ${this.bucketName} for tenant ${tenantId}...`);
    // Placeholder returning empty or mock items
    return [];
  }

  async deleteFile(_tenantId: string, fileKey: string): Promise<void> {
    console.log(`[S3 Storage] Deleting file from bucket ${this.bucketName} with key ${fileKey}...`);
  }
}

// 3. Azure Blob Storage Provider (Placeholder/Integration wrapper)
export class AzureStorageProvider implements IStorageProvider {
  private containerName: string;

  constructor() {
    this.containerName = process.env.AZURE_CONTAINER_NAME || "resumes";
  }

  async uploadFile(tenantId: string, filename: string, _buffer: Buffer): Promise<UploadedFileMetadata> {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const fileKey = `${tenantId}/${base}-${crypto.randomBytes(4).toString("hex")}${ext}`;

    console.log(`[Azure Storage] Uploading ${filename} to container ${this.containerName} with blob key ${fileKey}...`);

    const now = new Date();
    return {
      fileUrl: `https://irastorage.blob.core.windows.net/${this.containerName}/${fileKey}`,
      fileKey,
      fileName: filename,
      version: 1,
      uploadedAt: now,
      lastAccessedAt: now,
    };
  }

  async getDownloadUrl(_tenantId: string, fileKey: string): Promise<string> {
    return `https://irastorage.blob.core.windows.net/${this.containerName}/${fileKey}`;
  }

  async listAllFiles(tenantId?: string): Promise<IStorageFile[]> {
    console.log(`[Azure Storage] Listing blobs in container ${this.containerName} for tenant ${tenantId}...`);
    return [];
  }

  async deleteFile(_tenantId: string, fileKey: string): Promise<void> {
    console.log(`[Azure Storage] Deleting blob in container ${this.containerName} with key ${fileKey}...`);
  }
}

// 4. Mock Storage Provider (In-memory mock for quick local tests)
export class MockStorageProvider implements IStorageProvider {
  private static mockFiles: Map<string, { size: number }> = new Map();

  async uploadFile(tenantId: string, filename: string, buffer: Buffer): Promise<UploadedFileMetadata> {
    const now = new Date();
    const fileKey = `mock/${tenantId}/${Date.now()}-${filename}`;
    MockStorageProvider.mockFiles.set(fileKey, { size: buffer.length });
    return {
      fileUrl: `https://mock-storage.local/${fileKey}`,
      fileKey,
      fileName: filename,
      version: 1,
      uploadedAt: now,
      lastAccessedAt: now,
    };
  }

  async getDownloadUrl(_tenantId: string, fileKey: string): Promise<string> {
    return `https://mock-storage.local/${fileKey}`;
  }

  async listAllFiles(tenantId?: string): Promise<IStorageFile[]> {
    const results: IStorageFile[] = [];
    MockStorageProvider.mockFiles.forEach((meta, fileKey) => {
      if (!tenantId || fileKey.includes(`mock/${tenantId}/`)) {
        results.push({ fileKey, sizeBytes: meta.size });
      }
    });
    return results;
  }

  async deleteFile(_tenantId: string, fileKey: string): Promise<void> {
    MockStorageProvider.mockFiles.delete(fileKey);
    console.log(`[Mock Storage] Deleted mock file: ${fileKey}`);
  }
}

// Storage Manager Factory
export class StorageManager {
  static getProvider(): IStorageProvider {
    const providerType = process.env.STORAGE_PROVIDER || "local";
    switch (providerType.toLowerCase()) {
      case "s3":
        return new S3StorageProvider();
      case "azure":
        return new AzureStorageProvider();
      case "mock":
        return new MockStorageProvider();
      default:
        return new LocalStorageProvider();
    }
  }
}
