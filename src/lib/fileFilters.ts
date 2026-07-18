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
