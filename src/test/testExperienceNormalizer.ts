// src/test/testExperienceNormalizer.ts
import { reconcileExperienceData, extractExperienceYearsFromText } from "../lib/experienceNormalizer.js";

console.log("🧪 Testing Experience Normalizer with real candidate screenshot data...");

// Test Case 1: Sayantan Chattopadhyay
// Raw parsed experienceYears = 6.0
// Strengths / Summary text = "The candidate has 8+ years of experience in graphic design..."
const sayantanInput = {
  experienceYears: 6.0,
  recommendation: "The candidate is a skilled graphic designer and motion graphics artist...",
  experienceMatch: "The candidate has 8+ years of experience in graphic design and motion graphics...",
  strengths: [
    "8+ years of professional experience in graphic design and motion graphics",
    "Proficient in a wide range of design software including Adobe Creative Suite, Blender, and Figma"
  ],
  role: "Design Manager"
};

const sayantanResult = reconcileExperienceData(sayantanInput);
console.log("\n--- Candidate 1: Sayantan Chattopadhyay ---");
console.log("Input experienceYears:", sayantanInput.experienceYears);
console.log("Output experienceYears:", sayantanResult.experienceYears);
console.log("Output experienceMatch:", sayantanResult.experienceMatch);
console.log("Output strengths:", sayantanResult.strengths);

if (sayantanResult.experienceYears === 8) {
  console.log("✅ PASS: Sayantan's experienceYears elevated to 8 to match 8+ years narrative!");
} else {
  console.error("❌ FAIL: Expected 8, got", sayantanResult.experienceYears);
  process.exit(1);
}

// Test Case 2: Pavan Kumar M
// Raw parsed experienceYears = 1.0
// Strengths / Summary text = "Over 10 years of hands-on experience in fabrication engineering..."
const pavanInput = {
  experienceYears: 1.0,
  recommendation: "His strong technical background in welding processes makes him a strong candidate...",
  experienceMatch: "Over 10 years of hands-on experience in fabrication engineering, structural fabrication...",
  strengths: [
    "10+ years of extensive experience in fabrication engineering and project execution",
    "Strong supervisory skills"
  ],
  role: "Fabrication Engineer"
};

const pavanResult = reconcileExperienceData(pavanInput);
console.log("\n--- Candidate 2: Pavan Kumar M ---");
console.log("Input experienceYears:", pavanInput.experienceYears);
console.log("Output experienceYears:", pavanResult.experienceYears);
console.log("Output experienceMatch:", pavanResult.experienceMatch);
console.log("Output strengths:", pavanResult.strengths);

if (pavanResult.experienceYears === 10) {
  console.log("✅ PASS: Pavan's experienceYears elevated to 10 to match 10+ years narrative!");
} else {
  console.error("❌ FAIL: Expected 10, got", pavanResult.experienceYears);
  process.exit(1);
}

// Test Case 3: Anurag Singh
// Raw parsed experienceYears = 0.5 (6 months)
// Recommendation text = "Candidate has 6 months of experience as a civil site engineer at Gayatri construction, which aligns with the entry-level requirement of 0-2 years..."
const anuragInput = {
  experienceYears: 0.5,
  recommendation: "Candidate has 6 months of experience as a civil site engineer at Gayatri construction, which aligns with the entry-level requirement of 0-2 years, but lacks specific exposure to CNG/CGD projects.",
  experienceMatch: "Candidate has 6 months of experience as a civil site engineer at Gayatri construction, which aligns with the entry-level requirement of 0-2 years.",
  strengths: [
    "Educational background in civil engineering with a good GPA (8.20)",
    "Basic site supervision experience at a construction company"
  ],
  role: "Project Engineer"
};

const anuragResult = reconcileExperienceData(anuragInput);
console.log("\n--- Candidate 3: Anurag Singh ---");
console.log("Input experienceYears:", anuragInput.experienceYears);
console.log("Output experienceYears:", anuragResult.experienceYears);
console.log("Output experienceMatch:", anuragResult.experienceMatch);

if (anuragResult.experienceYears === 0.5) {
  console.log("✅ PASS: Anurag's experienceYears preserved at 0.5 (6 months) and NOT wrongly elevated to 2!");
} else {
  console.error("❌ FAIL: Expected 0.5, got", anuragResult.experienceYears);
  process.exit(1);
}

console.log("\n🎉 All Experience Normalizer tests passed cleanly!");
process.exit(0);
