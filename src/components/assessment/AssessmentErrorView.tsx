import React from "react";
import { ShieldAlert, Lock } from "lucide-react";

interface AssessmentErrorViewProps {
  error: string;
  handleForceResume: () => Promise<void>;
  sessionId: string;
}

export default function AssessmentErrorView({
  error,
  handleForceResume,
  sessionId: _sessionId,
}: AssessmentErrorViewProps) {
  const isSessionMismatch = error.includes("Only one active session allowed");

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground px-4">
      <div className="max-w-md w-full bg-white border border-border rounded-2xl p-8 text-center space-y-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-500 to-rose-500" />
        <div
          className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto border ${
            isSessionMismatch
              ? "bg-amber-50 border-amber-200 text-amber-600"
              : "bg-red-50 border-red-200 text-red-600"
          }`}
        >
          {isSessionMismatch ? <Lock className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-foreground tracking-tight">
            {isSessionMismatch ? "Session in Progress" : "Access Prohibited"}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isSessionMismatch
              ? "This assessment is already active in another browser, tab, or window. If you closed it or switched devices, you can resume it here. Resuming will close any other active windows."
              : error}
          </p>
        </div>
        {isSessionMismatch && (
          <button
            onClick={handleForceResume}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg text-sm transition-colors cursor-pointer shadow-md"
          >
            Resume Assessment Here
          </button>
        )}
        <div className="text-xs text-slate-400 border-t border-border pt-4">
          Security logs recorded. IP & active session identifiers are mapped.
        </div>
      </div>
    </div>
  );
}
