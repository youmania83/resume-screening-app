// src/test/testPdfParse.ts

async function main() {
  const pdfParse = await import("pdf-parse");
  const PDFParseClass = (pdfParse as any).PDFParse;
  
  const dummyPdfContent = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Title (John Doe Resume) >>\nendobj\nstream\nEmail: john.doe.email@example.com\nPhone: +1 555-123-4567\nSkills: Python, React, Docker, Kubernetes\nendstream\nendobj\nxref\n0 2\n0000000000 65535 f\n0000000009 00000 n\ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n310\n%%EOF\n"
  );
  
  try {
    const parser = new PDFParseClass({ data: dummyPdfContent });
    const data = await parser.getText();
    console.log("SUCCESS! Parsed text:", JSON.stringify(data.text || ""));
  } catch (err: any) {
    console.error("FAILED to parse PDF:", err);
  }
}

main().catch(console.error);
