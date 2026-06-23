// src/test/seedCandidate.ts
import { pool } from "../lib/db.js";
import { ensureJobAssessment } from "../lib/assessmentService.js";
import crypto from "crypto";

async function main() {
  console.log("🌱 Seeding Demo Candidate for Browser Flow Video Recording...");
  
  const tenantId = "tenant-demo";
  const jobId = "job-demo-scm";
  const candidateId = "candidate-demo-id";
  const token = "demo-token-1234567890";
  
  // 1. Ensure Tenant
  await pool.query(
    `INSERT INTO tenants (id, name)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;`,
    [tenantId, "Metropolis SCM Corp"]
  );
  
  // 2. Ensure Job
  await pool.query(
    `INSERT INTO jobs (id, tenant_id, title, description, department, location)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description;`,
    [jobId, tenantId, "Senior SCM Executive", "Manage supply chain operations. Requires SQL, and SCM experience.", "Operations", "Remote"]
  );
  
  // 3. Ensure Job Assessment exists
  await ensureJobAssessment(jobId, "Senior SCM Executive", "Manage supply chain operations. Requires SQL, and SCM experience.");
  
  // 4. Ensure Candidate
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);
  const appliedDate = new Date().toISOString().split('T')[0];
  
  await pool.query(
    `INSERT INTO candidates (
       id, tenant_id, name, email, phone, role, score, match_percent, experience_years,
       status, job_id, assessment_token, assessment_token_expiry, assessment_status, application_source, applied_date
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO UPDATE SET
       assessment_token = EXCLUDED.assessment_token,
       assessment_token_expiry = EXCLUDED.assessment_token_expiry,
       assessment_status = EXCLUDED.assessment_status,
       status = EXCLUDED.status,
       application_source = EXCLUDED.application_source,
       applied_date = EXCLUDED.applied_date;`,
    [
      candidateId, tenantId, "Clark Kent", "clark.kent.scm@example.com", "+91 99999 88888",
      "Senior SCM Executive", 85, 85, 5, "shortlisted", jobId, token, expiry, "pending", "Manual Upload", appliedDate
    ]
  );
  
  console.log("✅ Seed completed successfully!");
  console.log(`Candidate Portal URL: http://localhost:3000/assessment/${token}?sessionId=${crypto.randomUUID()}`);
  await pool.end();
}

main().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
