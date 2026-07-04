// app/candidate/portal/[token]/page.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  Calendar, 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  ChevronRight, 
  User, 
  Briefcase,
  MapPin,
  Building,
  Check,
  X,
  FileCheck2,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

interface CandidatePortalData {
  candidate: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    status: string;
    appliedDate: string;
    finalScore: number | null;
  };
  job: {
    id: string;
    title: string;
    description: string;
    department: string;
    location: string;
  } | null;
  interviews: Array<{
    id: string;
    scheduled_date: string;
    status: string;
    feedback: string | null;
  }>;
  documents: Array<{
    id: string;
    title: string;
    file_url: string;
    document_type: string;
    version: number;
    uploaded_at: string;
  }>;
  branding: {
    companyName: string;
    logoUrl: string;
    primaryColor: string;
    emailFooter: string;
  };
}

export default function CandidatePortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CandidatePortalData | null>(null);

  // Scheduling states
  const [isConfirming, setIsConfirming] = useState<string | null>(null);
  const [rescheduleSlotId, setRescheduleSlotId] = useState<string | null>(null);
  const [rescheduleMessage, setRescheduleMessage] = useState("");
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Resume upload states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const loadPortalData = async () => {
    try {
      const resp = await fetch(`${apiBase}/candidate-portal/${token}`);
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Failed to load candidate portal.");
      }
      const json = await resp.json();
      setData(json);
      setLoading(false);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadPortalData();
    }
  }, [token]);

  const handleConfirmSlot = async (interviewId: string) => {
    setIsConfirming(interviewId);
    try {
      const resp = await fetch(`${apiBase}/candidate-portal/${token}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId })
      });

      if (!resp.ok) {
        throw new Error("Failed to confirm interview slot.");
      }

      toast.success("Interview slot confirmed successfully!");
      await loadPortalData();
    } catch (err: any) {
      toast.error(err.message || "Could not confirm slot.");
    } finally {
      setIsConfirming(null);
    }
  };

  const handleRequestReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleSlotId || !rescheduleMessage.trim()) return;

    setIsRescheduling(true);
    try {
      const resp = await fetch(`${apiBase}/candidate-portal/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: rescheduleSlotId, message: rescheduleMessage })
      });

      if (!resp.ok) {
        throw new Error("Failed to submit reschedule request.");
      }

      toast.success("Reschedule request submitted successfully.");
      setRescheduleSlotId(null);
      setRescheduleMessage("");
      await loadPortalData();
    } catch (err: any) {
      toast.error(err.message || "Could not request reschedule.");
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    setIsUploading(true);
    setUploadProgress(10);

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadProgress(40);
      const resp = await fetch(`${apiBase}/candidate-portal/${token}/resume`, {
        method: "POST",
        body: formData
      });

      setUploadProgress(80);
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || "Failed to upload resume.");
      }

      setUploadProgress(100);
      toast.success("Resume updated successfully! Match scoring is recalculating.");
      setUploadFile(null);
      await loadPortalData();
    } catch (err: any) {
      toast.error(err.message || "Resume upload failed.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-7 w-7 animate-spin text-indigo-500" />
          <p className="text-xs text-slate-400 font-semibold tracking-wide uppercase">Initializing Workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white p-4 font-sans">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-xl p-8 text-center space-y-6 shadow-2xl">
          <div className="h-14 w-14 rounded-full bg-red-950/50 border border-red-500/30 flex items-center justify-center mx-auto text-red-500">
            <AlertCircle className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-white">Access Denied</h2>
            <p className="text-xs text-slate-400 leading-relaxed">{error || "Candidate Portal link is invalid or expired."}</p>
          </div>
        </div>
      </div>
    );
  }

  const { candidate, job, interviews, documents, branding } = data;

  // Map candidate.status to timeline stages
  const getTimelineStages = () => {
    const stages = [
      { name: "Applied", description: "Profile received", key: "applied", completed: true },
      { name: "AI Screening", description: "Compatibility screening", key: "screening", completed: false },
      { name: "Skills Assessment", description: "Technical questions", key: "assessment", completed: false },
      { name: "HR Interview", description: "One-on-one video chat", key: "interviewing", completed: false },
      { name: "Decision", description: "Offer selection status", key: "final", completed: false },
    ];

    const currentStatus = candidate.status.toLowerCase();

    if (currentStatus === "duplicate") {
      stages[1].description = "Duplicate profile flagged";
      return stages;
    }

    // AI screening complete
    if (candidate.finalScore !== null || ["shortlisted", "interviewing", "selected", "rejected", "hired", "qualified"].includes(currentStatus)) {
      stages[1].completed = true;
    }

    // Assessment complete
    if (["shortlisted", "interviewing", "selected", "rejected", "hired", "qualified"].includes(currentStatus)) {
      stages[2].completed = true;
    }

    // Interviewing stage
    if (["interviewing", "selected", "rejected", "hired"].includes(currentStatus) || interviews.length > 0) {
      stages[3].completed = true;
    }

    // Selected or rejected
    if (["selected", "rejected", "hired", "hold"].includes(currentStatus)) {
      stages[4].completed = true;
    }

    return stages;
  };

  const timelineStages = getTimelineStages();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-16 selection:bg-indigo-500 selection:text-white">
      {/* HEADER */}
      <header className="h-16 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-6 lg:px-12 select-none">
        <div className="flex items-center gap-2.5">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.companyName || "Company Logo"} className="h-7 max-w-[120px] object-contain" />
          ) : (
            <div className="h-7 w-7 bg-white text-slate-950 rounded flex items-center justify-center shadow-md">
              <Sparkles className="h-4 w-4" style={{ color: branding?.primaryColor || "#6366f1" }} />
            </div>
          )}
          <div>
            <span className="font-bold text-sm tracking-tight text-white">{branding?.companyName || "Techsole Engineers"}</span>
            <span className="block text-[9px] text-slate-400 font-bold tracking-wider leading-none">CANDIDATE WORKSPACE</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Portal Connected</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 lg:px-8 mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: CANDIDATE INFO & TIMELINE */}
        <section className="lg:col-span-8 space-y-8">
          
          {/* WELCOME BANNER */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6.5 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm backdrop-blur-sm">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold tracking-wider uppercase animate-pulse" style={{ color: branding?.primaryColor || "#818cf8" }}>Application Workspace</span>
              <h1 className="text-2xl font-bold text-white tracking-tight">Hello, {candidate.name}</h1>
              <p className="text-xs text-slate-400 font-medium">
                Tracking your application status for the <strong className="text-slate-200 font-semibold">{job?.title || candidate.role}</strong> position.
              </p>
            </div>
            
            {job && (
              <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-semibold text-slate-400">
                <span className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md"><Building className="h-3.5 w-3.5" /> {job.department}</span>
                <span className="flex items-center gap-1 bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-md"><MapPin className="h-3.5 w-3.5" /> {job.location}</span>
              </div>
            )}
          </div>

          {/* APPLICATION STATUS TIMELINE */}
          <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6.5 space-y-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Funnel Status Tracking</h2>
            
            <div className="space-y-6">
              {timelineStages.map((stage, idx) => {
                const isCurrent = candidate.status.toLowerCase() === stage.key || 
                  (stage.key === "screening" && candidate.status.toLowerCase() === "duplicate") ||
                  (stage.key === "final" && ["selected", "rejected", "hired", "hold"].includes(candidate.status.toLowerCase()));
                
                return (
                  <div key={idx} className="flex gap-4 relative">
                    {idx < timelineStages.length - 1 && (
                      <div className={`w-0.5 absolute left-3 top-7 bottom-0 -mb-6 ${stage.completed ? "bg-emerald-500/40" : "bg-slate-800"}`} />
                    )}
                    
                    <div 
                      className={`h-6 w-6 rounded-full flex-shrink-0 flex items-center justify-center border z-10 ${
                        stage.completed 
                          ? "bg-emerald-950/30 border-emerald-500 text-emerald-400" 
                          : isCurrent 
                          ? "animate-pulse" 
                          : "bg-slate-900 border-slate-800 text-slate-500"
                      }`}
                      style={isCurrent ? {
                        borderColor: branding?.primaryColor || "#6366f1",
                        backgroundColor: `${branding?.primaryColor || "#6366f1"}20`,
                        color: branding?.primaryColor || "#818cf8"
                      } : undefined}
                    >
                      {stage.completed ? (
                        <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                      ) : (
                        <span className="text-[10px] font-bold">{idx + 1}</span>
                      )}
                    </div>

                    <div className="space-y-1 pt-0.5">
                      <h3 className={`text-xs font-bold ${isCurrent ? "text-white" : stage.completed ? "text-slate-200" : "text-slate-400"}`}>
                        {stage.name}
                        {isCurrent && (
                          <span className="ml-2 text-[8.5px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider" style={{
                            backgroundColor: `${branding?.primaryColor || "#6366f1"}20`,
                            color: branding?.primaryColor || "#818cf8"
                          }}>
                            Active
                          </span>
                        )}
                        {!stage.completed && !isCurrent && (
                          <span className="ml-2 bg-slate-800 text-slate-500 text-[8.5px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
                            Pending
                          </span>
                        )}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{stage.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ACTIVE INTERVIEWS CARD */}
          {interviews.length > 0 && (
            <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6.5 space-y-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-slate-400" />
                Scheduled Interviews
              </h2>

              <div className="space-y-4">
                {interviews.map((slot) => {
                  const dateObj = new Date(slot.scheduled_date);
                  const isPending = slot.status === "scheduled" || slot.status === "pending";

                  return (
                    <div 
                      key={slot.id} 
                      className="border border-slate-900 rounded-xl p-4.5 bg-slate-950/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 transition-all"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            slot.status === "confirmed" 
                              ? "bg-emerald-950/30 border border-emerald-500/20 text-emerald-400" 
                              : slot.status === "reschedule_requested"
                              ? "bg-amber-950/30 border border-amber-500/20 text-amber-400"
                              : "bg-indigo-950/30 border border-indigo-500/20 text-indigo-400 animate-pulse"
                          }`}>
                            {slot.status}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="block text-xs font-bold text-white">
                            {dateObj.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                          </span>
                          <span className="block text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            {dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}
                          </span>
                        </div>
                      </div>

                      {isPending && (
                        <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
                          <button
                            disabled={isConfirming !== null}
                            onClick={() => handleConfirmSlot(slot.id)}
                            className="flex-1 md:flex-initial text-white font-bold py-1.5 px-3.5 rounded text-[11px] transition-colors cursor-pointer disabled:opacity-50"
                            style={{ backgroundColor: branding?.primaryColor || "#4f46e5" }}
                          >
                            {isConfirming === slot.id ? "Confirming..." : "Confirm Slot"}
                          </button>
                          <button
                            onClick={() => setRescheduleSlotId(slot.id)}
                            className="flex-1 md:flex-initial bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 font-semibold py-1.5 px-3.5 rounded text-[11px] transition-colors cursor-pointer"
                          >
                            Reschedule
                          </button>
                        </div>
                      )}

                      {slot.status === "reschedule_requested" && (
                        <p className="text-[10px] text-amber-500 font-semibold italic">Waiting for Recruiter response.</p>
                      )}

                      {slot.status === "confirmed" && (
                        <div className="flex items-center gap-1.5 bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-1 rounded text-[10px] font-bold text-emerald-400 select-none">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Confirmed
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RESCHEDULE MODAL/FORM */}
          <AnimatePresence>
            {rescheduleSlotId && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6.5 space-y-4 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Request Reschedule</h3>
                  <button onClick={() => setRescheduleSlotId(null)} className="text-slate-400 hover:text-white transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                
                <form onSubmit={handleRequestReschedule} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Provide your availability</label>
                    <textarea
                      required
                      placeholder="e.g. Please reschedule to Friday morning between 9 AM to 12 PM, or Monday afternoon..."
                      value={rescheduleMessage}
                      onChange={(e) => setRescheduleMessage(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-xs outline-none text-white resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setRescheduleSlotId(null)}
                      className="bg-slate-900 hover:bg-slate-800 text-slate-300 font-semibold px-4.5 py-1.5 rounded"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isRescheduling}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-4.5 py-1.5 rounded disabled:opacity-50"
                    >
                      {isRescheduling ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

        </section>

        {/* RIGHT COLUMN: RESUME UPLOAD & DOCUMENTS */}
        <section className="lg:col-span-4 space-y-8">
          
          {/* RESUME UPDATE CARD */}
          <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6.5 space-y-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <UploadCloud className="h-4 w-4 text-slate-400" />
              Upload Updated Resume
            </h2>

            <div className="space-y-4">
              <div 
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={`border border-dashed border-slate-800 hover:border-slate-600 rounded-xl p-5 text-center cursor-pointer bg-slate-950/40 flex flex-col items-center justify-center gap-2.5 transition-all ${
                  isUploading ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleResumeUpload}
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden" 
                />
                
                {isUploading ? (
                  <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin" />
                ) : (
                  <UploadCloud className="h-6 w-6 text-slate-500" />
                )}
                
                <div className="space-y-0.5">
                  <span className="block text-[11px] font-semibold text-white">
                    {uploadFile ? uploadFile.name : "Select updated PDF/DOCX"}
                  </span>
                  <span className="block text-[9px] text-slate-500">Max file size 10MB</span>
                </div>
              </div>

              {isUploading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[8.5px] font-bold uppercase tracking-wider text-indigo-400">
                    <span>Recalculating Score...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* UPLOADED DOCUMENTS */}
          <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6.5 space-y-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-400" />
              Document Versions
            </h2>

            <div className="space-y-3.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {documents.map((doc) => (
                <div key={doc.id} className="p-3 border border-slate-900 bg-slate-950/40 rounded-xl flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-indigo-950/30 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <FileText className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-xs font-bold text-white truncate">{doc.title}</span>
                    <div className="flex items-center gap-2 text-[9px] text-slate-400 font-semibold select-none">
                      <span>Ver {doc.version}</span>
                      <span>•</span>
                      <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
              
              {documents.length === 0 && (
                <p className="text-[10px] text-slate-500 text-center py-4 font-semibold italic">No documents attached.</p>
              )}
            </div>
          </div>

        </section>

      </main>

      <footer className="mt-16 text-center text-[10px] text-slate-500 border-t border-slate-900 py-8 px-4 max-w-6xl mx-auto space-y-2">
        {branding?.emailFooter && (
          <p dangerouslySetInnerHTML={{ __html: branding.emailFooter.replace(/\n/g, "<br/>") }} className="mb-2" />
        )}
        <div className="font-semibold text-slate-400">
          Powered by IRA from Rison Ai Tech
        </div>
        <div className="text-[9px] text-slate-500 font-normal max-w-lg mx-auto leading-normal">
          Apple, App Store, and Google Play are trademarks of their respective owners. This portal operates independently and is not endorsed by or affiliated with Apple Inc. or Google LLC.
        </div>
      </footer>
    </div>
  );
}
