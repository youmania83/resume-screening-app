// src/lib/mockData.ts
import { Candidate, StructuredJD, JobListItem } from "../types/index.js";

export const INITIAL_SCM_JD: StructuredJD = {
  title: "SCM Executive",
  experience: "2-5 Years",
  department: "Operations",
  location: "Bengaluru, India",
  requiredSkills: ["Strategic Procurement", "Vendor Management", "SAP / ERP Systems", "Logistics Planning", "Cost Optimization"],
  preferredSkills: ["GST Compliance Audits", "SAP S/4HANA Module"],
  education: "B.Tech Mechanical Engineering with Supply Chain Certification",
  responsibilities: [
    "Negotiate pricing, terms, and contracts with raw material vendors.",
    "Operate SAP/ERP modules to manage purchase requisitions, orders, and receipts.",
    "Standardize inventory and optimize logistics turnaround times.",
    "Audit vendor performance metrics quarterly."
  ],
  keywords: ["SCM", "Procurement", "Logistics", "SAP", "Vendor Sourcing"],
  screeningCriteria: [
    "Has 2+ years of relevant SCM industrial procurement history.",
    "Demonstrates operational familiarity with SAP ERP purchase modules.",
    "Possesses documented cost optimization negotiation benchmarks."
  ]
};

export const INITIAL_FRONTEND_JD: StructuredJD = {
  title: "Senior Frontend Engineer",
  experience: "5-8 Years",
  department: "Engineering",
  location: "San Francisco, CA (Hybrid)",
  requiredSkills: ["React / Next.js", "TypeScript", "Tailwind CSS", "CSS Modules", "Webpack / Turbopack"],
  preferredSkills: ["GraphQL Federation", "React Hook Form", "Node.js (BFF)"],
  education: "B.S. or M.S. in Computer Science or equivalent experience",
  responsibilities: [
    "Architect and build high-performance client-side SaaS applications.",
    "Lead integration of global component designs and styled components.",
    "Collaborate with Product and Design to deliver high-fidelity interfaces.",
    "Improve core web vitals and overall Largest Contentful Paint metrics."
  ],
  keywords: ["Frontend", "React", "Next.js", "TypeScript", "UX Architecture"],
  screeningCriteria: [
    "Has 5+ years building production-scale React SaaS platforms.",
    "Demonstrated expertise with CSS optimization and Tailwind.",
    "Possesses clear understanding of web vital performance bottlenecks."
  ]
};

export const INITIAL_DEVOPS_JD: StructuredJD = {
  title: "DevOps Engineer",
  experience: "3-5 Years",
  department: "Engineering",
  location: "Remote, US",
  requiredSkills: ["AWS Infrastructure", "Terraform", "Docker Containers", "Bash Scripting", "GitHub Actions"],
  preferredSkills: ["Kubernetes (EKS)", "Prometheus & Grafana", "Argocd GitOps"],
  education: "B.S. in Computer Engineering or related field",
  responsibilities: [
    "Deploy, monitor, and scale cloud infrastructure on AWS.",
    "Manage infrastructure as code scripts using Terraform.",
    "Automate deployment and release pipelines (CI/CD).",
    "Ensure application logging and monitoring alerts are highly active."
  ],
  keywords: ["DevOps", "AWS", "Terraform", "Kubernetes", "CI/CD"],
  screeningCriteria: [
    "Has 3+ years managing production AWS environments.",
    "Proficient writing and maintaining Terraform codebases.",
    "Experienced with containerization and build pipelines."
  ]
};

export const INITIAL_JOBS: JobListItem[] = [
  { title: "SCM Executive", dept: "Operations", loc: "Bengaluru, India", exp: "2-5 Yrs", candidates: 8, status: "Active", jd: INITIAL_SCM_JD },
  { title: "Senior Frontend Engineer", dept: "Engineering", loc: "San Francisco, CA (Hybrid)", exp: "5-8 Yrs", candidates: 14, status: "Active", jd: INITIAL_FRONTEND_JD },
  { title: "DevOps Engineer", dept: "Engineering", loc: "Remote, US", exp: "3-5 Yrs", candidates: 2, status: "Active", jd: INITIAL_DEVOPS_JD },
];

