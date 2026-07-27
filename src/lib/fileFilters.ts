export const JUNK_DOCUMENT_KEYWORDS = [
  "payslip", "pay slip", "pay_slip", "salary", "salaryslip", "salary slip", "salary_slip",
  "challan", "ecr", "gst", "tax", "audit", "balance", "ledger", "statement", "check", "cheque", "hdfc", "cancelled",
  "ticket", "boarding", "flight", "booking", "travel", "paid", "voucher",
  "invoice", "receipt", "bill", "payment", "transaction", "bank", "account details",
  "scan", "mri", "xray", "medical", "prescription",
  "tender", "agreement", "contract", "proposal",
  "issue", "incident", "log", "report", "reports",
  "program", "training", "certificate", "course", "study", "study documents",
  "signature", "logo", "image0",
  "aadhar", "pan", "passbook", "marksheet", "mark sheet", "mark_sheet", "degree", "diploma", "scorecard", "marklist", "passport", "photo", "visa", "gifting", "portfolio", "card", "q1", "q2", "q3", "q4", "2026-27", "2025-26", "2024-25"
];

export function isNonResumeFile(fileName: string): boolean {
  const fileNameLower = fileName.toLowerCase();
  const hasCv = /(?:^|[^a-z])cv(?:$|[^a-z])/i.test(fileName);
  const hasResumeKeyword = fileNameLower.includes("resume") || hasCv || fileNameLower.includes("curriculum");
  
  if (hasResumeKeyword) {
    return false;
  }
  
  const hasJunkKeyword = JUNK_DOCUMENT_KEYWORDS.some(keyword => fileNameLower.includes(keyword));
  const hasDelimiterWord = fileNameLower.includes(" to ");
  
  return hasJunkKeyword || hasDelimiterWord;
}

/**
 * Validates file magic bytes against stated MIME type to prevent extension spoofing / malicious uploads (OWASP A01).
 */
export function validateFileMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length < 4) return false;

  // PDF check: Starts with %PDF- (0x25 0x50 0x44 0x46)
  if (mimeType === "application/pdf") {
    return buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  }

  // DOCX / ZIP check: Starts with PK\x03\x04 (0x50 0x4B 0x03 0x04)
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/zip" ||
    mimeType === "application/msword"
  ) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) && (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08);
  }

  // PNG check: Starts with 0x89 0x50 0x4E 0x47
  if (mimeType === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }

  // JPEG check: Starts with 0xFF 0xD8 0xFF
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // Plain text / Markdown fallback
  if (mimeType.startsWith("text/")) {
    return true;
  }

  return true; // Default allow for unspecified non-binary types
}

