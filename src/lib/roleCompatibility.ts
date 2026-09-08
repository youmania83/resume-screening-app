// src/lib/roleCompatibility.ts
//
// Role-family classification and cross-family compatibility guard.
//
// PURPOSE
// -------
// The heuristic keyword-matching engine in resumeWorker.ts can score a Welder
// resume above the shortlist threshold for a "Senior Proposal Engineer" opening
// because generic tokens (steel, project, installation, pipe) appear in both the
// resume and the JD.  This module adds a title-level sanity check that is
// entirely independent of keyword overlap: if the candidate's professional role
// belongs to a different family from the job title, the match is capped well
// below the shortlisting threshold — regardless of keyword score.
//
// USAGE
// -----
//   import { getRoleFamilyScore } from "./roleCompatibility.js";
//   const compat = getRoleFamilyScore(candidateTitle, jobTitle);
//   // compat: 0–100 (100 = same family, 0 = completely incompatible)

export type RoleFamily =
  | "trades"          // Welder, Fitter, Machinist, Rigger, Painter, Helper
  | "engineering"     // Civil, Mechanical, Structural, Proposal, Design Engineer
  | "it_software"     // Developer, DevOps, Data Scientist, QA Automation
  | "management"      // Manager, Director, VP, Head, Lead (non-technical)
  | "admin_hr"        // HR, Receptionist, Office Admin, Payroll
  | "sales_bizdev"    // Sales, Business Development, Account Executive
  | "qa_inspection"   // QA/QC Inspector, NDT Technician (site quality)
  | "finance"         // Finance, Accounting, Audit, Taxation
  | "supply_chain"    // SCM, Procurement, Warehouse, Logistics
  | "unknown";        // Could not classify — treated as neutral

// ---------------------------------------------------------------------------
// 1. Role-family keyword maps
// ---------------------------------------------------------------------------
// Each entry is a list of lowercase substrings/phrases. A title is assigned to
// a family when ANY of its keywords appear as a word-boundary match.
// More specific families are tested first to avoid false positives.
// ---------------------------------------------------------------------------

const FAMILY_KEYWORDS: Record<RoleFamily, string[]> = {
  trades: [
    "welder", "welding", "fitter", "fabricat", "rigger", "scaffolding",
    "painter", "mason", "carpenter", "electrician helper", "helper",
    "machinist", "millwright", "boilermaker", "sheet metal worker",
    "pipe fitter", "pipefitter", "plumber", "ironworker", "concrete worker",
    "crane operator", "forklift operator", "insulator", "blaster",
    "tig welder", "mig welder", "arc welder"
  ],
  engineering: [
    "engineer", "engineering", "proposal engineer", "structural engineer",
    "design engineer", "project engineer", "civil engineer", "mechanical engineer",
    "process engineer", "piping engineer", "hvac engineer", "electrical engineer",
    "instrumentation engineer", "control engineer", "production engineer",
    "r&d engineer", "commissioning engineer", "site engineer", "planning engineer",
    "estimation engineer", "cost engineer"
  ],
  it_software: [
    "developer", "software", "programmer", "devops", "data scientist",
    "data engineer", "machine learning", "ai engineer", "cloud architect",
    "full stack", "frontend", "backend", "react", "node.js", "python developer",
    "java developer", "qa automation", "test engineer", "sre", "platform engineer",
    "cybersecurity", "network engineer", "system administrator", "dba",
    "database administrator"
  ],
  management: [
    "manager", "director", "vp ", "vice president", "ceo", "cto", "coo", "cfo",
    "head of", "general manager", "country head", "regional head", "team lead",
    "operations head", "delivery manager", "program manager", "portfolio manager"
  ],
  admin_hr: [
    "human resources", "hr ", "recruitment", "talent acquisition", "payroll",
    "receptionist", "front desk", "office admin", "office manager",
    "executive assistant", "administrative assistant", "secretary",
    "office coordinator", "personal assistant"
  ],
  sales_bizdev: [
    "sales", "business development", "account executive", "account manager",
    "client relations", "customer success", "pre-sales", "presales",
    "inside sales", "field sales", "channel sales", "territory manager",
    "revenue", "lead generation"
  ],
  qa_inspection: [
    "qa/qc", "quality inspector", "ndt", "non destructive", "quality control",
    "quality assurance inspector", "dimensional inspection", "weld inspector",
    "paint inspector", "coating inspector", "third party inspection"
  ],
  finance: [
    "finance", "financial analyst", "accountant", "accounting", "auditor",
    "taxation", "gst", "tally", "chartered accountant", "cost accountant",
    "treasury", "controller", "bookkeeper"
  ],
  supply_chain: [
    "supply chain", "scm", "procurement", "buyer", "purchasing", "logistics",
    "warehouse", "inventory", "stores", "material", "import", "export",
    "customs", "freight", "dispatch", "expeditor"
  ],
  unknown: []
};