export const INITIAL_CANDIDATES: Candidate[] = [
  {
    id: "cand-1",
    name: "Arjun Mehta",
    role: "SCM Executive",
    score: 88,
    matchPercent: 88,
    experienceYears: 6,
    experienceMatch: "6 years directly relevant experience in engineering/industrial procurement; strong SCM execution.",
    recommendation: "Highly suitable candidate with quantified cost savings and robust vendor negotiation history.",
    confidence: "94% (High)",
    riskLevel: "Low",
    strengths: [
      "6 years relevant experience in engineering/industrial procurement",
      "Quantified cost savings of 11% and 28% reduction in TAT",
      "Managed annual spend of 25 Crore and 150+ vendors"
    ],
    weaknesses: [
      "No explicit mention of GST/compliance documentation audits",
      "No recent certifications in SAP S/4HANA (uses older ERP modules)"
    ],
    missingSkills: ["GST Compliance Audits", "SAP S/4HANA Module"],
    matchedSkills: ["Strategic Procurement", "Vendor Management", "SAP / ERP Systems", "Logistics Planning", "Cost Optimization"],
    riskFactors: ["Familiarity only with legacy ERP systems, may require training for newer cloud modules."],
    status: "shortlisted",
    education: "B.Tech Mechanical Engineering with Supply Chain Certification",
    email: "arjun.mehta@techsol.com",
    phone: "+91 98765 43210",
    appliedDate: "2026-06-12"
  },
  {
    id: "cand-2",
    name: "Sarah Jenkins",
    role: "Senior Frontend Engineer",
    score: 94,
    matchPercent: 94,
    experienceYears: 7,
    experienceMatch: "7 years building complex SaaS dashboards; expert in React, Next.js, and design systems.",
    recommendation: "Exceptional frontend engineer. Very strong alignment with our technical stack and team values.",
    confidence: "98% (High)",
    riskLevel: "Low",
    strengths: [
      "Lead architect for core design system migration used by 40+ devs",
      "Deep expertise in React 19, TypeScript, and webpack/turbopack configs",
      "Proven track record of improving LCP core web vitals by 45%"
    ],
    weaknesses: [
      "No direct production experience with GraphQL federated architectures",
      "Limited exposure to Node.js backend development"
    ],
    missingSkills: ["GraphQL Federation", "Node.js REST APIs"],
    matchedSkills: ["React / Next.js", "TypeScript", "Tailwind CSS", "Web Performance", "Component Design", "Jest / Testing Library"],
    riskFactors: ["Primarily client-side focused; will need ramp-up on backend-for-frontend service layers."],
    status: "interviewing",
    education: "B.S. in Computer Science — Stanford University",
    email: "sarah.jenkins@example.com",
    phone: "+1 (555) 019-2834",
    appliedDate: "2026-06-14"
  },
  {
    id: "cand-3",
    name: "David Chen",
    role: "DevOps Engineer",
    score: 76,
    matchPercent: 78,
    experienceYears: 4,
    experienceMatch: "4 years experience managing AWS and Docker infrastructure.",
    recommendation: "Solid engineer with strong core DevOps experience. Good fit for infrastructure automation.",
    confidence: "85% (Medium)",
    riskLevel: "Low",
    strengths: [
      "Hands-on experience deploying Kubernetes in production",
      "Proficient in Terraform for Infrastructure as Code"
    ],
    weaknesses: [
      "No deep experience with advanced multi-region failovers"
    ],
    missingSkills: ["Kubernetes (EKS)", "Argocd GitOps"],
    matchedSkills: ["AWS Infrastructure", "Terraform", "Docker Containers", "Bash Scripting", "GitHub Actions"],
    riskFactors: ["Requires supervision for highly complex cross-region networking setups."],
    status: "applied",
    education: "B.S. in Computer Engineering",
    email: "david.chen@example.com",
    phone: "+1 (555) 019-5678",
    appliedDate: "2026-06-15"
  }
];
