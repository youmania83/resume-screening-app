// src/components/dashboard/CandidateDetailPanel.tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2, ThumbsUp, ThumbsDown, ShieldAlert, Mail, Phone, Calendar, Briefcase, GraduationCap, Award, ExternalLink, ChevronRight } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Candidate } from "../../types/index";
import { RecruitmentTimeline } from "./screening/RecruitmentTimeline";

interface CandidateDetailPanelProps {
  candidate: Candidate | null;
  onClose: () => void;
  handleDeleteCandidate?: (id: string) => void;
  assessmentScoreInput?: number;
  setAssessmentScoreInput?: (score: number) => void;
  handleAssessmentSubmit?: (id: string, score: number) => void;
  isAssessmentSubmitting?: boolean;
  interviewFeedbackInput?: string;
  setInterviewFeedbackInput?: (text: string) => void;
  handleInterviewSubmit?: (id: string, decision: "pass" | "fail", feedback: string) => void;
  isInterviewSubmitting?: boolean;
  isOnboardingSubmitting?: boolean;
  handleOnboardSubmit?: (id: string) => void;
  handleDecision?: (id: string, status: any) => void;
}

export function CandidateDetailPanel({
  candidate,
  onClose,
  handleDeleteCandidate,
  assessmentScoreInput = 85,
  setAssessmentScoreInput,
  handleAssessmentSubmit,
  isAssessmentSubmitting = false,
  interviewFeedbackInput = "",
  setInterviewFeedbackInput,
  handleInterviewSubmit,
  isInterviewSubmitting = false,
  isOnboardingSubmitting = false,
  handleOnboardSubmit,
  handleDecision
}: CandidateDetailPanelProps) {
  if (!candidate) return null;

  const score = candidate.score || 0;
  const isHigh = score >= 85;
  const isMid = score >= 70 && score < 85;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
        {/* Backdrop Overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs cursor-pointer"
        />

        {/* Slide-Over Side Panel */}
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 220 }}
          className="relative w-full max-w-xl bg-card border-l border-border shadow-2xl h-full flex flex-col z-10 overflow-hidden"
        >
          {/* Header Bar */}
          <div className="p-5 border-b border-border bg-card/95 backdrop-blur flex items-center justify-between sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <div className={`h-11 w-11 rounded-full border-2 border-border flex items-center justify-center font-bold text-sm bg-secondary/30 ${isHigh ? "text-emerald-600 border-emerald-500/30" : isMid ? "text-amber-600 border-amber-500/30" : "text-red-500 border-red-500/30"}`}>
                {score}%
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground leading-snug">{candidate.name}</h3>
                <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5">
                  <span>{candidate.jobTitle || candidate.role}</span>
                  {candidate.jobLocation && (
                    <>
                      <span>•</span>
                      <span>{candidate.jobLocation}</span>
                    </>
                  )}
                  {candidate.jobCode && (
                    <span className="text-[10px] font-mono opacity-80">({candidate.jobCode})</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <a
                href={`/profile/${candidate.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors border border-indigo-500/20"
                title="Open full candidate profile"
              >
                <span>Full Profile</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {handleDeleteCandidate && (
                <button
                  onClick={() => {
                    handleDeleteCandidate(candidate.id);
                    onClose();
                  }}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-secondary rounded-md transition-colors cursor-pointer"
                  title="Delete candidate profile"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-foreground hover:bg-secondary rounded-md transition-colors cursor-pointer"
                title="Close side panel"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-background/50">
            {/* Quick Status Bar */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card border border-border rounded-lg p-3">
                <span className="text-[9px] uppercase font-bold text-muted-foreground block">Pipeline Stage</span>
                <Badge variant={candidate.status === "shortlisted" ? "success" : candidate.status === "review" ? "warning" : candidate.status === "interviewing" ? "purple" : candidate.status === "rejected" ? "destructive" : "secondary"} className="mt-1 text-[9px] uppercase">
                  {candidate.status}
                </Badge>
              </div>

              <div className="bg-card border border-border rounded-lg p-3">
                <span className="text-[9px] uppercase font-bold text-muted-foreground block">Experience</span>
                <span className="text-xs font-bold text-foreground mt-1 block">
                  {candidate.experienceYears < 1 && candidate.experienceYears > 0 ? `${Math.round(candidate.experienceYears * 12)} Months` : `${candidate.experienceYears} ${candidate.experienceYears === 1 ? "Year" : "Years"}`}
                </span>
              </div>

              <div className="bg-card border border-border rounded-lg p-3">
                <span className="text-[9px] uppercase font-bold text-muted-foreground block">Risk Level</span>
                <Badge variant={candidate.riskLevel === "Low" ? "success" : candidate.riskLevel === "Medium" ? "warning" : "destructive"} className="mt-1 text-[9px]">
                  {candidate.riskLevel || "Low"} Risk
                </Badge>
              </div>
            </div>

            {/* Stage Decision Actions */}
            {handleDecision && (
              <div className="bg-card border border-border rounded-lg p-3 space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Update Pipeline Stage:</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={candidate.status === "review" ? "default" : "outline"}
                    onClick={() => handleDecision(candidate.id, "review")}
                    className="text-[10px] py-1 px-2.5 h-7 font-bold cursor-pointer"
                  >
                    Move to Review
                  </Button>
                  <Button
                    size="sm"
                    variant={candidate.status === "shortlisted" ? "default" : "outline"}
                    onClick={() => handleDecision(candidate.id, "shortlisted")}
                    className="text-[10px] py-1 px-2.5 h-7 font-bold cursor-pointer"
                  >
                    Shortlist
                  </Button>
                  <Button
                    size="sm"
                    variant={candidate.status === "interviewing" ? "default" : "outline"}
                    onClick={() => handleDecision(candidate.id, "interviewing")}
                    className="text-[10px] py-1 px-2.5 h-7 font-bold cursor-pointer"
                  >
                    Interview
                  </Button>
                  <Button
                    size="sm"
                    variant={candidate.status === "hold" ? "default" : "outline"}
                    onClick={() => handleDecision(candidate.id, "hold")}
                    className="text-[10px] py-1 px-2.5 h-7 font-bold cursor-pointer"
                  >
                    Hold
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDecision(candidate.id, "rejected")}
                    className="text-[10px] py-1 px-2.5 h-7 font-bold cursor-pointer"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {/* Recruitment Progress Timeline */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs">
              <RecruitmentTimeline candidate={candidate} />
            </div>

            {/* AI Evaluation Recommendation */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span>AI Recommendation Summary</span>
              </h4>
              <p className="text-xs leading-relaxed text-foreground/90 font-medium bg-card p-3.5 rounded-lg border border-border shadow-xs">
                {candidate.recommendation || "This candidate has not been screened by the AI reviewer yet. Recommendation will appear here once screening completes."}
              </p>
            </div>

            {/* Experience & Skills Alignment */}
            <div className="space-y-3 bg-card border border-border rounded-xl p-4 shadow-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Skill Fit Breakdown</h4>
              
              <div className="flex flex-wrap gap-1.5">
                {candidate.matchedSkills && candidate.matchedSkills.map(s => (
                  <Badge key={s} variant="outline" className="text-[10px] font-semibold bg-emerald-50/40 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-500/20 px-2 py-0.5">
                    ✓ {s}
                  </Badge>
                ))}
                {candidate.missingSkills && candidate.missingSkills.map(s => (
                  <Badge key={s} variant="outline" className="text-[10px] font-semibold bg-red-50/40 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-500/20 px-2 py-0.5">
                    × {s}
                  </Badge>
                ))}
              </div>

              {candidate.experienceMatch && (
                <p className="text-xs text-muted-foreground font-medium pt-2 border-t border-border/50">
                  {candidate.experienceMatch}
                </p>
              )}
            </div>

            {/* Strengths & Weaknesses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {candidate.strengths && candidate.strengths.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4 space-y-2 shadow-xs">
                  <span className="text-xs font-bold uppercase text-emerald-600 flex items-center gap-1.5">
                    <ThumbsUp className="h-3.5 w-3.5" /> Strengths
                  </span>
                  <ul className="space-y-1.5 pl-4 list-disc text-xs text-muted-foreground font-medium">
                    {candidate.strengths.slice(0, 4).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {candidate.weaknesses && candidate.weaknesses.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4 space-y-2 shadow-xs">
                  <span className="text-xs font-bold uppercase text-amber-600 flex items-center gap-1.5">
                    <ThumbsDown className="h-3.5 w-3.5" /> Development Areas
                  </span>
                  <ul className="space-y-1.5 pl-4 list-disc text-xs text-muted-foreground font-medium">
                    {candidate.weaknesses.slice(0, 4).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Candidate Details & Education */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2.5 shadow-xs text-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Contact & Education</h4>
              <div className="grid grid-cols-1 gap-2 pt-1">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{candidate.email}</span>
                </div>
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{candidate.phone || "Not specified"}</span>
                </div>
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{candidate.education || "Graduate degree"}</span>
                </div>
              </div>
            </div>

            {/* Assessment / HR Interview Action Sub-Panels */}
            {candidate.status === "shortlisted" && handleAssessmentSubmit && setAssessmentScoreInput && (
              <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-200 dark:border-indigo-800/40 space-y-3">
                <span className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-300 block">Assessment Input & Evaluation</span>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScoreInput}
                    onChange={(e) => setAssessmentScoreInput(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="w-24 bg-card border border-border rounded px-3 py-1.5 text-xs outline-none font-bold text-foreground"
                    placeholder="Score %"
                  />
                  <Button
                    disabled={isAssessmentSubmitting}
                    onClick={() => handleAssessmentSubmit(candidate.id, assessmentScoreInput)}
                    className="flex-1 text-xs font-bold cursor-pointer"
                  >
                    {isAssessmentSubmitting ? "Submitting..." : "Record Test Result"}
                  </Button>
                </div>
              </div>
            )}

            {candidate.status === "interviewing" && handleInterviewSubmit && setInterviewFeedbackInput && (
              <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-200 dark:border-indigo-800/40 space-y-3">
                <span className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-300 block">HR Interview Feedback & Decision</span>
                <textarea
                  placeholder="Enter interviewer feedback and evaluation notes..."
                  value={interviewFeedbackInput}
                  onChange={(e) => setInterviewFeedbackInput(e.target.value)}
                  rows={3}
                  className="w-full bg-card border border-border rounded-md p-2.5 text-xs outline-none text-foreground resize-none"
                />
                <div className="flex gap-3">
                  <Button
                    variant="success"
                    disabled={isInterviewSubmitting || !interviewFeedbackInput.trim()}
                    onClick={() => handleInterviewSubmit(candidate.id, "pass", interviewFeedbackInput)}
                    className="flex-1 text-xs font-bold cursor-pointer"
                  >
                    Pass & Select Candidate
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={isInterviewSubmitting || !interviewFeedbackInput.trim()}
                    onClick={() => handleInterviewSubmit(candidate.id, "fail", interviewFeedbackInput)}
                    className="flex-1 text-xs font-bold cursor-pointer"
                  >
                    Reject Candidate
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
