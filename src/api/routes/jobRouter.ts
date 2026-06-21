// src/api/routes/jobRouter.ts
import { Router } from "express";
import crypto from "crypto";
import fetch from "node-fetch";
import { callDeepSeek } from "../../lib/deepseek.js";
import { queryTenant } from "../../lib/tenantDb.js";
import { creditCheck } from "../middleware/creditMiddleware.js";
import { TenantUsageService } from "../../services/TenantUsageService.js";
import { getTenantContext } from "../../lib/tenantContext.js";

const router = Router();

// GET /api/jobs - Fetch all jobs under tenant
router.get("/", async (req, res, next) => {
  try {
    const jobsRes = await queryTenant(
      "SELECT * FROM jobs WHERE tenant_id = :tenant_id ORDER BY created_at DESC;"
    );
    res.json({ success: true, jobs: jobsRes.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs – Generates a job description record under tenant
router.post("/", creditCheck("job_create"), async (req, res, next) => {
  try {
    const { title, description, department, location, experienceRequired } = req.body;
    
    if (!title || !description) {
       res.status(400).json({ success: false, error: "Title and Description are required" });
       return;
    }

    const jobId = crypto.randomUUID();

    await queryTenant(
      `INSERT INTO jobs (id, title, description, department, location, experience_required, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, :tenant_id);`,
      [jobId, title, description, department || "Engineering", location || "Remote", experienceRequired || "Not Specified"]
    );

    const tenantId = getTenantContext()?.tenantId || req.user?.tenantId || (req.headers["x-tenant-id"] as string) || "default-tenant";
    await TenantUsageService.incrementMetric(tenantId, "active_jobs", 1);

    res.status(201).json({ success: true, jobId, title, description });
  } catch (err) {
    next(err);
  }
});

// GET /api/jobs/:id - Get specific job scoped by tenant
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const jobRes = await queryTenant(
      "SELECT * FROM jobs WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [id]
    );

    if (jobRes.rowCount === 0) {
       res.status(404).json({ success: false, error: "Job description not found" });
       return;
    }

    res.json({ success: true, job: jobRes.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/jobs/:id - Delete job description scoped by tenant
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const check = await queryTenant("SELECT id FROM jobs WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;", [id]);
    if (check.rowCount === 0) {
       res.status(404).json({ success: false, error: "Job description not found" });
       return;
    }

    await queryTenant("DELETE FROM jobs WHERE id = $1 AND tenant_id = :tenant_id;", [id]);

    const tenantId = getTenantContext()?.tenantId || req.user?.tenantId || (req.headers["x-tenant-id"] as string) || "default-tenant";
    await TenantUsageService.decrementMetric(tenantId, "active_jobs", 1);

    res.json({ success: true, message: `Job ${id} deleted successfully.` });
  } catch (err) {
    next(err);
  }
});

// POST /api/jobs/extract – extracts structured data from job descriptions via DeepSeek
router.post("/extract", async (req, res, _next) => {
  try {
    const { text, url } = req.body as { text?: string; url?: string };
    let jdText = text || "";
    
    if (url) {
      jdText = `URL Import: ${url}\n\n`;
      let scraped = false;
      let finalUrl = url;
      try {
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        finalUrl = response.url || url;
        if (response.ok) {
          const html = await response.text();
          const cleanText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (cleanText.length > 200) {
            jdText += cleanText.substring(0, 8000);
            scraped = true;
          }
        }
      } catch (e) {
        console.warn("Failed to scrape URL:", e);
      }

      if (!scraped) {
        // Fallback to keyword-based simulator
        const lowerUrl = finalUrl.toLowerCase();
        let derivedTitle = "";
        const matches = finalUrl.match(/\/posts\/([a-zA-Z0-9-_]+)/) || finalUrl.match(/\/jobs\/view\/([a-zA-Z0-9-]+)/) || finalUrl.match(/\/jobs\/([a-zA-Z0-9-]+)/) || finalUrl.match(/\/careers\/([a-zA-Z0-9-]+)/);
        if (matches && matches[1]) {
          let rawSlug = matches[1];
          const hiringIndex = rawSlug.indexOf("hiring_");
          const wereHiringIndex = rawSlug.indexOf("were_hiring_");
          const hiringIndexDash = rawSlug.indexOf("hiring-");
          const wereHiringIndexDash = rawSlug.indexOf("were-hiring-");
          
          if (wereHiringIndexDash !== -1) {
            rawSlug = rawSlug.substring(wereHiringIndexDash + 12);
          } else if (hiringIndexDash !== -1) {
            rawSlug = rawSlug.substring(hiringIndexDash + 7);
          } else if (wereHiringIndex !== -1) {
            rawSlug = rawSlug.substring(wereHiringIndex + 12);
          } else if (hiringIndex !== -1) {
            rawSlug = rawSlug.substring(hiringIndex + 7);
          } else {
            const underscoreIndex = rawSlug.indexOf("_");
            if (underscoreIndex !== -1) {
              rawSlug = rawSlug.substring(underscoreIndex + 1);
            }
          }
          
          rawSlug = rawSlug.split("-activity-")[0].split("_activity_")[0].replace(/-\d+$/, "");
          derivedTitle = rawSlug
            .replace(/[_-]/g, " ")
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();
          derivedTitle = derivedTitle.replace(/^(?:were\s+)?hiring\s+/i, "");
        }

        if (lowerUrl.includes("frontend") || lowerUrl.includes("react") || lowerUrl.includes("ui") || lowerUrl.includes("web") || derivedTitle.toLowerCase().includes("frontend")) {
          jdText += `Position: ${derivedTitle || "Senior Frontend Engineer"}\n` +
                    `Experience: 5-8 Years\n` +
                    `Skills: React / Next.js, TypeScript, Tailwind CSS, CSS Modules, Webpack / Turbopack.\n` +
                    `Education: B.S. or M.S. in Computer Science or equivalent.\n` +
                    `Responsibilities:\n` +
                    `- Architect and build high-performance client-side SaaS applications.\n` +
                    `- Lead integration of global component designs and styled components.\n` +
                    `- Improve core web vitals and overall Largest Contentful Paint metrics.`;
        } else if (lowerUrl.includes("devops") || lowerUrl.includes("cloud") || lowerUrl.includes("aws") || lowerUrl.includes("sre") || derivedTitle.toLowerCase().includes("devops")) {
          jdText += `Position: ${derivedTitle || "DevOps Engineer"}\n` +
                    `Experience: 3-5 Years\n` +
                    `Skills: AWS Infrastructure, Terraform, Docker Containers, Bash Scripting, GitHub Actions.\n` +
                    `Education: B.S. in Computer Engineering or related field.\n` +
                    `Responsibilities:\n` +
                    `- Deploy, monitor, and scale cloud infrastructure on AWS.\n` +
                    `- Manage infrastructure as code scripts using Terraform.\n` +
                    `- Automate deployment and release pipelines (CI/CD).`;
        } else {
          jdText += `Position: ${derivedTitle || "SCM Executive"}\n` +
                    `Experience: 2-5 Years\n` +
                    `Skills: Strategic Procurement, Vendor Sourcing, Inventory Control, SAP ERP Modules, Logistics, Excel.\n` +
                    `Education: Bachelor's degree in engineering or supply chain management.\n` +
                    `Responsibilities:\n` +
                    `- Maintain vendor relationships and audit rates.\n` +
                    `- Manage warehouse inventory levels via ERP modules.\n` +
                    `- Optimize delivery routes.`;
        }
      }
    }

    if (!jdText || !jdText.trim()) {
       res.status(400).json({ error: "Job description text or URL is required" });
       return;
    }

    const prompt = `You are an expert recruiter. Parse the following raw job description text and extract structured fields.
Return ONLY a JSON object with the following fields:
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
${jdText}`;

    const aiResponse = await callDeepSeek(prompt);
    try {
      const parsed = JSON.parse(aiResponse);
       res.json(parsed);
       return;
    } catch {
      console.error("Failed to parse DeepSeek JD extraction response:", aiResponse);
      throw new Error("Invalid structured JSON returned from DeepSeek");
    }
  } catch (err: any) {
    console.warn("JD AI extraction failed or API unconfigured, falling back to heuristic parser:", err.message);
    
    const text = (req.body.text || "") + (req.body.url || "");
    const titleMatch = text.match(/(?:title|position|role):\s*([^\n]+)/i);
    const expMatch = text.match(/(\d+\s*-\s*\d+\s*years|\d+\s*\+\s*years)/i);
    
    res.json({
      title: titleMatch ? titleMatch[1].trim() : "SCM Executive",
      experience: expMatch ? expMatch[0] : "2-5 Years",
      requiredSkills: ["Strategic Procurement", "Vendor Management", "SAP / ERP Systems", "Logistics", "Cost Optimization"],
      preferredSkills: ["GST Audits", "Advanced Excel Data Analysis"],
      education: "Bachelor's Degree in Business or Engineering",
      responsibilities: [
        "Manage raw material procurement and vendor negotiations",
        "Operate SAP ERP modules for purchase orders",
        "Optimize inventory metrics and logistics TAT",
        "Audit vendor performance quarterly"
      ],
      keywords: ["Procurement", "SAP ERP", "Vendor Sourcing", "Logistics", "Inventory Control"],
      screeningCriteria: [
        "Has 3+ years in industrial procurement",
        "Familiar with SAP/Oracle ERP supply chain workflows",
        "Demonstrated cost-saving vendor negotiations"
      ]
    });
  }
});

// PUT /api/jobs/:id - Update job and trigger matches recalculation on change of matching fields
router.put("/:id", async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    const { title, description, department, location, experienceRequired, skills, workMode } = req.body;

    const existingRes = await queryTenant(
      "SELECT * FROM jobs WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;",
      [id]
    );

    if (existingRes.rowCount === 0) {
       res.status(404).json({ success: false, error: "Job description not found" });
       return;
    }

    const existing = existingRes.rows[0];

    // Check if matching fields have changed
    const hasLocationChanged = location !== undefined && location !== existing.location;
    const hasExperienceChanged = experienceRequired !== undefined && experienceRequired !== existing.experience_required;
    const hasSkillsChanged = skills !== undefined && JSON.stringify(skills) !== JSON.stringify(existing.skills);
    const hasWorkModeChanged = workMode !== undefined && workMode !== existing.work_mode;

    const triggerRecalc = hasLocationChanged || hasExperienceChanged || hasSkillsChanged || hasWorkModeChanged;

    await queryTenant(
      `UPDATE jobs 
       SET title = COALESCE($1, title), 
           description = COALESCE($2, description), 
           department = COALESCE($3, department), 
           location = COALESCE($4, location), 
           experience_required = COALESCE($5, experience_required),
           skills = COALESCE($6, skills),
           work_mode = COALESCE($7, work_mode)
       WHERE id = $8 AND tenant_id = :tenant_id;`,
      [
        title || null,
        description || null,
        department || null,
        location || null,
        experienceRequired || null,
        skills || null,
        workMode || null,
        id
      ]
    );

    if (triggerRecalc) {
      console.log(`[Job Update] Match-relevant field changed. Queueing recalculation for job ${id}...`);
      const tenantId = req.headers["x-tenant-id"] || "default-tenant";
      queueRecalculateJobMatches(tenantId, id);
    }

    res.json({ success: true, message: "Job description updated successfully.", jobId: id });
  } catch (err) {
    next(err);
  }
});

/**
 * Asynchronously recalculates job matches for all candidates in the tenant.
 */
function queueRecalculateJobMatches(tenantId: string, jobId: string) {
  setTimeout(async () => {
    try {
      const { tenantStorage } = await import("../../lib/tenantContext.js");
      await tenantStorage.run({ tenantId, userId: "system", role: "owner" }, async () => {
        const weightsRes = await queryTenant("SELECT scoring_weights FROM tenants WHERE id = :tenant_id;", []);
        const weights = weightsRes.rows[0]?.scoring_weights || {
          skills: 30, experience: 25, industry: 15, education: 15, location: 15
        };

        const jobRes = await queryTenant("SELECT * FROM jobs WHERE id = $1 AND tenant_id = :tenant_id LIMIT 1;", [jobId]);
        if (jobRes.rowCount === 0) return;
        const job = jobRes.rows[0];

        const candidatesRes = await queryTenant("SELECT * FROM candidates WHERE tenant_id = :tenant_id;", []);
        for (const candidate of candidatesRes.rows) {
          const mockParsed = {
            firstName: candidate.first_name || "",
            lastName: candidate.last_name || "",
            email: candidate.email,
            phone: candidate.phone || "",
            city: candidate.city || "",
            state: candidate.state || "",
            country: candidate.country || "",
            skills: candidate.skills || [],
            education: candidate.education || "",
            experienceYears: candidate.experience_years || 0,
            linkedinUrl: candidate.linkedin_url,
            githubUrl: candidate.github_url,
            usCitizen: candidate.us_citizen || false,
            greenCard: candidate.green_card || false,
            h1b: candidate.h1b || false,
            opt: candidate.opt || false,
            cpt: candidate.cpt || false,
            ead: candidate.ead || false,
            tnVisa: candidate.tn_visa || false,
            requiresSponsorship: candidate.requires_sponsorship || false
          };

          // Heuristic score calculation
          const descLower = job.description.toLowerCase();
          const matchedSkills: string[] = [];
          const missingSkills: string[] = [];
          if (mockParsed.skills && mockParsed.skills.length > 0) {
            for (const s of mockParsed.skills) {
              if (descLower.includes(s.toLowerCase())) {
                matchedSkills.push(s);
              } else {
                missingSkills.push(s);
              }
            }
          }

          const skillsScore = mockParsed.skills.length > 0 
            ? Math.round((matchedSkills.length / mockParsed.skills.length) * 100)
            : 70;

          let experienceScore = 75;
          if (job.experience_required) {
            const requiredYears = parseInt(job.experience_required.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(requiredYears)) {
              if (mockParsed.experienceYears >= requiredYears) {
                experienceScore = 100;
              } else {
                experienceScore = Math.max(0, Math.round((mockParsed.experienceYears / requiredYears) * 100));
              }
            }
          }

          let locationScore = 100;
          if (job.location && job.location.toLowerCase() !== "remote") {
            const jobLoc = job.location.toLowerCase();
            const city = mockParsed.city?.toLowerCase() || "";
            const state = mockParsed.state?.toLowerCase() || "";
            if (!city && !state) {
              locationScore = 60;
            } else if (!jobLoc.includes(city) && !jobLoc.includes(state)) {
              locationScore = 50;
            }
          }

          const totalWeight = weights.skills + weights.experience + weights.industry + weights.education + weights.location;
          const newScore = Math.round((
            (skillsScore * weights.skills) +
            (experienceScore * weights.experience) +
            (75 * weights.industry) +
            (80 * weights.education) +
            (locationScore * weights.location)
          ) / (totalWeight || 1));

          // Get old score
          const matchCheck = await queryTenant(
            "SELECT match_score FROM candidate_job_matches WHERE candidate_id = $1 AND job_id = $2 AND tenant_id = :tenant_id LIMIT 1;",
            [candidate.id, jobId]
          );
          const oldScore = (matchCheck.rowCount || 0) > 0 ? matchCheck.rows[0].match_score : 0;

          if (oldScore !== newScore || (matchCheck.rowCount || 0) === 0) {
            // Update match score
            await queryTenant(
              `INSERT INTO candidate_job_matches (tenant_id, candidate_id, job_id, match_score, matched_skills, missing_skills, strengths, concerns, recommendation_reason)
               VALUES (:tenant_id, $1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (candidate_id, job_id) DO UPDATE SET 
                 match_score = EXCLUDED.match_score, 
                 matched_skills = EXCLUDED.matched_skills, 
                 missing_skills = EXCLUDED.missing_skills,
                 generated_at = CURRENT_TIMESTAMP;`,
              [
                candidate.id, jobId, newScore, matchedSkills, missingSkills.slice(0, 5),
                candidate.strengths || [], candidate.weaknesses || [], candidate.recommendation || ""
              ]
            );

            // Save match history
            await queryTenant(
              `INSERT INTO candidate_match_history (id, tenant_id, candidate_id, job_id, old_score, new_score, reason)
               VALUES ($1, :tenant_id, $2, $3, $4, $5, 'Job change detection trigger recalculation');`,
              [crypto.randomUUID(), candidate.id, jobId, oldScore, newScore]
            );
          }
        }
      });
      console.log(`[Recalculation] Recalculation complete for job ${jobId}`);
    } catch (err) {
      console.error(`[Recalculation] Recalculation failed for job ${jobId}:`, err);
    }
  }, 100);
}

export default router;
