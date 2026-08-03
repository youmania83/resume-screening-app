// src/test/testEndToEndRootPipeline.ts
import { calculateExperienceFromDateSpans, extractExperienceYearsFromText, reconcileExperienceData } from "../lib/experienceNormalizer.js";
import { cleanCandidateName } from "../lib/nameSanitizer.js";
import { calculatePrecisionCandidateScore } from "../lib/scoreCalculator.js";

async function runTests() {
  console.log("================================================================================");
  console.log("🧪 Running Root-Level Recruitment Pipeline Verification Suite");
  console.log("================================================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${testName}`);
      failed++;
    }
  }

  // Test 1: Date-Span Experience Calculation
  const resumeText1 = `
    WORK EXPERIENCE
    Senior Project Engineer | Techsol Engineers (Jan 2018 - Mar 2024)
    Designed and implemented automation projects across India.
    Project Trainee (June 2015 - Dec 2017)
  `;
  const expFromDates = calculateExperienceFromDateSpans(resumeText1);
  assert(expFromDates >= 8.5 && expFromDates <= 9.0, `Date-span calculation parses 2015-2024 as ~8.7 years (Got: ${expFromDates})`);

  // Test 2: Prose Experience Claims
  const text2 = "Candidate brings documented 10+ years of hands-on project management experience.";
  const expFromProse = extractExperienceYearsFromText(text2);
  assert(expFromProse === 10, `Prose extraction captures 10+ years (Got: ${expFromProse})`);

  // Test 3: Experience Reconciliation
  const reconciled = reconcileExperienceData({
    experienceYears: 1.0, // parsed was incorrectly 1
    recommendation: "Candidate has 8+ years of graphic design and technical expertise.",
    strengths: ["8+ years of industry experience"],
    experienceMatch: "1.0 Years recorded",
    rawText: resumeText1
  });
  assert(reconciled.experienceYears >= 8.5, `Experience reconciliation elevates 1.0 -> >=8.5 years (Got: ${reconciled.experienceYears})`);

  // Test 4: Name Recovery & Sanitization
  const name1 = cleanCandidateName("Candidate Name Not Found", "sayantan.chattopadhyay@gmail.com", "");
  assert(name1 === "Sayantan Chattopadhyay", `Recovers clean name from email handle (Got: "${name1}")`);

  const name2 = cleanCandidateName("UNKNOWN CANDIDATE", "ruhaniparihar@gmail.com", "Ruhani Parihar\nSenior Designer");
  assert(name2 === "Ruhani Parihar", `Recovers name from email handle or header when placeholder provided (Got: "${name2}")`);

  // Test 5: Precision AI Score Calculator
  const score1 = calculatePrecisionCandidateScore({
    candidateExperienceYears: 8.5,
    requiredExperienceText: "5 Years",
    candidateSkills: ["AutoCAD", "PLC", "SCADA", "Project Management"],
    jobRequiredSkills: ["AutoCAD", "PLC"],
    candidateRole: "Project Engineer",
    jobTitle: "Project Engineer",
    baseAiScore: 75
  });
  assert(score1 >= 80, `Precision AI Score calculates >= 80% for qualified candidate with 8.5 yrs exp (Got: ${score1})`);

  console.log("================================================================================");
  console.log(`📊 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("================================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
