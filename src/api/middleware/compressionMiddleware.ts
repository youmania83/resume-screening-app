// src/api/middleware/compressionMiddleware.ts
import zlib from "zlib";
import type { Request, Response, NextFunction } from "express";

export function compressionMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const acceptEncoding = req.headers["accept-encoding"] || "";
    let compressionType: "br" | "gzip" | null = null;

    if (typeof acceptEncoding === "string") {
      if (acceptEncoding.includes("br")) {
        compressionType = "br";
      } else if (acceptEncoding.includes("gzip")) {
        compressionType = "gzip";
      }
    }

    const originalWrite = res.write;
    const originalEnd = res.end;
    const originalWriteHead = res.writeHead;
    const chunks: Buffer[] = [];
    let headersSent = false;

    res.writeHead = function (statusCode: number, ...args: any[]) {
      const contentType = (res.getHeader("content-type") || "") as string;
      const isCompressible = /json|text|javascript|css|html|xml/i.test(contentType);
      const alreadyCompressed = !!res.getHeader("Content-Encoding");

      if (compressionType && isCompressible && !alreadyCompressed) {
        res.setHeader("Content-Encoding", compressionType);
        res.removeHeader("Content-Length");
      } else {
        compressionType = null;
      }

      headersSent = true;
      return originalWriteHead.apply(this, [statusCode, ...args]);
    };

    res.write = function (chunk: any, encoding?: any, callback?: any): boolean {
      if (compressionType) {
        const buf = Buffer.isBuffer(chunk) 
          ? chunk 
          : typeof chunk === "string" 
            ? Buffer.from(chunk, typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8") 
            : Buffer.from(chunk);
        chunks.push(buf);
        if (typeof callback === "function") callback();
        return true;
      }
      return originalWrite.apply(this, [chunk, encoding, callback]);
    };

    res.end = function (chunk?: any, encoding?: any, callback?: any): Response<any, Record<string, any>> {
      if (compressionType) {
        if (chunk) {
          const buf = Buffer.isBuffer(chunk) 
            ? chunk 
            : typeof chunk === "string" 
              ? Buffer.from(chunk, typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8") 
              : Buffer.from(chunk);
          chunks.push(buf);
        }

        const buffer = Buffer.concat(chunks);

        // Enforce 1KB threshold (1024 bytes)
        if (buffer.length < 1024) {
          res.removeHeader("Content-Encoding");
          if (!headersSent) {
            res.setHeader("Content-Length", buffer.length);
          }
          originalWrite.call(this, buffer);
          return originalEnd.call(this, undefined, undefined, callback);
        }

        if (compressionType === "br") {
          zlib.brotliCompress(buffer, (err, compressed) => {
            if (err) {
              console.error("Brotli compression failed, falling back to uncompressed:", err);
              res.removeHeader("Content-Encoding");
              originalWrite.call(this, buffer);
              originalEnd.call(this, undefined, undefined, callback);
            } else {
              res.setHeader("Content-Length", compressed.length);
              originalWrite.call(this, compressed);
              originalEnd.call(this, undefined, undefined, callback);
            }
          });
        } else {
          zlib.gzip(buffer, (err, compressed) => {
            if (err) {
              console.error("Gzip compression failed, falling back to uncompressed:", err);
              res.removeHeader("Content-Encoding");
              originalWrite.call(this, buffer);
              originalEnd.call(this, undefined, undefined, callback);
            } else {
              res.setHeader("Content-Length", compressed.length);
              originalWrite.call(this, compressed);
              originalEnd.call(this, undefined, undefined, callback);
            }
          });
        }
        return this;
      }
      return originalEnd.apply(this, [chunk, encoding, callback]);
    };

    next();
  };
}
