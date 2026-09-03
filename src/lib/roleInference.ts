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
  const skillsList = cand.skills || [];
  const skillsStr = (Array.isArray(skillsList) ? skillsList.join(" ") : String(skillsList)).toLowerCase();
  const exp = Number(cand.experienceYears) || 0;
  const prefix = exp >= 10 ? "Lead " : exp >= 5 ? "Senior " : "";

  const hasKw = (kw: string) => {
    if (kw.length <= 3) {
      const regex = new RegExp(`\\b${kw}\\b`, "i");
      return regex.test(skillsStr);
    }
    return skillsStr.includes(kw);
  };

  if (hasKw("react") || hasKw("next.js") || hasKw("node") || hasKw("full stack") || hasKw("fullstack") || hasKw("typescript")) {
    return `${prefix}Full Stack Engineer`;
  }
  if (hasKw("python") || hasKw("django") || hasKw("fastapi") || hasKw("data science") || hasKw("machine learning") || hasKw("ai") || hasKw("deep learning") || hasKw("artificial intelligence")) {
    return `${prefix}Python / AI Engineer`;
  }
  if (hasKw("java") || hasKw("spring")) {
    return `${prefix}Java Developer`;
  }
  if (hasKw("devops") || hasKw("aws") || hasKw("docker") || hasKw("kubernetes") || hasKw("ci/cd") || hasKw("cloud")) {
    return `${prefix}DevOps / Cloud Engineer`;
  }
  if (hasKw("piping") || hasKw("isometric") || hasKw("hydrotesting") || hasKw("e3d") || hasKw("pipeline") || hasKw("piping installation")) {
    return `${prefix}Piping Engineer`;
  }
  if (hasKw("welding") || hasKw("tig") || hasKw("arc welding") || hasKw("fabrication") || hasKw("erection")) {
    return `${prefix}Fabrication & Welding Specialist`;
  }
  if (hasKw("ndt") || hasKw("qa/qc") || hasKw("dimensional inspection") || hasKw("quality inspection") || hasKw("iso 9001")) {
    return `${prefix}QA/QC Quality Engineer`;
  }
  if (hasKw("creo") || hasKw("solidworks") || hasKw("catia") || hasKw("ansys") || hasKw("product design") || hasKw("drafting")) {
    return `${prefix}Design / CAD Engineer`;
  }
  if (hasKw("electrical") || hasKw("ht/lt") || hasKw("transformer") || hasKw("plc") || hasKw("scada")) {
    return `${prefix}Electrical Engineer`;
  }
  if (hasKw("supply chain") || hasKw("scm") || hasKw("procurement") || hasKw("warehouse") || hasKw("logistics") || hasKw("purchase")) {
    return `${prefix}Supply Chain / Procurement Specialist`;
  }
  if (hasKw("front desk") || hasKw("receptionist") || hasKw("office management") || hasKw("guest relations")) {
    return `${prefix}Front Desk Executive`;
  }
  if (hasKw("qa") || hasKw("testing") || hasKw("selenium") || hasKw("cypress") || hasKw("automation")) {
    return `${prefix}QA Automation Engineer`;
  }
  if (hasKw("hr") || hasKw("recruitment") || hasKw("payroll") || hasKw("talent acquisition")) {
    return `${prefix}HR Executive`;
  }
  if (hasKw("sales") || hasKw("b2b") || hasKw("business development") || hasKw("account executive")) {
    return `${prefix}Sales Executive`;
  }
  if (hasKw("civil") || hasKw("construction") || hasKw("site") || hasKw("autocad") || hasKw("structural") || hasKw("project")) {
    return `${prefix}Project Engineer`;
  }
  if (hasKw("finance") || hasKw("accounting") || hasKw("audit") || hasKw("gst") || hasKw("tally")) {
    return `${prefix}Finance & Accounts Specialist`;
  }

  if (cand.currentTitle && !isGenericRoleTitle(cand.currentTitle)) {
    return cand.currentTitle.trim();
  }
  if (cand.role && !isGenericRoleTitle(cand.role)) {
    return cand.role.trim();
  }

  return `${prefix}Project Engineer`;
}
