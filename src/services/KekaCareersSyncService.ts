// src/services/KekaCareersSyncService.ts
import fetch from "node-fetch";
import crypto from "crypto";
import { query } from "../lib/db.js";
import { callDeepSeek } from "../lib/deepseek.js";

interface KekaRawJob {
  id: number;
  title: string;
  description: string;
  departmentName: string;
  excerpt: string;
  jobLocations: Array<{ name: string; city?: string; state?: string; countryName?: string }>;
  experience: string;
  jobNumber: string;
  salaryRangeFormat: string;
  publishedOn: string;
  skillNames: string[];
}

export class KekaCareersSyncService {
  private static KEKA_CAREERS_URL = "https://techsolengineers.keka.com/careers/api/embedjobs/default/active/c03c98cb-5d89-4e5b-9bbc-5ea37249a087";

  /**
   * Generates a deterministic UUID based on Keka Job ID and Tenant ID
   */
  private static generateDeterministicUuid(jobId: number, tenantId: string): string {
    const hash = crypto.createHash("md5").update(`keka-job-${jobId}-${tenantId}`).digest("hex");
    return [
      hash.slice(0, 8),
      hash.slice(8, 12),
      "4" + hash.slice(13, 16),
      "a" + hash.slice(17, 20),
      hash.slice(20, 32)
    ].join("-");
  }

