import React from "react";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Toaster } from "sonner";

interface ResultData {
  candidateName: string;
  jobRole: string;
  resumeScore: number;
  assessmentScore: number;
  finalScore: number;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  timeTaken: number;
  violationCount: number;
  status: "PASS" | "FAIL";
  rankingStatus: string;
}

interface AssessmentResultViewProps {
  result: ResultData;
  sessionId: string;
}

export default function AssessmentResultView({ result, sessionId }: AssessmentResultViewProps) {
  const isPass = result.status === "PASS";
  const minutes = Math.floor(result.timeTaken / 60);
  const seconds = result.timeTaken % 60;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between py-12 px-4 select-none">
      <Toaster position="top-right" theme="light" closeButton />
      <div className="max-w-xl w-full mx-auto bg-white border border-border rounded-2xl p-8 shadow-xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            {isPass ? (
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/25 blur-xl rounded-full" />
                <div className="h-16 w-16 bg-emerald-50 border-2 border-emerald-500 rounded-full flex items-center justify-center text-emerald-600 shadow-md relative">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-0 bg-rose-500/25 blur-xl rounded-full" />
                <div className="h-16 w-16 bg-rose-50 border-2 border-rose-500 rounded-full flex items-center justify-center text-rose-600 shadow-md relative">
                  <XCircle className="h-8 w-8" />
                </div>
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Assessment Completed</h1>
          <p className="text-xs text-muted-foreground">Your test answers have been analyzed and locked.</p>
        </div>

        {/* Results Summary Box */}
        <div className="bg-background border border-border rounded-xl p-6 relative overflow-hidden">
          {isPass && (
            <div className="absolute right-0 top-0 h-20 w-20 bg-emerald-500/5 rotate-45 transform translate-x-8 -translate-y-8" />
          )}

          <div className="flex flex-col items-center justify-center border-b border-border pb-5 mb-5 space-y-1">
            <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Your Score</span>
            <span className={`text-5xl font-extrabold tracking-tight ${isPass ? "text-emerald-600" : "text-rose-600"}`}>
              {result.assessmentScore}%
            </span>
            <Badge
              className={`text-[9.5px] font-bold tracking-wider uppercase px-2.5 py-0.5 mt-2.5 border ${
                isPass
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                  : "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-50"
              }`}
            >
              {result.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Candidate:</span>
              <span className="font-semibold text-foreground mt-0.5 truncate">{result.candidateName}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Role Target:</span>
              <span className="font-semibold text-foreground mt-0.5 truncate">{result.jobRole}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                Correct Answers:
              </span>
              <span className="font-semibold text-emerald-600 mt-0.5 font-mono">
                {result.correctAnswers} / {result.totalQuestions}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Time Taken:</span>
              <span className="font-semibold text-foreground mt-0.5 font-mono">
                {minutes}m {seconds}s
              </span>
            </div>
            <div className="flex flex-col col-span-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                Security Violations:
              </span>
              <span
                className={`font-semibold mt-0.5 font-mono flex items-center gap-1.5 ${
                  result.violationCount > 0 ? "text-amber-600 font-bold" : "text-emerald-600"
                }`}
              >
                {result.violationCount} Violations
                {result.violationCount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
              </span>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="border-t border-border pt-6 text-center space-y-3">
          {isPass ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              🎉 Congratulations! You have met the qualification criteria. An automated calendar invite has been sent to
              your email to schedule a final video interview panel with the HR team.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Thank you for completing the assessment. Your details have been recorded in our talent database. If our
              team decides to proceed with alternative roles, we will contact you.
            </p>
          )}
          <div className="text-[9.5px] text-slate-400 pt-2 font-mono">
            Secure Session ID: {sessionId.substring(0, 15)}...
          </div>
        </div>
      </div>

      <div className="text-center text-[10px] text-muted-foreground font-medium">
        Powered by Techsole Engineers Screen & Assessment Engine
      </div>
    </div>
  );
}
