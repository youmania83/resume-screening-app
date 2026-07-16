// src/hooks/useIngestionPipeline.ts
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Candidate, StructuredJD } from "../types/index";

interface IngestionPipelineProps {
  activeJD: StructuredJD | null;
  setCandidates: React.Dispatch<React.SetStateAction<Candidate[]>>;
  setSelectedCandidate: (candidate: Candidate | null) => void;
  setCredits: React.Dispatch<React.SetStateAction<number>>;
}

export function useIngestionPipeline({
  activeJD,
  setCandidates,
  setSelectedCandidate,
  setCredits
}: IngestionPipelineProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [screeningQueue, setScreeningQueue] = useState<any[]>([]);
  const [isIngesting, setIsIngesting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute("webkitdirectory", "");
      folderInputRef.current.setAttribute("directory", "");
    }
  }, []);

  const traverseFileTree = (entry: any): Promise<File[]> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((file: File) => {
          resolve([file]);
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        let allFiles: File[] = [];

        const readEntries = () => {
          dirReader.readEntries(async (entries: any[]) => {
            if (entries.length === 0) {
              resolve(allFiles);
            } else {
              const filePromises = entries.map(e => traverseFileTree(e));
              const nestedFiles = await Promise.all(filePromises);
              allFiles.push(...nestedFiles.flat());
              readEntries();
            }
          });
        };
        readEntries();
      } else {
        resolve([]);
      }
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const items = Array.from(e.dataTransfer.items);
      const entryPromises = items.map(item => {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          return traverseFileTree(entry);
        }
        return Promise.resolve([]);
      });
      const filesLists = await Promise.all(entryPromises);
      const allFiles = filesLists.flat();
      if (allFiles.length > 0) {
        processUploadedFiles(allFiles);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFiles(Array.from(e.target.files));
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFiles(Array.from(e.target.files));
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const triggerFolderSelect = () => {
    folderInputRef.current?.click();
  };

  const runEvaluationPipelineWithSource = async (queueItem: any, file: File, source: string) => {
    // Stage 1: Parsing
    await new Promise(resolve => setTimeout(resolve, 1000));
    setScreeningQueue(prev => prev.map(item =>
      item.id === queueItem.id ? { ...item, progress: 60, status: "scoring" } : item
    ));

    // Stage 2: Scoring
    await new Promise(resolve => setTimeout(resolve, 1500));

    let candidateData: Candidate;

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://api.risonaitech.com/api";
      const clientId = localStorage.getItem("rison_client_id") || "client_youmania83";

      const formData = new FormData();
      formData.append("file", file);
      formData.append("jobDescription", JSON.stringify(activeJD));
      formData.append("applicationSource", source);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout to allow DeepSeek reasoning to finish

      const evalResp = await fetch(`${apiBase}/evaluate`, {
        method: "POST",
        headers: { "X-Client-ID": clientId },
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!evalResp.ok) {
        const errData = await evalResp.json().catch(() => ({ error: `Server returned status ${evalResp.status}` }));
        const errMsg = errData.error || errData.message || `HTTP ${evalResp.status}`;
        throw new Error(errMsg);
      }

      const evalData = await evalResp.json();
      if (!evalData.success || !evalData.candidate) {
        throw new Error(evalData.error || "Invalid response structure from server");
      }

      candidateData = {
        ...evalData.candidate,
        status: evalData.candidate.status || "applied",
        appliedDate: evalData.candidate.appliedDate || new Date().toISOString().split("T")[0]
      };

      if (candidateData.score < 80) {
        toast.error(`Auto-Rejected: ${candidateData.name} scored ${candidateData.score}% (Threshold: 80%)`);
      } else {
        toast.success(`Assessment Invitation Sent: ${candidateData.name} scored ${candidateData.score}%!`);
      }

      setCandidates(prev => [candidateData, ...prev]);
      setSelectedCandidate(candidateData);
      setScreeningQueue(prev => prev.filter(item => item.id !== queueItem.id));
      setCredits(prev => Math.max(0, prev - 3));
      return;
    } catch (err: any) {
      console.error("Evaluation pipeline failed:", err);
      const errorMessage = err.name === "AbortError" 
        ? "Timeout: DeepSeek API took too long to respond." 
        : (err.message || "Failed to parse resume");

      setScreeningQueue(prev => prev.map(item =>
        item.id === queueItem.id ? { ...item, progress: 100, status: "error", error: errorMessage } : item
      ));
      toast.error(`Ingestion failed: ${errorMessage}`);
      return;
    }

    // Fallback Mock Ingestion logic if API is unreachable
    const score = Math.floor(Math.random() * 40) + 50; // 50 to 90
    const generatedName = queueItem.name;
    const appliedDate = new Date().toISOString().split("T")[0];

    const status = score < 80 ? "rejected" : "shortlisted";
    const kekaStatus = score < 80 ? "rejected_pool" : "active";
    const logMessage = score < 80
      ? `Candidate automatically rejected (Score ${score}/100 < 80). Moved to Rejected Pool.`
      : `Candidate details logged (Score ${score}/100 >= 80). Assessment invitation automatically sent via email.`;

    candidateData = {
      id: `cand-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: generatedName,
      role: activeJD?.title || "Staff Evaluated Candidate",
      score: score,
      matchPercent: score,
      experienceYears: Math.floor(Math.random() * 5) + 2,
      experienceMatch: "Candidate has solid background matching the active JD.",
      recommendation: `Recommended for ${score >= 80 ? "assessment" : "review later"}.`,
      confidence: "88% (Medium)",
      riskLevel: score >= 85 ? "Low" : "Medium",
      strengths: ["Strong domain familiarity", "Clear communication skill"],
      weaknesses: ["Missing specific enterprise module certificates"],
      missingSkills: [activeJD?.requiredSkills?.[3] || "Advanced Tool"],
      matchedSkills: [activeJD?.requiredSkills?.[0] || "Basics", activeJD?.requiredSkills?.[1] || "Process"],
      skills: activeJD?.requiredSkills || [],
      certifications: ["Standard Training Certificate"],
      projects: ["Enterprise Integration Project"],
      keywords: activeJD?.keywords || [],
      riskFactors: [],
      status: status,
      applicationSource: source,
      kekaStatus: kekaStatus,
      appliedDate: appliedDate,
      education: activeJD?.education || "Bachelor's Degree",
      email: `${generatedName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      phone: "+91 99887 76655",
      activityLogs: [
        { date: new Date().toISOString(), message: `Application received through ${source}` },
        { date: new Date().toISOString(), message: `AI resume parsing complete.` },
        { date: new Date().toISOString(), message: `JD Matching & AI Scoring: Overall score is ${score}/100.` },
        { date: new Date().toISOString(), message: logMessage }
      ]
    };

    setCandidates(prev => [candidateData, ...prev]);
    setSelectedCandidate(candidateData);
    setScreeningQueue(prev => prev.filter(item => item.id !== queueItem.id));
    setCredits(prev => Math.max(0, prev - 3));
    toast.success(`Screening complete: ${candidateData.name} (${candidateData.score}%)`);
  };

  const processUploadedFiles = async (files: File[]) => {
    if (!activeJD) {
      toast.error("Please import or save a Job Description profile before screening candidates.");
      return;
    }

    let JSZipModule: any = null;
    try {
      JSZipModule = (await import("jszip")).default;
    } catch (e) {
      console.error("Failed to load JSZip:", e);
    }

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "zip") {
        if (!JSZipModule) {
          toast.error("ZIP support is not loaded yet. Please try again in a moment.");
          continue;
        }

        toast.info(`Extracting resumes from ZIP: ${file.name}...`);
        try {
          const zip = new JSZipModule();
          const contents = await zip.loadAsync(file);
          const extractedFiles: File[] = [];

          for (const [filename, rawEntry] of Object.entries(contents.files)) {
            const fileEntry = rawEntry as any;
            if (!fileEntry.dir) {
              const fileExt = filename.split(".").pop()?.toLowerCase();
              if (fileExt === "pdf" || fileExt === "docx") {
                const fileData = await fileEntry.async("blob");
                const baseName = filename.split("/").pop() || filename;
                const extractedFile = new File([fileData], baseName, {
                  type: fileExt === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                });
                extractedFiles.push(extractedFile);
              }
            }
          }

          if (extractedFiles.length === 0) {
            toast.error(`No PDF or DOCX resumes found inside ZIP: ${file.name}`);
          } else {
            toast.success(`Extracted ${extractedFiles.length} resumes from ${file.name}. Starting screening...`);
            processUploadedFiles(extractedFiles);
          }
        } catch (err) {
          console.error("Failed to unzip file:", err);
          toast.error(`Failed to extract ZIP archive: ${file.name}`);
        }
        continue;
      }

      if (ext !== "pdf" && ext !== "docx") {
        toast.error(`"${file.name}" ignored. Only PDF, DOCX, and ZIP archives are supported.`);
        continue;
      }

      const fileId = `${file.name}-${Date.now()}`;
      setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));

      let prog = 0;
      const interval = setInterval(() => {
        prog += 20;
        setUploadProgress(prev => ({ ...prev, [fileId]: prog }));
        if (prog >= 100) {
          clearInterval(interval);
          setUploadProgress(prev => {
            const updated = { ...prev };
            delete updated[fileId];
            return updated;
          });

          const queueItemId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const newQueueItem = {
            id: queueItemId,
            name: file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
            fileName: file.name,
            progress: 25,
            status: "parsing"
          };
          setScreeningQueue(prev => [newQueueItem, ...prev]);

          runEvaluationPipelineWithSource(newQueueItem, file, "Careers Page");
        }
      }, 100);
    }
  };

  const dismissQueueItem = (id: string) => {
    setScreeningQueue(prev => prev.filter(item => item.id !== id));
  };

  return {
    dragActive,
    uploadProgress,
    screeningQueue,
    isIngesting,
    fileInputRef,
    folderInputRef,
    handleDrag,
    handleDrop,
    handleFileChange,
    handleFolderChange,
    triggerFileSelect,
    triggerFolderSelect,
    dismissQueueItem
  };
}
