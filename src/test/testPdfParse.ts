// src/test/testPdfParse.ts
async function main() {
  const pdfParseModule = await import("pdf-parse");
  console.log("pdfParseModule type:", typeof pdfParseModule);
  console.log("pdfParseModule keys:", Object.keys(pdfParseModule));
  console.log("pdfParseModule default type:", typeof (pdfParseModule as any).default);
  
  // Log properties of default if it exists
  const defaultExport = (pdfParseModule as any).default;
  if (defaultExport) {
    console.log("defaultExport keys:", Object.keys(defaultExport));
    console.log("defaultExport default type:", typeof defaultExport.default);
  }
}

main().catch(console.error);
