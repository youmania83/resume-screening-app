// src/components/dashboard/screening/AiScreeningConsole.tsx
import React from "react";
import { Trash2, ThumbsUp, ThumbsDown, ShieldAlert, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Candidate } from "../../../types/index";
import { RecruitmentTimeline } from "./RecruitmentTimeline";

interface AiScreeningConsoleProps {
  selectedCandidate: Candidate | null;
  handleDeleteCandidate: (id: string) => void;
  assessmentScoreInput: number;
  setAssessmentScoreInput: (score: number) => void;
  handleAssessmentSubmit: (id: string, score: number) => void;
  isAssessmentSubmitting: boolean;
  interviewFeedbackInput: string;
  setInterviewFeedbackInput: (text: string) => void;
  handleInterviewSubmit: (id: string, decision: "pass" | "fail", feedback: string) => void;
  isInterviewSubmitting: boolean;
  isOnboardingSubmitting: boolean;
  handleOnboardSubmit: (id: string) => void;
  handleDecision: (id: string, status: any) => void;
}

export function AiScreeningConsole({
  selectedCandidate,
  handleDeleteCandidate,
  assessmentScoreInput,
  setAssessmentScoreInput,
  handleAssessmentSubmit,
  isAssessmentSubmitting,
  interviewFeedbackInput,
  setInterviewFeedbackInput,
  handleInterviewSubmit,
  isInterviewSubmitting,
  isOnboardingSubmitting,
  handleOnboardSubmit,
  handleDecision
}: AiScreeningConsoleProps) {
  if (!selectedCandidate) {
    return (
      <Card className="shadow-sm border-border bg-card h-[400px] flex items-center justify-center p-6 text-center lg:col-span-4">
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <User className="h-10 w-10 text-slate-300" />
          <p className="text-xs font-bold">No Candidate Selected</p>
          <p className="text-[10px] max-w-xs leading-normal text-muted-foreground mt-0.5">
            Select an analyzed candidate from the list to review match details, risk levels, and issue decision updates.
          </p>
        </div>
      </Card>
    );
  }

  const score = selectedCandidate.score || 0;
  const isHigh = score >= 85;
  const isMid = score >= 70 && score < 85;

  return (
    <div className="lg:col-span-4">
      <Card className="shadow-sm border-border bg-card sticky top-6">
        <CardHeader className="pb-3 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge variant="outline" className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold px-2 py-0 border-border">
                  Screened Profile
                </Badge>
                <button
                  onClick={() => handleDeleteCandidate(selectedCandidate.id)}
                  className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors"
                  title="Delete profile"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <CardTitle className="text-sm font-bold text-foreground">{selectedCandidate.name}</CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground mt-0.5">
                {selectedCandidate.role} • {selectedCandidate.experienceYears} Years Exp
              </CardDescription>
            </div>

            <div className="flex flex-col items-center">
              <div className="relative h-12 w-12 rounded-full border-3 border-border flex items-center justify-center bg-secondary/30">
                <span className={`text-xs font-bold ${isHigh ? "text-emerald-600" : isMid ? "text-amber-600" : "text-red-500"}`}>
                  {score}
                </span>
              </div>
              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/80 mt-1.5 text-center leading-none">Fit Score</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4 text-xs max-h-[500px] overflow-y-auto custom-scrollbar">
          <RecruitmentTimeline candidate={selectedCandidate} />

          <div className="grid grid-cols-2 gap-3.5 bg-secondary/30 p-2.5 rounded border border-border/40">
            <div>
              <span className="block text-[9px] uppercase font-bold text-muted-foreground">Confidence Level</span>
              <span className="font-semibold text-[11px] text-foreground">{selectedCandidate.confidence}</span>
            </div>
            <div>
              <span className="block text-[9px] uppercase font-bold text-muted-foreground">Risk Profile</span>
              <Badge
                variant={selectedCandidate.riskLevel === "Low" ? "success" : selectedCandidate.riskLevel === "Medium" ? "warning" : "destructive"}
                className="text-[8px] px-1 py-0 font-bold"
              >
                {selectedCandidate.riskLevel} Risk
              </Badge>
            </div>
          </div>

          <div>
            <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1">AI Recommendation Summary</span>
            <p className="text-foreground/90 leading-relaxed font-semibold bg-secondary/40 p-2.5 rounded border border-border text-[11px]">
              {selectedCandidate.recommendation}
            </p>
          </div>

          <div>
            <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1">Experience Alignment</span>
            <p className="text-muted-foreground leading-relaxed text-[11px] font-medium">{selectedCandidate.experienceMatch}</p>
          </div>

          <div className="space-y-1.5">
            <span className="block text-[9px] uppercase font-bold text-muted-foreground">Skills Alignment Matrix</span>
            <div className="flex flex-wrap gap-1">
              {selectedCandidate.matchedSkills.map(skill => (
                <Badge key={skill} variant="outline" className="text-[9px] font-semibold bg-emerald-50/30 text-emerald-700 border-emerald-250/20 px-2 py-0.5">
                  ✓ {skill}
                </Badge>
              ))}
              {selectedCandidate.missingSkills.map(skill => (
                <Badge key={skill} variant="outline" className="text-[9px] font-semibold bg-red-50/30 text-rose-700 border-rose-250/20 px-2 py-0.5">
                  × {skill}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1 flex items-center gap-1 text-emerald-600">
                <ThumbsUp className="h-2.5 w-2.5 inline" /> Core Strengths
              </span>
              <ul className="space-y-1 pl-3.5 list-disc text-muted-foreground text-[11px] leading-relaxed font-medium">
                {selectedCandidate.strengths.slice(0, 3).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>

            {selectedCandidate.weaknesses.length > 0 && (
              <div>
                <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1 flex items-center gap-1 text-amber-600">
                  <ThumbsDown className="h-2.5 w-2.5 inline" /> Attention Areas
                </span>
                <ul className="space-y-1 pl-3.5 list-disc text-muted-foreground text-[11px] leading-relaxed font-medium">
                  {selectedCandidate.weaknesses.slice(0, 3).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedCandidate.riskFactors && selectedCandidate.riskFactors.length > 0 && (
              <div className="p-2 bg-rose-50/50 rounded border border-rose-100">
                <span className="block text-[9px] uppercase font-bold text-rose-700 mb-1 flex items-center gap-1">
                  <ShieldAlert className="h-3 w-3 inline" /> Primary Risk Factor
                </span>
                <p className="text-rose-700 text-[10px] leading-relaxed font-semibold">
                  {selectedCandidate.riskFactors[0]}
                </p>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-border/50 grid grid-cols-1 gap-1 text-[10px] text-muted-foreground font-semibold">
            <span>Education: <strong className="text-foreground font-bold">{selectedCandidate.education}</strong></span>
            <span>Contact: <strong className="text-foreground font-bold">{selectedCandidate.email} • {selectedCandidate.phone}</strong></span>
          </div>

          {/* Interactive Panels */}
          <div className="pt-2.5 border-t border-border/50 space-y-3">
            {selectedCandidate.status === "shortlisted" && (
              <div className="p-3 bg-indigo-50/40 rounded-lg border border-indigo-100 space-y-2.5">
                <span className="block text-[10px] uppercase font-bold text-indigo-700">✉ Assessment Invited</span>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Link sent to complete technical assessment.
                </p>
                <div className="space-y-1.5 pt-1.5 border-t border-indigo-100/55">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Simulated Test Score (0-100)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={assessmentScoreInput}
                      onChange={(e) => setAssessmentScoreInput(Math.min(100, Math.max(0, Number(e.target.value))))}
                      className="w-16 bg-white dark:bg-slate-900 border border-border rounded px-2 py-1 text-xs outline-none text-foreground font-semibold"
                    />
                    <Button size="sm" disabled={isAssessmentSubmitting} onClick={() => handleAssessmentSubmit(selectedCandidate.id, assessmentScoreInput)} className="flex-1 text-[10px] font-bold">
                      {isAssessmentSubmitting ? "Evaluating..." : "Submit Test"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {selectedCandidate.status === "interviewing" && (
              <div className="p-3 bg-indigo-50/40 rounded-lg border border-indigo-100 space-y-2.5">
                <div className="flex items-center justify-between border-b border-indigo-100/55 pb-1.5">
                  <span className="block text-[10px] uppercase font-bold text-indigo-700">📅 HR Interview Round</span>
                  <Badge variant="secondary" className="text-[8.5px] px-1 bg-white dark:bg-slate-900">Scheduled</Badge>
                </div>
                <div className="text-[10px] text-muted-foreground leading-normal space-y-1">
                  <p><strong>Interviewer:</strong> Yogesh Wadhwa (HR Manager)</p>
                  <p><strong>Date/Time:</strong> {selectedCandidate.interviewScheduledDate ? new Date(selectedCandidate.interviewScheduledDate).toLocaleString() : "TBD"}</p>
                </div>
                <div className="space-y-1.5 pt-2 border-t border-indigo-100/55">
                  <textarea
                    placeholder="Enter HR interview notes..."
                    value={interviewFeedbackInput}
                    onChange={(e) => setInterviewFeedbackInput(e.target.value)}
                    rows={2}
                    className="w-full bg-white dark:bg-slate-900 border border-border rounded px-2 py-1.5 text-xs outline-none text-foreground resize-none"
                  />
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <Button variant="success" size="sm" disabled={isInterviewSubmitting || !interviewFeedbackInput.trim()} onClick={() => handleInterviewSubmit(selectedCandidate.id, "pass", interviewFeedbackInput)} className="text-[10px] font-bold">
                      {isInterviewSubmitting ? "Updating..." : "✓ Approve"}
                    </Button>
                    <Button variant="destructive" size="sm" disabled={isInterviewSubmitting || !interviewFeedbackInput.trim()} onClick={() => handleInterviewSubmit(selectedCandidate.id, "fail", interviewFeedbackInput)} className="text-[10px] font-bold">
                      {isInterviewSubmitting ? "Updating..." : "✗ Reject"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {selectedCandidate.status === "selected" && (
              <div className="p-3 bg-emerald-50/30 rounded-lg border border-emerald-100/60 space-y-2.5">
                <span className="block text-[10px] uppercase font-bold text-emerald-700">🎉 Candidate Selected</span>
                <Button variant="success" size="sm" disabled={isOnboardingSubmitting} onClick={() => handleOnboardSubmit(selectedCandidate.id)} className="w-full text-[10px] font-bold mt-1.5">
                  {isOnboardingSubmitting ? "Migrating..." : "🚚 Initiate Keka Onboarding"}
                </Button>
              </div>
            )}

            {selectedCandidate.status === "onboarded" && (
              <div className="p-3 bg-emerald-50/30 rounded-lg border border-emerald-100/60 text-center space-y-1">
                <span className="text-emerald-500 font-bold block">✓</span>
                <span className="block text-[11px] font-bold text-emerald-800">Moved to Keka Onboarding</span>
              </div>
            )}

            {selectedCandidate.status === "rejected" && (
              <div className="p-3 bg-red-50/50 rounded-lg border border-red-150 space-y-1">
                <span className="block text-[10px] uppercase font-bold text-rose-700">✗ Candidate Rejected</span>
                {selectedCandidate.interviewFeedback && (
                  <p className="text-[9.5px] text-muted-foreground">Feedback: "{selectedCandidate.interviewFeedback}"</p>
                )}
              </div>
            )}

            {selectedCandidate.activityLogs && selectedCandidate.activityLogs.length > 0 && (
              <div className="p-2.5 bg-secondary/40 rounded border border-border/50 space-y-1.5">
                <span className="block text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Activity Logs</span>
                <div className="max-h-[100px] overflow-y-auto custom-scrollbar space-y-1 text-[9px] font-medium text-muted-foreground">
                  {selectedCandidate.activityLogs.map((log, idx) => (
                    <div key={idx} className="flex gap-1.5 items-start">
                      <span className="text-slate-400 font-mono">
                        [{new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]
                      </span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="pb-5 pt-0 grid grid-cols-5 gap-2 mt-4">
          <Button variant="success" size="sm" onClick={() => handleDecision(selectedCandidate.id, "shortlisted")} className="text-xs font-bold">✓ Shortlist</Button>
          <Button variant="info" size="sm" onClick={() => handleDecision(selectedCandidate.id, "interviewing")} className="text-xs font-bold">✉ Interview</Button>
          <Button variant="success" size="sm" onClick={() => handleDecision(selectedCandidate.id, "selected")} className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700">★ Select</Button>
          <Button variant="outline" size="sm" onClick={() => handleDecision(selectedCandidate.id, "hold")} className="text-xs font-semibold border-border text-foreground/90">Hold</Button>
          <Button variant="destructive" size="sm" onClick={() => handleDecision(selectedCandidate.id, "rejected")} className="text-xs font-bold">Reject</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
