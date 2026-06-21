"use client";
import React, { useState, useEffect } from "react";
import { Briefcase, Building, Send, Calendar, User, FileText } from "lucide-react";

interface Submission {
  id: string;
  candidate_id: string;
  job_id: string;
  job_title: string;
  client_name: string;
  submitted_by: string;
  submitter_name?: string;
  submitted_at: string;
  submission_status: "Submitted" | "Under Review" | "Interview Requested" | "Rejected" | "Selected";
  feedback?: string;
}

interface SubmissionsTabProps {
  candidateId: string;
  submissions: Submission[];
  onAddSubmission: (jobId: string, clientName: string, feedback?: string) => Promise<void>;
  onUpdateStatus: (submissionId: string, status: string, feedback?: string) => Promise<void>;
}

export default function SubmissionsTab({
  candidateId: _candidateId,
  submissions,
  onAddSubmission,
  onUpdateStatus,
}: SubmissionsTabProps) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [clientName, setClientName] = useState("");
  const [initialFeedback, setInitialFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    // Fetch available jobs for dropdown
    fetch("/api/jobs")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.jobs) {
          setJobs(data.jobs);
        }
      })
      .catch((err) => console.error("Error loading jobs:", err));
  }, []);

  const handleCreateSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !clientName.trim()) return;
    setSubmitting(true);
    try {
      await onAddSubmission(selectedJobId, clientName.trim(), initialFeedback.trim() || undefined);
      setClientName("");
      setSelectedJobId("");
      setInitialFeedback("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (submissionId: string, newStatus: string) => {
    setUpdatingId(submissionId);
    try {
      const fb = statusFeedback[submissionId] || "";
      await onUpdateStatus(submissionId, newStatus, fb.trim() || undefined);
      // Clear specific feedback input
      setStatusFeedback((prev) => {
        const copy = { ...prev };
        delete copy[submissionId];
        return copy;
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Selected":
        return "bg-emerald-950/40 text-emerald-400 border-emerald-800/40";
      case "Rejected":
        return "bg-rose-950/40 text-rose-400 border-rose-800/40";
      case "Interview Requested":
        return "bg-violet-950/40 text-violet-400 border-violet-800/40";
      case "Under Review":
        return "bg-amber-950/40 text-amber-400 border-amber-800/40";
      default:
        return "bg-slate-950/40 text-slate-400 border-slate-800/40";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Log Submission form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl h-fit">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
          <Send size={18} className="text-violet-400" />
          Submit to Client
        </h2>
        <form onSubmit={handleCreateSubmission} className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Target Client Name</label>
            <input
              type="text"
              placeholder="e.g. Acme Corp"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              disabled={submitting}
              className="w-full bg-slate-950 text-slate-100 rounded-lg px-3 py-2 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Job Opening</label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              disabled={submitting}
              className="w-full bg-slate-950 text-slate-100 rounded-lg p-2 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              required
            >
              <option value="">Select a job...</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} ({job.location})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Initial Feedback / Pitch</label>
            <textarea
              placeholder="Reason for submission, core fit details..."
              value={initialFeedback}
              onChange={(e) => setInitialFeedback(e.target.value)}
              disabled={submitting}
              rows={3}
              className="w-full bg-slate-950 text-slate-100 rounded-lg p-3 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-slate-600 resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !clientName.trim() || !selectedJobId}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 text-sm font-medium border border-violet-500/30 transition-colors flex items-center justify-center gap-2"
          >
            <Send size={16} />
            Log Submission
          </button>
        </form>
      </div>

      {/* Submissions List */}
      <div className="md:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Building size={18} className="text-slate-400" />
          Client Submissions & Tracking
        </h2>
        {submissions.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 italic">
            This candidate has not been submitted to any clients.
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => (
              <div
                key={sub.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200 text-base">{sub.client_name}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${getStatusColor(
                          sub.submission_status
                        )}`}
                      >
                        {sub.submission_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <Briefcase size={12} />
                      <span className="text-slate-400">{sub.job_title}</span>
                      <span>•</span>
                      <User size={12} />
                      <span>{sub.submitter_name || "System"}</span>
                      <span>•</span>
                      <Calendar size={12} />
                      <span>{new Date(sub.submitted_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Status update control */}
                  <div className="flex items-center gap-2">
                    <select
                      value={sub.submission_status}
                      onChange={(e) => handleStatusChange(sub.id, e.target.value)}
                      disabled={updatingId === sub.id}
                      className="bg-slate-950 text-slate-100 rounded-lg px-2.5 py-1 border border-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                    >
                      <option value="Submitted">Submitted</option>
                      <option value="Under Review">Under Review</option>
                      <option value="Interview Requested">Interview Requested</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Selected">Selected</option>
                    </select>
                  </div>
                </div>

                {/* Sub-section for feedback */}
                {sub.feedback && (
                  <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/60 mb-3 flex items-start gap-2">
                    <FileText size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-slate-400 whitespace-pre-wrap">{sub.feedback}</p>
                  </div>
                )}

                {/* Inline feedback comment update box */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    placeholder="Add status comment / feedback..."
                    value={statusFeedback[sub.id] || ""}
                    onChange={(e) =>
                      setStatusFeedback((prev) => ({ ...prev, [sub.id]: e.target.value }))
                    }
                    className="flex-1 bg-slate-950 text-slate-100 rounded-lg px-3 py-1 border border-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-slate-600"
                  />
                  <span className="text-[10px] text-slate-500 italic">Auto-saves on status drop change</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
