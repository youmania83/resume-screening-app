"use client";
import React, { useState } from "react";
import { Calendar, Clock, FileText, CheckCircle } from "lucide-react";

interface Interview {
  id: string;
  candidate_id: string;
  job_id: string;
  scheduled_date: string;
  status: "scheduled" | "completed" | "cancelled";
  feedback?: string;
  created_at: string;
}

interface InterviewsTabProps {
  candidateId: string;
  interviews: Interview[];
  onScheduleInterview: (scheduledDate: string, feedback?: string) => Promise<void>;
  onAddFeedback: (interviewId: string, feedback: string) => Promise<void>;
}

export default function InterviewsTab({
  candidateId: _candidateId,
  interviews,
  onScheduleInterview,
  onAddFeedback,
}: InterviewsTabProps) {
  const [scheduledDate, setScheduledDate] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [addingFeedbackId, setAddingFeedbackId] = useState<string | null>(null);
  const [newFeedbackText, setNewFeedbackText] = useState("");

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledDate) return;
    setSubmitting(true);
    try {
      await onScheduleInterview(scheduledDate, feedbackNotes.trim() || undefined);
      setScheduledDate("");
      setFeedbackNotes("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFeedbackSubmit = async (interviewId: string) => {
    if (!newFeedbackText.trim()) return;
    setAddingFeedbackId(interviewId);
    try {
      await onAddFeedback(interviewId, newFeedbackText.trim());
      setNewFeedbackText("");
    } finally {
      setAddingFeedbackId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Schedule Interview Form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl h-fit">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
          <Calendar size={18} className="text-violet-400" />
          Schedule Interview
        </h2>
        <form onSubmit={handleSchedule} className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Date & Time</label>
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              disabled={submitting}
              className="w-full bg-slate-950 text-slate-100 rounded-lg px-3 py-2 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Preparation / Context Details</label>
            <textarea
              placeholder="Interviewer prep notes, target topics..."
              value={feedbackNotes}
              onChange={(e) => setFeedbackNotes(e.target.value)}
              disabled={submitting}
              rows={3}
              className="w-full bg-slate-950 text-slate-100 rounded-lg p-3 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-slate-600 resize-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !scheduledDate}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 text-sm font-medium border border-violet-500/30 transition-colors flex items-center justify-center gap-2"
          >
            <Clock size={16} />
            Schedule Round
          </button>
        </form>
      </div>

      {/* Interviews List */}
      <div className="md:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-slate-400" />
          Scheduled Rounds & Evaluation
        </h2>
        {interviews.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 italic">
            No interviews scheduled yet.
          </div>
        ) : (
          <div className="space-y-4">
            {interviews.map((interview) => (
              <div
                key={interview.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl transition-all"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200 text-sm sm:text-base">
                        {new Date(interview.scheduled_date).toLocaleString()}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                          interview.status === "completed"
                            ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/40"
                            : "bg-amber-950/40 text-amber-400 border-amber-800/40"
                        }`}
                      >
                        {interview.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Clock size={12} />
                      <span>Created {new Date(interview.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Feedback Section */}
                {interview.feedback ? (
                  <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800/60 mb-3 flex items-start gap-2">
                    <FileText size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-400 mb-1">Interviewer Feedback</div>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap">{interview.feedback}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500 italic">No feedback submitted yet. Add below:</div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="Log detailed interviewer feedback or scorecard summary..."
                        value={addingFeedbackId === interview.id ? newFeedbackText : ""}
                        onChange={(e) => {
                          setAddingFeedbackId(interview.id);
                          setNewFeedbackText(e.target.value);
                        }}
                        className="flex-1 bg-slate-950 text-slate-100 rounded-lg px-3 py-1.5 border border-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-slate-600"
                      />
                      <button
                        onClick={() => handleFeedbackSubmit(interview.id)}
                        disabled={addingFeedbackId !== interview.id || !newFeedbackText.trim()}
                        className="bg-violet-600 hover:bg-violet-700 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium border border-violet-500/30 transition-colors flex items-center justify-center gap-1"
                      >
                        <CheckCircle size={14} />
                        Save Feedback
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
