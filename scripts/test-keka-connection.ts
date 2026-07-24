// scripts/test-keka-connection.ts
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config();

import { RealKekaAdapter } from "../src/integrations/keka/adapters/RealKekaAdapter";
import { kekaConfig, isKekaEnabled } from "../src/integrations/keka/config/keka.config";

async function main() {
  console.log("=== Keka Hire API Connection Test ===");
  console.log("Enabled:", kekaConfig.enabled);
  console.log("Base URL:", kekaConfig.baseUrl);
  console.log("Client ID:", kekaConfig.clientId);
  console.log("API Key configured:", kekaConfig.apiKey ? "Yes" : "No");
  console.log("Client Secret configured:", kekaConfig.clientSecret ? "Yes" : "No");
  console.log("Is Keka fully configured/enabled:", isKekaEnabled());
  console.log("=====================================\n");

  if (!isKekaEnabled()) {
    console.warn("⚠️ Keka integration is currently mock-only or disabled. To test the Real adapter, configure your credentials in the environment and set KEKA_ENABLED=true.");
    process.exit(0);
  }

  const adapter = new RealKekaAdapter();

  try {
    console.log("🔄 Testing authentication and fetching active jobs...");
    const jobs = await adapter.getJobs();
    console.log(`✅ Success! Fetched ${jobs.length} jobs.`);
    
    jobs.forEach((job) => {
      console.log(`- Job ID: ${job.id}`);
      console.log(`  Title: ${job.title}`);
      console.log(`  Department: ${job.department || "N/A"}`);
      console.log(`  Location: ${job.location || "N/A"}`);
      console.log(`  Status: ${job.status}`);
      console.log("-------------------------------------");
    });

    if (jobs.length > 0) {
      let candidates: any[] = [];
      let activeJob: any = null;

      console.log("\n🔄 Finding a job that has candidates to test candidate and resume endpoints...");
      for (const job of jobs) {
        const cands = await adapter.getCandidatesForJob(job.id);
        if (cands.length > 0) {
          candidates = cands;
          activeJob = job;
          break;
        }
      }

      if (activeJob) {
        console.log(`✅ Success! Found job "${activeJob.title}" with ${candidates.length} candidates.`);

        candidates.slice(0, 3).forEach((cand) => {
          console.log(`- Candidate: ${cand.name} (${cand.email})`);
          console.log(`  ID: ${cand.id}`);
          console.log(`  Stage: ${cand.currentStage || "N/A"}`);
          console.log("-------------------------------------");
        });

        const testCand = candidates[0];
        console.log(`\n🔄 Attempting to fetch resume documents for candidate: ${testCand.name} (${testCand.id})...`);
        const docs = await adapter.getDocuments(testCand.id);
        console.log(`✅ Success! Found ${docs.length} documents.`);
        docs.forEach(doc => {
          console.log(`- File Name: ${doc.title}`);
          console.log(`  Type: ${doc.documentType}`);
          console.log(`  URL: ${doc.fileUrl.substring(0, 80)}...`);
        });

        if (docs.length > 0) {
          console.log(`\n🔄 Testing resume download/buffer retrieval for candidate: ${testCand.name}...`);
          const buffer = await adapter.downloadResume(testCand.id);
          console.log(`✅ Success! Downloaded resume buffer (${buffer.length} bytes).`);
        }
      } else {
        console.log("⚠️ Could not find any jobs with active candidates to test candidate/resume endpoints.");
      }
    }
  } catch (error: any) {
    console.error("❌ Connection Test Failed!");
    console.error(error.message || error);
    process.exit(1);
  }
}

main();
