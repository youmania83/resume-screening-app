// src/services/provider-detection/ProviderDetectionService.ts
import { URL } from "url";

export type CloudProvider = 
  | "google_drive"
  | "dropbox"
  | "onedrive"
  | "box"
  | "sharepoint"
  | "s3"
  | "gcs"
  | "azure_blob"
  | "supabase"
  | "github"
  | "direct_file"
  | "unknown";

export interface DetectionResult {
  provider: CloudProvider;
  isDirect: boolean;
  cleanUrl: string;
}

export class ProviderDetectionService {
  /**
   * Detects the cloud provider and direct download applicability from a URL.
   */
  public static detect(url: string): DetectionResult {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const pathname = parsedUrl.pathname.toLowerCase();

      // 1. Google Drive
      if (hostname.includes("drive.google.com") || hostname.includes("docs.google.com")) {
        // Extract file ID and build direct export URL
        const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        let cleanUrl = url;
        let isDirect = false;

        if (fileIdMatch && fileIdMatch[1]) {
          // Rewrite to Google Drive direct download endpoint
          cleanUrl = `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
          isDirect = true;
        }

        return {
          provider: "google_drive",
          isDirect,
          cleanUrl
        };
      }

      // 2. Dropbox
      if (hostname.includes("dropbox.com")) {
        let cleanUrl = url;
        if (url.includes("dl=0")) {
          cleanUrl = url.replace("dl=0", "dl=1");
        } else if (!url.includes("dl=1") && !url.includes("raw=1")) {
          cleanUrl = url + (url.includes("?") ? "&dl=1" : "?dl=1");
        }
        return {
          provider: "dropbox",
          isDirect: false,
          cleanUrl
        };
      }

      // 3. OneDrive
      if (hostname.includes("onedrive.live.com") || hostname.includes("1drv.ms")) {
        return {
          provider: "onedrive",
          isDirect: false,
          cleanUrl: url
        };
      }

      // 4. Box
      if (hostname.includes("box.com")) {
        return {
          provider: "box",
          isDirect: false,
          cleanUrl: url
        };
      }

      // 5. SharePoint
      if (hostname.includes("sharepoint.com")) {
        return {
          provider: "sharepoint",
          isDirect: false,
          cleanUrl: url
        };
      }

      // 6. AWS S3
      if (hostname.includes("amazonaws.com")) {
        return {
          provider: "s3",
          isDirect: true,
          cleanUrl: url
        };
      }

      // 7. Google Cloud Storage
      if (hostname.includes("storage.googleapis.com")) {
        return {
          provider: "gcs",
          isDirect: true,
          cleanUrl: url
        };
      }

      // 8. Azure Blob Storage
      if (hostname.includes("blob.core.windows.net")) {
        return {
          provider: "azure_blob",
          isDirect: true,
          cleanUrl: url
        };
      }

      // 9. Supabase Storage
      if (hostname.includes("supabase.co")) {
        return {
          provider: "supabase",
          isDirect: true,
          cleanUrl: url
        };
      }

      // 10. GitHub RAW
      if (hostname.includes("raw.githubusercontent.com") || hostname.includes("github.com") && pathname.includes("/raw/")) {
        return {
          provider: "github",
          isDirect: true,
          cleanUrl: url
        };
      }

      // 11. Direct file checking (ends with supported extensions)
      const cleanPathname = pathname.split("?")[0];
      const isDirect = 
        cleanPathname.endsWith(".pdf") || 
        cleanPathname.endsWith(".docx") || 
        cleanPathname.endsWith(".doc");

      if (isDirect) {
        return {
          provider: "direct_file",
          isDirect: true,
          cleanUrl: url
        };
      }

      // Default fallback
      return {
        provider: "unknown",
        isDirect: false,
        cleanUrl: url
      };
    } catch (err) {
      console.warn(`[ProviderDetection] Error parsing URL ${url}:`, err);
      return {
        provider: "unknown",
        isDirect: false,
        cleanUrl: url
      };
    }
  }
}