  /**
   * Helper to strip HTML tags from description
   */
  private static stripHtml(html: string): string {
    if (!html) return "";
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Fetch, parse, and synchronize active jobs from the Keka Careers portal
   */
  static async syncActiveJobs(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
    console.log("⏰ [Keka Careers Sync] Starting active jobs sync...");
    const errors: string[] = [];
    let syncedCount = 0;

    try {
      // 1. Fetch active jobs from Keka Career portal API
      const response = await fetch(this.KEKA_CAREERS_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch active jobs from Keka Careers API. Status: ${response.status}`);
      }

      const rawJobs = (await response.json()) as KekaRawJob[];
      console.log(`[Keka Careers Sync] Retrieved ${rawJobs.length} active jobs from Keka Career portal.`);

      // 2. Resolve target tenant (current user's tenant)
      const targetTenantId = process.env.TARGET_TENANT_ID || "87b949cb-2c0d-44ca-a6f5-a025ec43e6a5";
      const tenantIds = [targetTenantId];
      console.log(`[Keka Careers Sync] Syncing jobs only for target tenant ID: ${targetTenantId}`);

      for (const rawJob of rawJobs) {
        try {
          const location = rawJob.jobLocations.map(l => l.name).join(", ") || "Remote";
          const plainDescription = this.stripHtml(rawJob.description || rawJob.excerpt || "");
          const experience = rawJob.experience || "Not Specified";
          const department = rawJob.departmentName || "Engineering";

          // Get or generate structured JD once for this job
          let jdObj: any = null;

          // Check if we already have this job synced under any tenant in the DB to reuse its JD
          const globalCheck = await query(
            "SELECT jd FROM jobs WHERE external_id = $1 AND jd IS NOT NULL LIMIT 1;",
            [rawJob.id.toString()]
          );

          if (globalCheck.rowCount !== null && globalCheck.rowCount > 0) {
            const rawJd = globalCheck.rows[0].jd;
            jdObj = typeof rawJd === "string" ? JSON.parse(rawJd) : rawJd;
          } else {
            // Check if there are any tenants that don't have this job yet
            let needsAi = false;
            for (const tenantId of tenantIds) {
              const checkRes = await query(
                "SELECT id FROM jobs WHERE external_id = $1 AND tenant_id = $2 LIMIT 1;",
                [rawJob.id.toString(), tenantId]
              );
              if (checkRes.rowCount === 0) {
                needsAi = true;
                break;
              }
            }

            if (needsAi) {
              console.log(`[Keka Careers Sync] Generating structured JD for new job: "${rawJob.title}"`);
              
              try {
                const prompt = `You are an expert recruiter. Parse the following raw job description and extract structured fields.
Return ONLY a valid JSON object with the following fields:
{
  "title": "string (the job title, e.g. Senior Frontend Engineer)",
  "experience": "string (experience required, e.g. '2-5 Years')",
  "requiredSkills": ["string array of top 5 required skills"],
  "preferredSkills": ["string array of preferred/nice-to-have skills"],
  "education": "string (required education, e.g. 'B.Tech / B.S. in Computer Science')",
  "responsibilities": ["string array of top 4 responsibilities"],
  "keywords": ["string array of 5 keywords for resume matching"],
  "screeningCriteria": ["string array of 3 screen check items"]
}
Do not include any extra explanation or formatting.

Job Description text:
Title: ${rawJob.title}
Department: ${department}
Location: ${location}
Experience: ${experience}
Details:
${plainDescription}`;

                const aiResponse = await callDeepSeek(prompt, { temperature: 0.1 });
                const cleanJsonStr = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();
                jdObj = JSON.parse(cleanJsonStr);
              } catch (aiErr: any) {
                console.warn(`[Keka Careers Sync] AI extraction failed for "${rawJob.title}". Falling back to heuristic parsing:`, aiErr.message);
                jdObj = {
                  title: rawJob.title,
                  experience: experience,
                  requiredSkills: rawJob.skillNames || [],
                  preferredSkills: [],
                  education: "B.E. / B.Tech or equivalent",
                  responsibilities: [plainDescription.substring(0, 300)],
                  keywords: [rawJob.title, department],
                  screeningCriteria: ["Experience match", "Skills alignment"]
                };
              }
            }
          }

          // Process jobs for each tenant
          for (const tenantId of tenantIds) {
            const deterministicJobId = this.generateDeterministicUuid(rawJob.id, tenantId);
            // Check if job already exists under this tenant
            const checkRes = await query(
              "SELECT id, jd FROM jobs WHERE external_id = $1 AND tenant_id = $2 LIMIT 1;",
              [rawJob.id.toString(), tenantId]
            );

            if (checkRes.rowCount !== null && checkRes.rowCount > 0) {
              console.log(`[Keka Careers Sync] Job "${rawJob.title}" (ID ${rawJob.id}) already exists for tenant ${tenantId}. Updating job code and sync status.`);
              await query(
                "UPDATE jobs SET job_code = $1, last_synced_at = NOW(), sync_status = 'synced' WHERE external_id = $2 AND tenant_id = $3;",
                [rawJob.jobNumber, rawJob.id.toString(), tenantId]
              );
              continue;
            } else {
              // Insert new job record
              await query(
                `INSERT INTO jobs (id, tenant_id, title, description, department, location, experience_required, jd, skills, work_mode, external_id, job_code, source_system, sync_status, last_synced_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW());`,
                [
                  deterministicJobId,
                  tenantId,
                  rawJob.title,
                  plainDescription,
                  department,
                  location,
                  experience,
                  JSON.stringify(jdObj),
                  rawJob.skillNames || [],
                  "Onsite",
                  rawJob.id.toString(),
                  rawJob.jobNumber,
                  "Keka",
                  "synced"
                ]
              );
            }
          }
          syncedCount++;
        } catch (jobErr: any) {
          const errMsg = `Failed to sync job ID ${rawJob.id} (${rawJob.title}): ${jobErr.message}`;
          console.error(`[Keka Careers Sync] ${errMsg}`);
          errors.push(errMsg);
        }
      }

      console.log(`✅ [Keka Careers Sync] Finished active jobs sync. Synced: ${syncedCount}, Errors: ${errors.length}`);
      return { success: errors.length === 0, syncedCount, errors };
    } catch (err: any) {
      console.error("🚨 [Keka Careers Sync] Sync process failed:", err.message || err);
      return { success: false, syncedCount: 0, errors: [err.message || String(err)] };
    }
  }
}
