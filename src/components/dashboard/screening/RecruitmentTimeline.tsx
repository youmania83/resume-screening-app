// src/components/dashboard/screening/RecruitmentTimeline.tsx
import React from "react";
import { Badge } from "../../ui/badge";
import { Candidate } from "../../../types/index";

interface RecruitmentTimelineProps {
  candidate: Candidate;
}

export function RecruitmentTimeline({ candidate }: RecruitmentTimelineProps) {
  const isRejected = candidate.status === "rejected";
  const sourceName = candidate.applicationSource || "Careers Page";
  const score = candidate.score || 0;

  return (
    <div className="bg-secondary/40 p-3 rounded-lg border border-border/50 space-y-3">
      <div className="flex items-center justify-between border-b border-border/40 pb-1.5 mb-1">
        <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Recruitment Funnel Progress</span>
        <Badge
          variant="outline"
          className={`text-[8.5px] font-bold uppercase tracking-wider px-2 py-0 border ${
            candidate.status === "rejected"
              ? "border-red-200 bg-red-50 text-red-700"
              : candidate.status === "onboarded"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-indigo-200 bg-indigo-50 text-indigo-650"
          }`}
        >
          {candidate.status === "shortlisted" ? "Assessment Invited" : candidate.status}
        </Badge>
      </div>

      <div className="relative border-l border-border pl-4.5 space-y-3.5 text-[11px] leading-tight select-none">
        {/* Step 1: Application Ingested */}
        <div className="relative">
          <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
          <div>
            <span className="font-bold text-foreground block">1. Ingested from {sourceName}</span>
            <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">Resume collected automatically via Ingestion Engine.</span>
          </div>
        </div>

        {/* Step 2: AI Parsing & Scoring */}
        <div className="relative">
          {isRejected && score < 70 ? (
            <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 flex items-center justify-center text-[7px] text-white">✗</span>
          ) : (
            <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
          )}
          <div>
            <span className="font-bold text-foreground block">2. AI Parsing & JD Match Score: {score}/100</span>
            <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">
              {isRejected && score < 70
                ? "Rejected: Score below threshold (70%). Moved to Keka Rejected Pool."
                : `Passed screening (Score >= 70%). Assessment invite sent.`}
            </span>
          </div>
        </div>

        {/* Step 3: Assessment Test */}
        {(!isRejected || score >= 70) && (
          <div className="relative">
            {candidate.status === "applied" ? (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-secondary border border-border flex items-center justify-center text-[7px] text-slate-400">•</span>
            ) : candidate.status === "shortlisted" ? (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-amber-500 flex items-center justify-center text-[7px] text-white animate-pulse">⌁</span>
            ) : isRejected && candidate.assessmentStatus === "failed" ? (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 flex items-center justify-center text-[7px] text-white">✗</span>
            ) : (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
            )}
            <div>
              <span className="font-bold text-foreground block">3. Candidate Technical Assessment</span>
              <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">
                {candidate.status === "shortlisted"
                  ? "Pending candidate response. Invite email sent."
                  : candidate.assessmentStatus === "failed"
                  ? `Failed: Score ${candidate.assessmentScore}/100 is < 70. Moved to Keka Rejected Pool.`
                  : candidate.assessmentStatus === "passed"
                  ? `Passed: Score ${candidate.assessmentScore}/100. Moved to Interview Scheduling.`
                  : "Pending."}
              </span>
            </div>
          </div>
        )}

        {/* Step 4: HR Interview Round */}
        {(!isRejected || (score >= 70 && candidate.assessmentStatus === "passed")) && (
          <div className="relative">
            {candidate.status === "interviewing" ? (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-amber-500 flex items-center justify-center text-[7px] text-white animate-pulse">⌁</span>
            ) : isRejected && candidate.interviewFeedback ? (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 flex items-center justify-center text-[7px] text-white">✗</span>
            ) : (candidate.status === "selected" || candidate.status === "onboarded") ? (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
            ) : (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-secondary border border-border flex items-center justify-center text-[7px] text-slate-400">•</span>
            )}
            <div>
              <span className="font-bold text-foreground block">4. HR Interview Round (Manager Evaluation)</span>
              <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">
                {candidate.status === "interviewing"
                  ? `Scheduled with HR Manager Yogesh Wadhwa on ${candidate.interviewScheduledDate ? new Date(candidate.interviewScheduledDate).toLocaleDateString() : 'TBD'}.`
                  : isRejected && candidate.interviewFeedback
                  ? `Rejected: ${candidate.interviewFeedback}. Moved to Keka Rejected Pool.`
                  : (candidate.status === "selected" || candidate.status === "onboarded")
                  ? `Passed. Interview notes logged.`
                  : "Pending."}
              </span>
            </div>
          </div>
        )}

        {/* Step 5: Selection & Keka HRMS Onboarding */}
        {(!isRejected || (score >= 70 && candidate.assessmentStatus === "passed" && !candidate.interviewFeedback)) && (
          <div className="relative">
            {candidate.status === "onboarded" ? (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
            ) : candidate.status === "selected" ? (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-amber-500 flex items-center justify-center text-[7px] text-white animate-pulse">⌁</span>
            ) : (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-secondary border border-border flex items-center justify-center text-[7px] text-slate-400">•</span>
            )}
            <div>
              <span className="font-bold text-foreground block">5. Selection & Keka HRMS Onboarding</span>
              <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">
                {candidate.status === "onboarded"
                  ? "Onboarding completed. Migration to Keka HRMS database successful."
                  : candidate.status === "selected"
                  ? "Approved. Awaiting HR system migration triggers."
                  : "Pending."}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