// Cross-family compatibility matrix.
// Values represent how compatible (0–100) a candidate of family A is for a
// job in family B. Symmetric pairs that are genuinely cross-functional get a
// moderate score; clearly incompatible pairs get 0.
//
//  100 = identical family
//   70 = adjacent/overlapping (e.g., engineering ↔ management for Sr roles)
//   40 = stretch — possible but needs HR review
//    0 = completely different domain — never auto-shortlist
const COMPAT_MATRIX: Partial<Record<RoleFamily, Partial<Record<RoleFamily, number>>>> = {
  trades: {
    trades: 100,
    engineering: 10,   // Welder → Proposal Engineer is NOT compatible
    qa_inspection: 45, // A skilled welder inspector could do site QA/QC (borderline)
    management: 5,
    it_software: 0,
    admin_hr: 0,
    sales_bizdev: 5,
    finance: 0,
    supply_chain: 10,
    unknown: 50
  },
  engineering: {
    engineering: 100,
    trades: 10,
    management: 70,    // Senior Engineers often move into management
    qa_inspection: 55, // Engineering experience is relevant to QA/QC roles
    it_software: 40,   // CAD/software tools overlap at senior level
    supply_chain: 40,  // Technical procurement roles
    sales_bizdev: 45,  // Pre-sales / solution engineering
    admin_hr: 0,
    finance: 10,
    unknown: 50
  },
  it_software: {
    it_software: 100,
    engineering: 40,
    management: 65,
    qa_inspection: 50,
    sales_bizdev: 45,
    admin_hr: 10,
    finance: 20,
    supply_chain: 20,
    trades: 0,
    unknown: 50
  },
  management: {
    management: 100,
    engineering: 70,
    it_software: 65,
    sales_bizdev: 65,
    finance: 60,
    supply_chain: 60,
    qa_inspection: 50,
    admin_hr: 40,
    trades: 5,
    unknown: 50
  },
  admin_hr: {
    admin_hr: 100,
    management: 40,
    finance: 35,
    sales_bizdev: 30,
    supply_chain: 30,
    engineering: 0,
    it_software: 10,
    qa_inspection: 0,
    trades: 0,
    unknown: 50
  },
  sales_bizdev: {
    sales_bizdev: 100,
    management: 65,
    engineering: 45,
    it_software: 45,
    finance: 30,
    supply_chain: 35,
    admin_hr: 30,
    qa_inspection: 5,
    trades: 5,
    unknown: 50
  },
  qa_inspection: {
    qa_inspection: 100,
    engineering: 55,
    trades: 45,
    management: 50,
    it_software: 50,
    supply_chain: 30,
    sales_bizdev: 5,
    admin_hr: 0,
    finance: 0,
    unknown: 50
  },
  finance: {
    finance: 100,
    management: 60,
    admin_hr: 35,
    supply_chain: 35,
    sales_bizdev: 30,
    engineering: 10,
    it_software: 20,
    qa_inspection: 0,
    trades: 0,
    unknown: 50
  },
  supply_chain: {
    supply_chain: 100,
    management: 60,
    engineering: 40,
    finance: 35,
    admin_hr: 30,
    sales_bizdev: 35,
    qa_inspection: 30,
    it_software: 20,
    trades: 10,
    unknown: 50
  },
  unknown: {
    unknown: 70, // Both unknown = neutral, do not penalise
    trades: 50,
    engineering: 50,
    it_software: 50,
    management: 50,
    admin_hr: 50,
    sales_bizdev: 50,
    qa_inspection: 50,
    finance: 50,
    supply_chain: 50
  }
};

