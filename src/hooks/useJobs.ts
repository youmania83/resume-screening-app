// src/hooks/useJobs.ts
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { JobListItem, StructuredJD } from "../types/index";
import { INITIAL_JOBS, INITIAL_SCM_JD } from "../lib/mockData";

export function useJobs(onJobSaved?: (jd: StructuredJD) => void) {
  const [jobs, setJobs] = useState<JobListItem[]>(INITIAL_JOBS);
  const [activeJD, setActiveJD] = useState<StructuredJD | null>(INITIAL_SCM_JD);
  const [importTab, setImportTab] = useState<"url" | "file" | "text">("url");
  const [importUrl, setImportUrl] = useState("");
  const [jdTextPaste, setJdTextPaste] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [isEditingJD, setIsEditingJD] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const loadJobs = useCallback(async () => {
    try {
      const resp = await fetch(`${apiBase}/jobs`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.jobs)) {
          const mapped: JobListItem[] = data.jobs.map((j: any) => ({
            title: j.title,
            dept: j.department || "Engineering",
            loc: j.location || "Remote",
            exp: j.experience || "Not Specified",
            candidates: j.candidates_count || 0,
            status: j.status || "Active",
            jd: j.jd || {
              title: j.title,
              experience: j.experience,
              department: j.department,
              location: j.location,
              requiredSkills: j.required_skills || [],
              preferredSkills: j.preferred_skills || [],
              education: j.education || "",
              responsibilities: j.responsibilities || [],
              keywords: j.keywords || [],
              screeningCriteria: j.screening_criteria || []
            }
          }));
          setJobs(mapped);
        }
      }
    } catch (e) {
      console.warn("Failed to load jobs from backend, using mocks:", e);
    }
  }, [apiBase]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const saveOrUpdateJob = (jd: StructuredJD) => {
    setJobs(prev => {
      const existsIndex = prev.findIndex(j => j.title.toLowerCase() === jd.title.toLowerCase());
      if (existsIndex >= 0) {
        const updated = [...prev];
        updated[existsIndex] = {
          ...updated[existsIndex],
          title: jd.title,
          dept: jd.department || "Operations",
          loc: jd.location || "Remote",
          exp: jd.experience || "Not Specified",
          jd: jd
        };
        return updated;
      } else {
        return [
          ...prev,
          {
            title: jd.title,
            dept: jd.department || "Operations",
            loc: jd.location || "Remote",
            exp: jd.experience || "Not Specified",
            candidates: 0,
            status: "Active",
            jd: jd
          }
        ];
      }
    });
    if (onJobSaved) {
      onJobSaved(jd);
    }
  };

  const handleJdExtract = async () => {
    if (importTab === "url" && !importUrl) {
      toast.error("Please enter a job description URL.");
      return;
    }
    if (importTab === "text" && !jdTextPaste) {
      toast.error("Please paste the job description text.");
      return;
    }
    if (importTab === "file" && !jdFile) {
      toast.error("Please upload a job description file.");
      return;
    }

    setIsExtracting(true);
    const toastId = toast.loading("AI analyzing and structuring JD vectors...");

    try {
      let body: any;
      if (importTab === "url") {
        body = JSON.stringify({ url: importUrl });
      } else if (importTab === "text") {
        body = JSON.stringify({ text: jdTextPaste });
      } else {
        // File upload mock/sim since next app handles form data
        body = JSON.stringify({ text: `Simulated job details from file: ${jdFile?.name}` });
      }

      const resp = await fetch(`${apiBase}/jobs/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && data.jd) {
          const extractedJD: StructuredJD = data.jd;
          setActiveJD(extractedJD);
          saveOrUpdateJob(extractedJD);
          toast.success("Job description parsed and loaded into active vectors!", { id: toastId });
          setIsExtracting(false);
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to call extract JD API, simulating locally:", e);
    }

    // Local Fallback Simulation
    await new Promise(resolve => setTimeout(resolve, 1500));
    const mockJD: StructuredJD = {
      title: importTab === "url" ? "System Architect" : "React Developer",
      experience: "5-10 Years",
      department: "Engineering",
      location: "Remote",
      requiredSkills: ["Architecture Patterns", "System Design", "Cloud Computing"],
      preferredSkills: ["Kubernetes", "Redis", "BullMQ"],
      education: "Bachelor's Degree in Computer Science",
      responsibilities: ["Design scalable systems", "Review code reviews", "Enforce performance limits"],
      keywords: ["Architect", "Backend", "Scale"],
      screeningCriteria: ["Experience in microservices", "Ability to define APIs"]
    };
    setActiveJD(mockJD);
    saveOrUpdateJob(mockJD);
    toast.success("Job parsed successfully (Local simulation)!", { id: toastId });
    setIsExtracting(false);
  };

  return {
    jobs,
    setJobs,
    activeJD,
    setActiveJD,
    importTab,
    setImportTab,
    importUrl,
    setImportUrl,
    jdTextPaste,
    setJdTextPaste,
    jdFile,
    setJdFile,
    isExtracting,
    isEditingJD,
    setIsEditingJD,
    handleJdExtract,
    saveOrUpdateJob,
    loadJobs
  };
}
