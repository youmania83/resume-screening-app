"use client";
import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, User, FileText, Clock, MessageSquare, Briefcase, Send, Calendar, Sparkles } from "lucide-react";

// Tab Components
import OverviewTab from "@/src/components/profile/OverviewTab";
import ResumeTab from "@/src/components/profile/ResumeTab";
import TimelineTab from "@/src/components/profile/TimelineTab";
import NotesTab from "@/src/components/profile/NotesTab";
import DocumentsTab from "@/src/components/profile/DocumentsTab";
import SubmissionsTab from "@/src/components/profile/SubmissionsTab";
import InterviewsTab from "@/src/components/profile/InterviewsTab";

export default function CandidateProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [candidate, setCandidate] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [recruiters, setRecruiters] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const fetchWithCredentials = useCallback(async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      const [
        candRes,
        notesRes,
        tagsRes,
        docsRes,
        timelineRes,
        subsRes,
        interviewsRes,
        recruiterRes,
      ] = await Promise.all([
        fetchWithCredentials(`${apiBase}/candidates/${id}`),
        fetchWithCredentials(`${apiBase}/candidates/${id}/notes`),
        fetchWithCredentials(`${apiBase}/candidates/${id}/tags`),
        fetchWithCredentials(`${apiBase}/candidates/${id}/documents`),
        fetchWithCredentials(`${apiBase}/candidates/${id}/timeline`),
        fetchWithCredentials(`${apiBase}/candidates/${id}/submissions`),
        fetchWithCredentials(`${apiBase}/interview/candidate/${id}`),
        fetchWithCredentials(`${apiBase}/candidates/recruiters/list`),
      ]);

      if (candRes.status === 401) {
        toast.error("Session expired. Please log in.");
        router.push("/login");
        return;
      }

      if (candRes.status === 404) {
        toast.error("Candidate profile not found.");
        router.push("/");
        return;
      }

      const candData = await candRes.json();
      const notesData = await notesRes.json();
      const tagsData = await tagsRes.json();
      const docsData = await docsRes.json();
      const timelineData = await timelineRes.json();
      const subsData = await subsRes.json();
      const interviewsData = await interviewsRes.json();
      const recruiterData = await recruiterRes.json();

      if (candData.success) setCandidate(candData.candidate);
      if (notesData.success) setNotes(notesData.notes);
      if (tagsData.success) setTags(tagsData.tags);
      if (docsData.success) setDocuments(docsData.documents);
      if (timelineData.success) setTimeline(timelineData.timeline);
      if (subsData.success) setSubmissions(subsData.submissions);
      if (interviewsData.success) setInterviews(interviewsData.interviews);
      if (recruiterData.success) setRecruiters(recruiterData.recruiters);
    } catch (err) {
      console.error("Failed to load candidate profile details:", err);
      toast.error("Error loading candidate profile");
    } finally {
      setLoading(false);
    }
  }, [id, apiBase, router, fetchWithCredentials]);

  useEffect(() => {
    if (id) {
      loadAllData();
    }
  }, [id, loadAllData]);

  const handleAddTag = async (tagName: string) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/candidates/${id}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Tag "${tagName}" added`);
        loadAllData();
      } else {
        toast.error(data.error || "Failed to add tag");
      }
    } catch (err) {
      console.error("Add tag error:", err);
      toast.error("Network error adding tag");
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/candidates/${id}/tags/${tagId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Tag removed");
        loadAllData();
      } else {
        toast.error(data.error || "Failed to remove tag");
      }
    } catch (err) {
      console.error("Remove tag error:", err);
      toast.error("Network error removing tag");
    }
  };

  const handleUpdateRecruiter = async (recruiterId: string) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/candidates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recruiterOwnerId: recruiterId || null }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Recruiter ownership updated");
        loadAllData();
      } else {
        toast.error(data.error || "Failed to update recruiter");
      }
    } catch (err) {
      console.error("Update recruiter error:", err);
      toast.error("Network error updating recruiter");
    }
  };

  const handleAddNote = async (noteText: string, isPinned: boolean) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/candidates/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteText, isPinned }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Note added");
        loadAllData();
      } else {
        toast.error(data.error || "Failed to add note");
      }
    } catch (err) {
      console.error("Add note error:", err);
      toast.error("Network error adding note");
    }
  };

  const handleTogglePinNote = async (noteId: string, isPinned: boolean) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/candidates/${id}/notes/${noteId}/pin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(isPinned ? "Note pinned to top" : "Note unpinned");
        loadAllData();
      } else {
        toast.error(data.error || "Failed to pin note");
      }
    } catch (err) {
      console.error("Toggle pin note error:", err);
      toast.error("Network error toggling pin");
    }
  };

  const handleUploadDocument = async (title: string, fileUrl: string, documentType: string) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/candidates/${id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, fileUrl, documentType }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Document attached successfully");
        loadAllData();
      } else {
        toast.error(data.error || "Failed to attach document");
      }
    } catch (err) {
      console.error("Upload document error:", err);
      toast.error("Network error uploading document");
    }
  };

  const handleAddSubmission = async (jobId: string, clientName: string, feedback?: string) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/candidates/${id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, clientName, feedback }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Submitted to client "${clientName}"`);
        loadAllData();
      } else {
        toast.error(data.error || "Failed to submit candidate");
      }
    } catch (err) {
      console.error("Add submission error:", err);
      toast.error("Network error adding submission");
    }
  };

  const handleUpdateSubmissionStatus = async (submissionId: string, status: string, feedback?: string) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/candidates/${id}/submissions/${submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, feedback }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Submission status updated");
        loadAllData();
      } else {
        toast.error(data.error || "Failed to update submission status");
      }
    } catch (err) {
      console.error("Update submission status error:", err);
      toast.error("Network error updating status");
    }
  };

  const handleScheduleInterview = async (scheduledDate: string, feedback?: string) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/interview/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: id, scheduledDate, feedback }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Interview scheduled successfully");
        loadAllData();
      } else {
        toast.error(data.error || "Failed to schedule interview");
      }
    } catch (err) {
      console.error("Schedule interview error:", err);
      toast.error("Network error scheduling interview");
    }
  };

  const handleAddInterviewFeedback = async (interviewId: string, feedback: string) => {
    try {
      const res = await fetchWithCredentials(`${apiBase}/interview/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: id, interviewId, feedback }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Interviewer feedback recorded");
        loadAllData();
      } else {
        toast.error(data.error || "Failed to save feedback");
      }
    } catch (err) {
      console.error("Add interview feedback error:", err);
      toast.error("Network error saving feedback");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 border-t-2 border-l-2 border-violet-500 rounded-full animate-spin" />
          <div className="text-sm font-semibold text-slate-400">Loading Candidate File...</div>
        </div>
      </div>
    );
  }

  const latestResume = documents.find((doc) => doc.document_type === "resume") || null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12">
      {/* Top Navigation */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/")}
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center"
            >
              <ChevronLeft size={16} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-150">{candidate?.name}</h1>
                <span className="bg-violet-950 text-violet-400 border border-violet-800/40 text-[10px] font-bold px-2 py-0.5 rounded capitalize">
                  {candidate?.status}
                </span>
              </div>
              <p className="text-xs text-slate-500">{candidate?.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" />
            <span className="text-xs text-slate-400">Match score: <strong className="text-violet-400 text-sm font-bold">{candidate?.score}</strong></span>
          </div>
        </div>
      </header>

      {/* Tabs Menu */}
      <div className="border-b border-slate-900 bg-slate-950/50 sticky top-16 z-20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 flex items-center overflow-x-auto whitespace-nowrap gap-1 py-2">
          {[
            { id: "overview", label: "Overview", icon: <User size={14} /> },
            { id: "resume", label: "Resume & AI Analysis", icon: <FileText size={14} /> },
            { id: "timeline", label: "Timeline", icon: <Clock size={14} /> },
            { id: "notes", label: "Notes", icon: <MessageSquare size={14} /> },
            { id: "documents", label: "Documents", icon: <Briefcase size={14} /> },
            { id: "submissions", label: "Submissions", icon: <Send size={14} /> },
            { id: "interviews", label: "Interviews", icon: <Calendar size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                activeTab === tab.id
                  ? "bg-violet-600 text-white border-violet-500/30"
                  : "bg-slate-900/40 border-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Contents Panel */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        {activeTab === "overview" && (
          <OverviewTab
            candidate={candidate}
            tags={tags}
            recruiters={recruiters}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            onUpdateRecruiter={handleUpdateRecruiter}
          />
        )}
        {activeTab === "resume" && (
          <ResumeTab candidate={candidate} resumeDocument={latestResume} />
        )}
        {activeTab === "timeline" && <TimelineTab timeline={timeline} />}
        {activeTab === "notes" && (
          <NotesTab notes={notes} onAddNote={handleAddNote} onTogglePin={handleTogglePinNote} />
        )}
        {activeTab === "documents" && (
          <DocumentsTab documents={documents} onUploadDocument={handleUploadDocument} />
        )}
        {activeTab === "submissions" && (
          <SubmissionsTab
            candidateId={id}
            submissions={submissions}
            onAddSubmission={handleAddSubmission}
            onUpdateStatus={handleUpdateSubmissionStatus}
          />
        )}
        {activeTab === "interviews" && (
          <InterviewsTab
            candidateId={id}
            interviews={interviews}
            onScheduleInterview={handleScheduleInterview}
            onAddFeedback={handleAddInterviewFeedback}
          />
        )}
      </div>
    </main>
  );
}
