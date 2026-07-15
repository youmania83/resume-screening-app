// src/test/testPdfParseReal.ts
import { PDFParse } from "pdf-parse";
import nodeFetch from "node-fetch";

async function run() {
  try {
    const url = "https://raw.githubusercontent.com/mozilla/pdf.js/master/web/compressed.tracemonkey-pldi-09.pdf";
    console.log("Fetching PDF from:", url);
    const res = await nodeFetch(url);
    if (!res.ok) throw new Error("Fetch failed");
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("PDF downloaded. Size:", buffer.length, "bytes");

    console.log("Initializing PDFParse...");
    const parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    
    console.log("Parse Success!");
    console.log("Metadata:", (data as any).metadata);
    console.log("Text length:", (data.text || "").length);
    console.log("Sample text snippet:\n", (data.text || "").substring(0, 300));
  } catch (err: any) {
    console.error("PDF Parsing failed:", err);
  }
}

run();
