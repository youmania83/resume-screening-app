// src/scripts/remediateJunkCandidatesAndSkills.ts
import dotenv from "dotenv";
dotenv.config();

import pg from "pg";

async function main() {
  console.log("🧹 [DB Remediation] Starting candidate cleanup and skill matching repair...");

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("supabase") || process.env.DATABASE_URL?.includes("aws")
      ? { rejectUnauthorized: false }
      : undefined
  });

  try {
    // 1. Delete candidates with placeholder names or invalid emails
    console.log("1️⃣ Cleaning junk candidates (Candidate Name Not Found, Not Found email)...");

    const deleteRes = await pool.query(`
      DELETE FROM candidates
      WHERE LOWER(name) LIKE '%candidate name not found%'
         OR LOWER(name) LIKE '%not found%'
         OR LOWER(name) = 'unknown candidate'
         OR LOWER(email) LIKE '%notfound%'
         OR LOWER(email) LIKE '%not_found%'
         OR LOWER(email) = 'not found'
         OR email IS NULL
         OR email = '';
    `);

    console.log(`  ✓ Removed ${deleteRes.rowCount || 0} junk candidate record(s) from database.`);

    // 2. Fetch all remaining candidates and active jobs to repair matched_skills
    console.log("2️⃣ Repairing matched skills and role mappings for remaining candidates...");
    const [candRes, jobRes] = await Promise.all([
      pool.query(`SELECT id, name, email, role, skills, matched_skills, job_id, experience_years FROM candidates;`),
      pool.query(`SELECT id, title, description, location FROM jobs;`)
    ]);

    const candidates = candRes.rows;
    const jobs = jobRes.rows;

    let repairedCount = 0;

    for (const c of candidates) {
      const skills: string[] = Array.isArray(c.skills) ? c.skills : [];
      let matchedSkills: string[] = Array.isArray(c.matched_skills) ? c.matched_skills : [];

      let assignedJob = jobs.find(j => j.id === c.job_id);

      if (!assignedJob && c.role) {
        const rLower = c.role.toLowerCase().trim();
        assignedJob = jobs.find(j => (j.title || "").toLowerCase().trim() === rLower);
      }

      if (skills.length > 0) {
        if (assignedJob) {
          const fullText = `${assignedJob.title || ""} ${assignedJob.description || ""}`.toLowerCase();
          const jMatched: string[] = [];

          for (const s of skills) {
            const sLower = s.toLowerCase().trim();
            if (!sLower) continue;
            if (
              fullText.includes(sLower) ||
              sLower.split(/[\s\/\-]+/).some(tok => tok.length >= 3 && fullText.includes(tok))
            ) {
              jMatched.push(s);
            }
          }

          matchedSkills = jMatched;
        } else {
          matchedSkills = [];
        }

        await pool.query(
          `UPDATE candidates 
           SET matched_skills = $1,
               skills = $2,
               last_synced_at = NOW()
           WHERE id = $3;`,
          [matchedSkills, skills, c.id]
        );
        repairedCount++;
      }
    }

    console.log(`  ✓ Repaired skills for ${repairedCount} candidate record(s).`);
    console.log("🎉 [DB Remediation] Completed successfully!");
  } catch (err) {
    console.error("❌ Error during DB remediation:", err);
  } finally {
    await pool.end();
  }
}

main();
