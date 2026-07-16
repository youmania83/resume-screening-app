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
    
    let statusCodeSaved = 200;
    let writeHeadArgsSaved: any[] = [];

    res.writeHead = function (statusCode: number, ...args: any[]) {
      statusCodeSaved = statusCode;
      writeHeadArgsSaved = args;
      return this;
    };

    res.write = function (chunk: any, encoding?: any, callback?: any): boolean {
      const buf = Buffer.isBuffer(chunk) 
        ? chunk 
        : typeof chunk === "string" 
          ? Buffer.from(chunk, typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8") 
          : Buffer.from(chunk);
      chunks.push(buf);
      if (typeof callback === "function") callback();
      return true;
    };

    res.end = function (chunk?: any, encoding?: any, callback?: any): Response<any, Record<string, any>> {
      if (chunk) {
        const buf = Buffer.isBuffer(chunk) 
          ? chunk 
          : typeof chunk === "string" 
            ? Buffer.from(chunk, typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8") 
            : Buffer.from(chunk);
        chunks.push(buf);
      }

      const buffer = Buffer.concat(chunks);
      const contentType = (res.getHeader("content-type") || "") as string;
      const isCompressible = /json|text|javascript|css|html|xml/i.test(contentType);
      const alreadyCompressed = !!res.getHeader("Content-Encoding");

      if (compressionType && isCompressible && !alreadyCompressed && buffer.length >= 1024) {
        res.setHeader("Content-Encoding", compressionType);
        res.removeHeader("Content-Length");

        const sendResponse = (err: any, compressed: Buffer) => {
          if (err) {
            console.error(`${compressionType} compression failed, falling back to uncompressed:`, err);
            res.removeHeader("Content-Encoding");
            res.setHeader("Content-Length", buffer.length);
            originalWriteHead.call(res, statusCodeSaved, ...writeHeadArgsSaved);
            originalWrite.call(res, buffer);
            originalEnd.call(res, undefined, undefined, callback);
          } else {
            res.setHeader("Content-Length", compressed.length);
            originalWriteHead.call(res, statusCodeSaved, ...writeHeadArgsSaved);
            originalWrite.call(res, compressed);
            originalEnd.call(res, undefined, undefined, callback);
          }
        };

        if (compressionType === "br") {
          zlib.brotliCompress(buffer, sendResponse);
        } else {
          zlib.gzip(buffer, sendResponse);
        }
      } else {
        res.setHeader("Content-Length", buffer.length);
        originalWriteHead.call(res, statusCodeSaved, ...writeHeadArgsSaved);
        originalWrite.call(res, buffer);
        originalEnd.call(res, undefined, undefined, callback);
      }

      return this;
    };

    next();
  };
}
