// src/hooks/useJobs.ts
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { JobListItem, StructuredJD } from "../types/index";

export function useJobs(isLoggedIn?: boolean, onJobSaved?: (jd: StructuredJD) => void) {
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [activeJD, setActiveJD] = useState<StructuredJD | null>(null);
  const [importTab, setImportTab] = useState<"url" | "file" | "text">("url");
  const [importUrl, setImportUrl] = useState("");
  const [jdTextPaste, setJdTextPaste] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [isEditingJD, setIsEditingJD] = useState(false);
  const [isSyncingKeka, setIsSyncingKeka] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://api.risonaitech.com/api";

  const loadJobs = useCallback(async () => {
    try {
      const resp = await fetch(`${apiBase}/jobs`, { credentials: "include" });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.jobs)) {
          const mapped: JobListItem[] = data.jobs.filter((j: any) => j.title && j.title !== "Not Specified" && j.title !== "Not specified").map((c: any) => {
            let parsedJd = null;
            if (c.jd) {
              parsedJd = typeof c.jd === "string" ? JSON.parse(c.jd) : c.jd;
            }
            const cleanDept = (c.department && !/not specified/i.test(c.department)) ? c.department : "Engineering";
            const cleanLoc = (c.location && !/not specified/i.test(c.location) && c.location !== "null") ? c.location : "Bengaluru / Remote";
            const cleanExp = (c.experience_required && !/not specified/i.test(c.experience_required) && c.experience_required !== "null") ? c.experience_required : (c.experience && !/not specified/i.test(c.experience) ? c.experience : "1-3 Years");

            return {
              id: c.id,
              title: c.title,
              dept: cleanDept,
              loc: cleanLoc,
              exp: cleanExp,
              candidates: c.candidates_count || 0,
              status: c.status || "Active",
              jobCode: c.job_code || undefined,
              lastSyncedAt: c.last_synced_at || undefined,
              syncStatus: c.sync_status || undefined,
              jd: parsedJd || {
                title: c.title,
                experience: cleanExp,
                department: cleanDept,
                location: cleanLoc,
                requiredSkills: c.skills || [],
                preferredSkills: [],
                education: "",
                responsibilities: c.description ? [c.description] : [],
                keywords: [],
                screeningCriteria: []
              }
            };
          });
          setJobs(mapped);
        }
      }
    } catch (e) {
      console.error("Failed to load jobs from backend:", e);
    }
  }, [apiBase]);

  useEffect(() => {
    if (isLoggedIn) {
      loadJobs();
      const interval = setInterval(() => {
        loadJobs();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [loadJobs, isLoggedIn]);

  const saveOrUpdateJob = async (jd: StructuredJD) => {
    const previousJobs = [...jobs];
    const previousActiveJD = activeJD;

    const existingJob = jobs.find(j => j.title.toLowerCase() === jd.title.toLowerCase());
    const descText = jd.responsibilities?.join("\n") || jd.title || "No description provided";

    // Optimistic Update
    const optimisticJob: JobListItem = {
      id: existingJob?.id || `job-opt-${Date.now()}`,
      title: jd.title,
      dept: jd.department || "Engineering",
      loc: jd.location || "Remote",
      exp: jd.experience || "Not Specified",
      candidates: existingJob?.candidates || 0,
      status: existingJob?.status || "Active",
      jobCode: existingJob?.jobCode,
      lastSyncedAt: existingJob?.lastSyncedAt,
      syncStatus: existingJob?.syncStatus,
      jd: jd
    };

    if (existingJob) {
      setJobs(prev => prev.map(j => j.id === existingJob.id ? optimisticJob : j));
    } else {
      setJobs(prev => [optimisticJob, ...prev]);
    }
    setActiveJD(jd);

    const body = {
      title: jd.title,
      description: descText,
      department: jd.department || "Engineering",
      location: jd.location || "Remote",
      experienceRequired: jd.experience || "Not Specified",
      skills: jd.requiredSkills || [],
      jd: jd
    };

    try {
      if (existingJob && existingJob.id) {
        const res = await fetch(`${apiBase}/jobs/${existingJob.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include"
        });
        if (res.ok) {
          toast.success(`Job "${jd.title}" updated successfully.`);
        } else {
          throw new Error("Failed to update job");
        }
      } else {
        const res = await fetch(`${apiBase}/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include"
        });
        if (res.ok) {
          toast.success(`Job "${jd.title}" saved to database.`);
        } else {
          throw new Error("Failed to save job");
        }
      }

      await loadJobs();

      if (onJobSaved) {
        onJobSaved(jd);
      }
    } catch (err) {
      console.error("Failed to save job to database, rolling back:", err);
      setJobs(previousJobs);
      setActiveJD(previousActiveJD);
      toast.error("Network error while saving job. Rolled back.");
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
        body,
        credentials: "include"
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
      console.error("Failed to call extract JD API:", e);
    }

    // Show error — do NOT create fake fallback data
    toast.error("Failed to extract job description. Please check the URL/text and try again.", { id: toastId });
    setIsExtracting(false);
  };

  const syncKekaJobs = async () => {
    setIsSyncingKeka(true);
    const toastId = toast.loading("Syncing active jobs from Keka Careers...");
    try {
      const resp = await fetch(`${apiBase}/integrations/keka/sync`, {
        method: "POST",
        credentials: "include"
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.success) {
          toast.success(`Successfully synced ${data.syncedCount} jobs from Keka!`, { id: toastId });
          await loadJobs();
        } else {
          toast.error(`Sync failed: ${data.error || "Unknown error"}`, { id: toastId });
        }
      } else {
        toast.error("Failed to connect to sync endpoint.", { id: toastId });
      }
    } catch (e: any) {
      toast.error(`Connection error: ${e.message}`, { id: toastId });
    } finally {
      setIsSyncingKeka(false);
    }
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
    loadJobs,
    isSyncingKeka,
    syncKekaJobs
  };
}
