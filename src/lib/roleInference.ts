// src/lib/roleInference.ts

export function isGenericRoleTitle(title?: string | null): boolean {
  if (!title || !title.trim()) return true;
  const lower = title.toLowerCase().trim();
  if (
    lower === "general applicant" ||
    lower === "not specified" ||
    lower === "candidate" ||
    lower === "unassigned" ||
    lower === "unknown" ||
    lower.endsWith(" role") ||
    lower.includes("applicant") ||
    lower === "software engineer"
  ) {
    return true;
  }
  return false;
}

export function inferCandidateRole(cand: {
  skills?: string[] | null;
  experienceYears?: number | null;
  currentTitle?: string | null;
  role?: string | null;
  name?: string | null;
  recommendation?: string | null;
}): string {
  if (cand.currentTitle && cand.currentTitle.trim()) {
    const t = cand.currentTitle.trim();
    if (!isGenericRoleTitle(t)) return t;
  }

  if (cand.role && cand.role.trim()) {
    const r = cand.role.trim();
    if (!isGenericRoleTitle(r)) return r;
  }

  const skillsList = cand.skills || [];
  const skillsStr = (Array.isArray(skillsList) ? skillsList.join(" ") : String(skillsList)).toLowerCase();
  const exp = Number(cand.experienceYears) || 0;
  const prefix = exp >= 10 ? "Lead " : exp >= 5 ? "Senior " : "";

  if (skillsStr.includes("react") || skillsStr.includes("next.js") || skillsStr.includes("node") || skillsStr.includes("full stack") || skillsStr.includes("fullstack") || skillsStr.includes("typescript")) {
    return `${prefix}Full Stack Engineer`;
  }
  if (skillsStr.includes("python") || skillsStr.includes("django") || skillsStr.includes("fastapi") || skillsStr.includes("data science") || skillsStr.includes("machine learning") || skillsStr.includes("ai")) {
    return `${prefix}Python / AI Engineer`;
  }
  if (skillsStr.includes("java") || skillsStr.includes("spring")) {
    return `${prefix}Java Developer`;
  }
  if (skillsStr.includes("devops") || skillsStr.includes("aws") || skillsStr.includes("docker") || skillsStr.includes("kubernetes") || skillsStr.includes("ci/cd") || skillsStr.includes("cloud")) {
    return `${prefix}DevOps / Cloud Engineer`;
  }
  if (skillsStr.includes("piping") || skillsStr.includes("isometric") || skillsStr.includes("hydrotesting") || skillsStr.includes("e3d") || skillsStr.includes("pipeline")) {
    return `${prefix}Piping Engineer`;
  }
  if (skillsStr.includes("welding") || skillsStr.includes("tig") || skillsStr.includes("arc welding") || skillsStr.includes("fabrication") || skillsStr.includes("erection")) {
    return `${prefix}Fabrication & Welding Specialist`;
  }
  if (skillsStr.includes("ndt") || skillsStr.includes("qa/qc") || skillsStr.includes("dimensional inspection") || skillsStr.includes("quality inspection") || skillsStr.includes("iso 9001")) {
    return `${prefix}QA/QC Quality Engineer`;
  }
  if (skillsStr.includes("creo") || skillsStr.includes("solidworks") || skillsStr.includes("catia") || skillsStr.includes("ansys") || skillsStr.includes("product design") || skillsStr.includes("drafting")) {
    return `${prefix}Design / CAD Engineer`;
  }
  if (skillsStr.includes("electrical") || skillsStr.includes("ht/lt") || skillsStr.includes("transformer") || skillsStr.includes("plc") || skillsStr.includes("scada")) {
    return `${prefix}Electrical Engineer`;
  }
  if (skillsStr.includes("supply chain") || skillsStr.includes("scm") || skillsStr.includes("procurement") || skillsStr.includes("warehouse") || skillsStr.includes("logistics") || skillsStr.includes("purchase")) {
    return `${prefix}Supply Chain / Procurement Specialist`;
  }
  if (skillsStr.includes("front desk") || skillsStr.includes("receptionist") || skillsStr.includes("office management") || skillsStr.includes("guest relations")) {
    return `${prefix}Front Desk Executive`;
  }
  if (skillsStr.includes("qa") || skillsStr.includes("testing") || skillsStr.includes("selenium") || skillsStr.includes("cypress") || skillsStr.includes("automation")) {
    return `${prefix}QA Automation Engineer`;
  }
  if (skillsStr.includes("hr") || skillsStr.includes("recruitment") || skillsStr.includes("payroll") || skillsStr.includes("talent acquisition")) {
    return `${prefix}HR Executive`;
  }
  if (skillsStr.includes("sales") || skillsStr.includes("b2b") || skillsStr.includes("business development") || skillsStr.includes("account executive")) {
    return `${prefix}Sales Executive`;
  }
  if (skillsStr.includes("civil") || skillsStr.includes("construction") || skillsStr.includes("site") || skillsStr.includes("autocad") || skillsStr.includes("structural") || skillsStr.includes("project")) {
    return `${prefix}Project Engineer`;
  }
  if (skillsStr.includes("finance") || skillsStr.includes("accounting") || skillsStr.includes("audit") || skillsStr.includes("gst") || skillsStr.includes("tally")) {
    return `${prefix}Finance & Accounts Specialist`;
  }

  return `${prefix}Project Engineer`;
}
