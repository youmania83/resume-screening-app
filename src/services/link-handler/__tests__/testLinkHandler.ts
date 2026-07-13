// src/services/link-handler/__tests__/testLinkHandler.ts
import { ProviderDetectionService } from "../../provider-detection/ProviderDetectionService.js";
import { FileValidationService } from "../../file-validation/FileValidationService.js";
import { TempStorageService } from "../../temp-storage/TempStorageService.js";
import { TextExtractionService } from "../../text-extraction/TextExtractionService.js";
import { LinkHandlerService } from "../LinkHandlerService.js";
import { queryGlobal } from "../../../lib/tenantDb.js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Color helper for terminal logs
const green = (t: string) => `\x1b[32m${t}\x1b[0m`;
const red = (t: string) => `\x1b[31m${t}\x1b[0m`;
const yellow = (t: string) => `\x1b[33m${t}\x1b[0m`;

async function runTests() {
  console.log(yellow("=== Starting Cloud Resume Retrieval Engine Tests ===\n"));

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`${green("✔ PASS")} : ${msg}`);
      passed++;
    } else {
      console.error(`${red("✘ FAIL")} : ${msg}`);
      failed++;
    }
  }

  // 0. Setup database-aware identifiers
  const tenantRes = await queryGlobal("SELECT id FROM tenants LIMIT 1;");
  if (tenantRes.rowCount === 0) {
    console.error(red("Aborting tests: No tenants found in database. Please run seed/init-db first."));
    process.exit(1);
  }
  const tenantId = tenantRes.rows[0].id;
  const inboxId = crypto.randomUUID();

  // Create temporary inbox record to satisfy foreign key constraint in resume_processing_logs
  await queryGlobal(
    `INSERT INTO resume_inbox (id, tenant_id, file_name, file_url, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'Queued', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
    [inboxId, tenantId, "test_file.url", "https://example.com/test_file.pdf"]
  );

  try {
    // Test Case 1: Provider Detection
    console.log(yellow("\n--- Test Suite 1: Provider Detection ---"));
    
    const gdriveRes = ProviderDetectionService.detect("https://drive.google.com/file/d/1A2B3C_4D/view?usp=sharing");
    assert(gdriveRes.provider === "google_drive" && !gdriveRes.isDirect, "Detect Google Drive public view link");

    const dropboxRes = ProviderDetectionService.detect("https://www.dropbox.com/s/xyz123/my_resume.docx?dl=0");
    assert(dropboxRes.provider === "dropbox" && !dropboxRes.isDirect && dropboxRes.cleanUrl.includes("dl=1"), "Detect Dropbox link and rewrite dl=0 to dl=1");

    const onedriveRes = ProviderDetectionService.detect("https://onedrive.live.com/redir?resid=12345");
    assert(onedriveRes.provider === "onedrive" && !onedriveRes.isDirect, "Detect OneDrive live links");

    const directPdfRes = ProviderDetectionService.detect("https://techsolengineers.com/assets/sample-resume.pdf");
    assert(directPdfRes.provider === "direct_file" && directPdfRes.isDirect, "Detect direct PDF files");

    const directDocxRes = ProviderDetectionService.detect("https://techsolengineers.com/assets/sample-resume.docx?version=2");
    assert(directDocxRes.provider === "direct_file" && directDocxRes.isDirect, "Detect direct DOCX files ignoring query parameters");

    // Test Case 2: File Validation
    console.log(yellow("\n--- Test Suite 2: File Validation ---"));
    
    const tempDir = TempStorageService.ensureDir();
    const dummyPdf = path.join(tempDir, "dummy.pdf");
    const dummyDocx = path.join(tempDir, "dummy.docx");
    const dummyExe = path.join(tempDir, "dummy.exe");
    const dummyLarge = path.join(tempDir, "large_file.pdf");

    fs.writeFileSync(dummyPdf, Buffer.alloc(1000)); // 1KB
    fs.writeFileSync(dummyDocx, Buffer.alloc(1000)); // 1KB
    fs.writeFileSync(dummyExe, Buffer.alloc(100)); // 100B
    fs.writeFileSync(dummyLarge, Buffer.alloc(26 * 1024 * 1024)); // 26MB

    const valPdf = FileValidationService.validate(dummyPdf);
    assert(valPdf.valid, "Accept clean PDF file");

    const valDocx = FileValidationService.validate(dummyDocx);
    assert(valDocx.valid, "Accept clean DOCX file");

    const valExe = FileValidationService.validate(dummyExe);
    assert(!valExe.valid && valExe.errorReason?.includes("Dangerous file type"), "Reject executable files");

    const valLarge = FileValidationService.validate(dummyLarge);
    assert(!valLarge.valid && valLarge.errorReason?.includes("size exceeds"), "Reject files exceeding 25MB limit");

    // Clean up virtual test files
    TempStorageService.delete(dummyPdf);
    TempStorageService.delete(dummyDocx);
    TempStorageService.delete(dummyExe);
    TempStorageService.delete(dummyLarge);

    // Test Case 3: Text Extraction Fallbacks
    console.log(yellow("\n--- Test Suite 3: Text Extraction Fallbacks ---"));
    
    const dummyTxt = path.join(tempDir, "dummy.txt");
    fs.writeFileSync(dummyTxt, "This is a dummy resume file for test extraction purposes.");
    
    try {
      const txtExtracted = await TextExtractionService.extractText(dummyTxt);
      assert(txtExtracted.includes("dummy resume file"), "Extract plain text from txt files");
    } catch (err: any) {
      assert(false, `Text extraction failed: ${err.message}`);
    }
    TempStorageService.delete(dummyTxt);

    // Test Case 4: LinkHandler Validation with invalid URL (404 / Invalid hostname)
    console.log(yellow("\n--- Test Suite 4: Link Handler Failures & Fallbacks ---"));
    const invalidUrlRes = await LinkHandlerService.process(
      "https://invalid-host-name-for-testing.com/notfound.pdf",
      tenantId,
      inboxId
    );
    assert(!invalidUrlRes.success && invalidUrlRes.errorReason === "FAILED", "Gracefully handle invalid / unresolvable direct links");

  } finally {
    // Post-Test Cleanup
    await queryGlobal("DELETE FROM resume_processing_logs WHERE inbox_id = $1;", [inboxId]);
    await queryGlobal("DELETE FROM resume_inbox WHERE id = $1;", [inboxId]);
  }

  console.log(yellow(`\n=== Test Summary: ${passed} Passed, ${failed} Failed ===`));
  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((e) => {
  console.error(red("Fatal test runner crash:"), e);
  process.exit(1);
});
