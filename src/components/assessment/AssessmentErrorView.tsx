import React from "react";
import { ShieldAlert, Lock } from "lucide-react";

interface AssessmentErrorViewProps {
  error: string;
  handleForceResume: () => Promise<void>;
  sessionId: string;
}

/**
 * Classifies the failure so the candidate sees an accurate message.
 *
 * Previously every non-session error rendered as "Access Prohibited" with a
 * security warning — including ordinary connectivity failures. Candidates who
 * simply could not reach the API were told they were forbidden, which is both
 * alarming and actively misleading when diagnosing an outage.
 */
function classify(error: string): {
  kind: "session" | "network" | "expired" | "notfound" | "temporary" | "generic";
  title: string;
  body: string;
  canRetry: boolean;
} {
  const e = (error || "").toLowerCase();

  if (e.includes("only one active session allowed")) {
    return {
      kind: "session",
      title: "Session in Progress",
      body: "This assessment is already active in another browser, tab, or window. If you closed it or switched devices, you can resume it here. Resuming will close any other active windows.",
      canRetry: true,
    };
  }

  // A failed fetch surfaces as "Failed to fetch" / "NetworkError" / "Load failed".
  if (
    e.includes("failed to fetch") ||
    e.includes("networkerror") ||
    e.includes("load failed") ||
    e.includes("err_connection") ||
    e.includes("connection refused")
  ) {
    return {
      kind: "network",
      title: "Can't Reach the Assessment Server",
      body: "We couldn't connect to the assessment service. Please check your internet connection and try again. If this keeps happening, contact HR — this is a problem on our side, not with your application.",
      canRetry: true,
    };
  }

  if (e.includes("expired")) {
    return { kind: "expired", title: "Assessment Link Expired", body: error, canRetry: false };
  }

  if (e.includes("not valid") || e.includes("mistyped") || e.includes("superseded")) {
    return { kind: "notfound", title: "Assessment Link Not Recognised", body: error, canRetry: false };
  }

  if (e.includes("temporary") || e.includes("try again in a few minutes")) {
    return { kind: "temporary", title: "Temporarily Unavailable", body: error, canRetry: true };
  }

  return {
    kind: "generic",
    title: "Unable to Open Assessment",
    body: error || "Something went wrong while loading your assessment.",
    canRetry: true,
  };
}

export default function AssessmentErrorView({
  error,
  handleForceResume,
  sessionId: _sessionId,
}: AssessmentErrorViewProps) {
  const { kind, title, body, canRetry } = classify(error);
  const isSessionMismatch = kind === "session";
  const isBlocking = kind === "expired" || kind === "notfound";

  return (
    <div className="flex h-screen items-center justify-center bg-background text-foreground px-4">
      <div className="max-w-md w-full bg-white border border-border rounded-2xl p-8 text-center space-y-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-500 to-rose-500" />
        <div
          className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto border ${
            isSessionMismatch
              ? "bg-amber-50 border-amber-200 text-amber-600"
              : isBlocking
              ? "bg-red-50 border-red-200 text-red-600"
              : "bg-slate-50 border-slate-200 text-slate-600"
          }`}
        >
          {isSessionMismatch ? <Lock className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-extrabold text-foreground tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
        </div>
        <div className="pt-2 space-y-3">
          {canRetry && (
            <button
              onClick={handleForceResume}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg text-xs transition-colors cursor-pointer shadow-md"
            >
              {isSessionMismatch ? "Resume / Start Assessment Session" : "Try Again"}
            </button>
          )}
          <a
            href="mailto:hr@techsolengineers.com?subject=Assessment%20Link%20Help"
            className="inline-block w-full bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold py-3 rounded-lg text-xs transition-colors border border-slate-300"
          >
            Contact Recruitment HR
          </a>
        </div>
        {isSessionMismatch && (
          <div className="text-xs text-slate-400 border-t border-border pt-4">
            Security logs recorded. IP &amp; active session identifiers are mapped.
          </div>
        )}
      </div>
    </div>
  );
}
