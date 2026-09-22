// src/scripts/remediatePrashantKM.ts
//
// One-shot remediation script for candidate "Prashant K M" who was incorrectly
// mapped to "Project Manager – Semiconductor" instead of the SCM role they
// applied for.  This script:
//   1. Finds the candidate by name pattern matching
//   2. Finds the correct SCM/Supply Chain job to remap to
//   3. Revokes the wrong assessment token and clears assessment data
//   4. Remaps job_id to the correct SCM job
//   5. Recalculates the score against the SCM job description
//   6. Logs a timeline entry documenting the remediation
//   7. Cleans up any assessment responses linked to the wrong assessment

import dotenv from "dotenv";
dotenv.config();

import { queryGlobal } from "../lib/tenantDb.js";

async function remediatePrashantKM() {
  console.log("🔧 [Remediation] Starting Prashant K M job mapping fix...\n");

  try {
    // 1. Find Prashant K M candidate(s)
    const candRes = await queryGlobal(`
      SELECT c.id, c.name, c.email, c.role, c.skills, c.job_id, c.score,
             c.assessment_token, c.assessment_status, c.status, c.tenant_id,
             c.experience_years,
             j.title as current_job_title, j.id as current_job_id
      FROM candidates c
      LEFT JOIN jobs j ON c.job_id = j.id
      WHERE LOWER(c.name) LIKE '%prashant%'
        AND LOWER(c.name) LIKE '%k%m%'
      ORDER BY c.created_at DESC;
    `);

    if (!candRes.rowCount || candRes.rowCount === 0) {
      // Broaden search
      const broadRes = await queryGlobal(`
        SELECT c.id, c.name, c.email, c.role, c.skills, c.job_id, c.score,
               c.assessment_token, c.assessment_status, c.status, c.tenant_id,
               c.experience_years,
               j.title as current_job_title, j.id as current_job_id
        FROM candidates c
        LEFT JOIN jobs j ON c.job_id = j.id
        WHERE LOWER(c.name) LIKE '%prashant%'
        ORDER BY c.created_at DESC;
      `);

      if (!broadRes.rowCount || broadRes.rowCount === 0) {
        console.log("❌ No candidate matching 'Prashant' found in the database.");
        process.exit(1);
      }
      console.log(`Found ${broadRes.rowCount} candidates matching 'Prashant':`);
      for (const c of broadRes.rows) {
        console.log(`  • ${c.name} | Email: ${c.email} | Role: ${c.role} | Job: ${c.current_job_title || "(none)"} | Score: ${c.score}`);
      }
      console.log("\nNone matched 'Prashant K M' pattern. Please adjust the search criteria.");
      process.exit(1);
    }

    const candidate = candRes.rows[0];
    console.log(`✅ Found candidate: "${candidate.name}"`);
    console.log(`   Email:          ${candidate.email}`);
    console.log(`   Current Job:    ${candidate.current_job_title || "(none)"} (ID: ${candidate.current_job_id || "NULL"})`);
    console.log(`   Current Score:  ${candidate.score}`);
    console.log(`   Status:         ${candidate.status}`);
    console.log(`   Assessment:     token=${candidate.assessment_token ? "YES" : "NULL"}, status=${candidate.assessment_status || "NULL"}`);
    console.log(`   Skills:         ${(candidate.skills || []).slice(0, 8).join(", ")}`);

    // 2. Find the correct SCM job
    const scmJobRes = await queryGlobal(`
      SELECT id, title, description, location 
      FROM jobs 
      WHERE tenant_id = $1
        AND (
          LOWER(title) LIKE '%scm%' OR 
          LOWER(title) LIKE '%supply chain%' OR 
          LOWER(title) LIKE '%procurement%' OR
          LOWER(title) LIKE '%logistics%'
        )
        AND COALESCE(status, 'active') = 'active'
        AND sync_status IS DISTINCT FROM 'removed'
      ORDER BY created_at DESC
      LIMIT 5;
    `, [candidate.tenant_id]);

    if (!scmJobRes.rowCount || scmJobRes.rowCount === 0) {
      console.log("\n⚠️  No active SCM/Supply Chain job found in the database.");
      console.log("   Will still revoke the wrong assessment and unmap from incorrect job.");
      
      // Revoke assessment and unmap
      await queryGlobal(`
        UPDATE candidates 
        SET job_id = NULL,
            assessment_token = NULL,
            assessment_token_expiry = NULL,
            assessment_status = NULL,
            assessment_invited_at = NULL,
            status = 'Review',
            last_synced_at = NOW()
        WHERE id = $1;
      `, [candidate.id]);

      console.log("✅ Revoked wrong assessment and unmapped from incorrect job.");
      console.log("   Candidate set to 'Review' status for manual reassignment.");
    } else {
      const scmJob = scmJobRes.rows[0];
      console.log(`\n📋 Found SCM job: "${scmJob.title}" (ID: ${scmJob.id}, Location: ${scmJob.location || "N/A"})`);
      
      if (scmJobRes.rowCount > 1) {
        console.log(`   (${scmJobRes.rowCount} SCM jobs found — using the most recent one)`);
        for (const j of scmJobRes.rows) {
          console.log(`     • ${j.title} | ID: ${j.id} | Location: ${j.location || "N/A"}`);
        }
      }

      // 3. Recalculate score against the SCM job
      const skills: string[] = Array.isArray(candidate.skills) ? candidate.skills : [];
      const jobText = `${scmJob.title || ""} ${scmJob.description || ""}`.toLowerCase();
      const matchedSkills = skills.filter(s => s && jobText.includes(s.toLowerCase().trim()));
      const missingSkills = skills.filter(s => s && !jobText.includes(s.toLowerCase().trim()));

      const skillRatio = skills.length > 0 ? (matchedSkills.length / skills.length) : 0;
      let newScore = Math.round(skillRatio * 70);
      const expYears = Number(candidate.experience_years) || 0;
      if (expYears >= 5) newScore += 15;
      else if (expYears >= 2) newScore += 10;
      newScore = Math.min(100, Math.max(50, newScore));

      console.log(`\n🔄 Recalculated score: ${candidate.score} → ${newScore}`);
      console.log(`   Matched skills against SCM job: [${matchedSkills.join(", ")}]`);
      console.log(`   Missing skills: [${missingSkills.slice(0, 5).join(", ")}]`);

      // 4. Update the candidate record
      await queryGlobal(`
        UPDATE candidates 
        SET job_id = $1,
            role = $2,
            score = $3,
            match_percent = $3,
            matched_skills = $4,
            missing_skills = $5,
            assessment_token = NULL,
            assessment_token_expiry = NULL,
            assessment_status = NULL,
            assessment_invited_at = NULL,
            status = CASE 
              WHEN $3 >= 80 THEN 'shortlisted'
              WHEN $3 >= 60 THEN 'Review'
              ELSE 'rejected'
            END,
            last_synced_at = NOW()
        WHERE id = $6;
      `, [scmJob.id, scmJob.title, newScore, matchedSkills, missingSkills.slice(0, 10), candidate.id]);

      console.log(`✅ Remapped candidate to "${scmJob.title}" with score ${newScore}.`);

      // 5. Update the candidate_job_matches table
      await queryGlobal(`
        INSERT INTO candidate_job_matches (
          tenant_id, candidate_id, job_id, match_score, matched_skills, missing_skills, recommendation_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (candidate_id, job_id) DO UPDATE SET 
          match_score = EXCLUDED.match_score,
          matched_skills = EXCLUDED.matched_skills,
          missing_skills = EXCLUDED.missing_skills,
          recommendation_reason = EXCLUDED.recommendation_reason,
          generated_at = CURRENT_TIMESTAMP;
      `, [
        candidate.tenant_id, candidate.id, scmJob.id, newScore,
        matchedSkills, missingSkills.slice(0, 10),
        "Remediated: Candidate was incorrectly mapped to Project Manager – Semiconductor. Remapped to correct SCM role."
      ]);
    }

    // 6. Clean up any assessment responses linked to the wrong assessment
    if (candidate.assessment_token) {
      const cleanupRes = await queryGlobal(`
        DELETE FROM assessment_responses 
        WHERE candidate_id = $1
          AND assessment_id IN (
            SELECT a.id FROM assessments a 
            JOIN jobs j ON a.job_id = j.id 
            WHERE LOWER(j.title) LIKE '%semiconductor%' 
               OR LOWER(j.title) LIKE '%project manager%semiconductor%'
          );
      `, [candidate.id]);
      console.log(`🗑️  Cleaned up ${cleanupRes.rowCount || 0} wrong assessment responses.`);
    }

    // 7. Log timeline entry
    const crypto = await import("crypto");
    await queryGlobal(`
      INSERT INTO candidate_timeline (id, tenant_id, candidate_id, event_type, title, description)
      VALUES ($1, $2, $3, 'Remediation', 'Job Mapping Corrected', 
        'Candidate was incorrectly mapped to "Project Manager – Semiconductor" due to generic keyword overlap. ' ||
        'Remapped to correct SCM/Supply Chain role. Wrong assessment token revoked. ' ||
        'Root cause: resume entered pipeline without targetJobId + keyword scoring inflation + lenient role-family threshold.');
    `, [crypto.randomUUID(), candidate.tenant_id, candidate.id]);

    // 8. Log activity
    await queryGlobal(`
      INSERT INTO candidate_activity_logs (candidate_id, event_type, message, tenant_id)
      VALUES ($1, 'remediation', $2, $3);
    `, [
      candidate.id,
      `Job mapping corrected from "Project Manager – Semiconductor" to SCM role. Wrong assessment revoked. Automated remediation script.`,
      candidate.tenant_id
    ]);

    console.log("\n==========================================================================");
    console.log("✅ REMEDIATION COMPLETE");
    console.log("==========================================================================");
    console.log(`• Candidate:          ${candidate.name} (${candidate.email})`);
    console.log(`• Old Job:            ${candidate.current_job_title || "(none)"}`);
    console.log(`• New Job:            SCM/Supply Chain role (remapped)`);
    console.log(`• Assessment Token:   REVOKED`);
    console.log(`• Assessment Status:  CLEARED`);
    console.log(`• Timeline Entry:     LOGGED`);
    console.log("==========================================================================");

    process.exit(0);
  } catch (err: any) {
    console.error("❌ [Remediation Error]:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

remediatePrashantKM();