// ---------------------------------------------------------------------------
// 2. Title → Family classifier
// ---------------------------------------------------------------------------

/**
 * Classifies a free-text job/candidate title into a role family.
 *
 * Returns "unknown" when the title is blank or cannot be classified.
 * More specific families (trades, it_software) are tested before broader ones
 * (engineering, management) to avoid "electrical engineer" being classified
 * as "trades" just because the title contains "electrical".
 */
export function classifyRoleFamily(title: string | null | undefined): RoleFamily {
  if (!title || !title.trim()) return "unknown";

  const lower = title.toLowerCase().trim();

  // Ordered from most-specific to most-generic to avoid mis-classification.
  const checkOrder: RoleFamily[] = [
    "trades",
    "qa_inspection",
    "it_software",
    "admin_hr",
    "finance",
    "supply_chain",
    "sales_bizdev",
    "engineering",
    "management"
  ];

  for (const family of checkOrder) {
    const keywords = FAMILY_KEYWORDS[family];
    for (const kw of keywords) {
      // Word-boundary-aware check: the keyword must appear as a whole phrase or
      // at a word boundary, not just as a substring of another word.
      const wordBoundaryRegex = new RegExp(
        `(^|[\\s\\-\\/,])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[\\s\\-\\/,])`,
        "i"
      );
      if (wordBoundaryRegex.test(lower) || lower.includes(kw)) {
        return family;
      }
    }
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// 3. Public API
// ---------------------------------------------------------------------------

/**
 * Returns a role-compatibility score (0–100) between a candidate's current
 * title and the target job title.
 *
 * - 100  → same role family (always safe to match)
 * -  70+ → adjacent families (can match with normal threshold)
 * -  40–69 → stretch match (needs a higher score gate or HR review)
 * -   0–39 → cross-domain mismatch (never auto-shortlist)
 *
 * Both titles being "unknown" returns 70 (neutral — don't penalise
 * candidates whose titles the system can't classify).
 */
export function getRoleFamilyScore(
  candidateTitle: string | null | undefined,
  jobTitle: string | null | undefined
): number {
  const candidateFamily = classifyRoleFamily(candidateTitle);
  const jobFamily = classifyRoleFamily(jobTitle);

  const row = COMPAT_MATRIX[candidateFamily] ?? {};
  const score = row[jobFamily];

  if (score === undefined) {
    // Family pair not in matrix — return neutral-ish value
    return candidateFamily === jobFamily ? 100 : 50;
  }

  return score;
}

/**
 * Returns true if the candidate's role is compatible enough with the job
 * for automated shortlisting (i.e., the portal should not send an assessment
 * invite to a candidate whose role family is clearly different from the job).
 *
 * Threshold: ≥ 60 — allows adjacent families (engineering ↔ management)
 * while blocking cross-domain cases (trades ↔ engineering).
 */
export const ROLE_COMPAT_SHORTLIST_THRESHOLD = 60;

export function isRoleCompatibleForShortlisting(
  candidateTitle: string | null | undefined,
  jobTitle: string | null | undefined
): boolean {
  return getRoleFamilyScore(candidateTitle, jobTitle) >= ROLE_COMPAT_SHORTLIST_THRESHOLD;
}

/**
 * Returns true if the candidate's role is in the same broad domain as the job,
 * making it eligible for automated job mapping (a lower bar than shortlisting).
 *
 * Threshold: ≥ 40
 */
export const ROLE_COMPAT_MAPPING_THRESHOLD = 40;

export function isRoleCompatibleForMapping(
  candidateTitle: string | null | undefined,
  jobTitle: string | null | undefined
): boolean {
  return getRoleFamilyScore(candidateTitle, jobTitle) >= ROLE_COMPAT_MAPPING_THRESHOLD;
}
