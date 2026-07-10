import React from "react";
import { Lock, ShieldAlert, Maximize2 } from "lucide-react";
import { Toaster } from "sonner";

interface AssessmentInstructionsProps {
  jobTitle: string;
  candidateName: string;
  isMobile: boolean;
  token: string;
  requestFullscreen: () => Promise<void>;
  isResuming?: boolean;
  webcamStream?: MediaStream | null;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

export default function AssessmentInstructions({
  jobTitle,
  candidateName,
  isMobile,
  token,
  requestFullscreen,
  isResuming = false,
  webcamStream = null,
  videoRef,
}: AssessmentInstructionsProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between py-12 px-4 select-none">
      <Toaster position="top-right" theme="light" closeButton />
      <div className="max-w-xl w-full mx-auto bg-white border border-border rounded-2xl p-8 shadow-xl space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="h-10 w-10 bg-secondary border border-border rounded-lg flex items-center justify-center text-foreground/90">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Technical Assessment</h1>
            <p className="text-xs text-muted-foreground">Position: {jobTitle}</p>
          </div>
        </div>

        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Welcome, <strong className="text-foreground">{candidateName}</strong>.
          </p>
          <p>
            Please review the rules carefully before starting. Failure to comply with these rules can flag your
            submission and disqualify you automatically.
          </p>

          <div className="bg-background border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-xs uppercase font-extrabold text-muted-foreground tracking-wider flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" /> Exam Rules & Security Policies
            </h2>
            <ul className="space-y-2 text-xs text-muted-foreground list-disc list-inside">
              <li>
                <strong>15 Minutes Total Time</strong>: The exam contains 10 MCQs. You have 15 minutes. It auto-submits
                on expiry.
              </li>
              <li>
                <strong>Single Window Constraint</strong>: Tab switching, window minimization, or browser focus loss
                will log violations.
              </li>
              {!isMobile && (
                <li>
                  <strong>Fullscreen Locked</strong>: The test must be taken in Full-screen mode. Exiting fullscreen
                  logs a violation.
                </li>
              )}
              <li>
                <strong>Controls Disabled</strong>: Text copying, pasting, text cutting, selection, and right-clicks
                are disabled.
              </li>
              <li>
                <strong>Single active session</strong>: The test cannot be opened in multiple tabs or devices.
              </li>
            </ul>
          </div>

          {!isMobile && (
            <div className="bg-secondary/30 border border-border rounded-xl p-5 flex flex-col items-center gap-3 text-center">
              <h3 className="text-xs uppercase font-extrabold text-muted-foreground tracking-wider">
                🎥 Camera Setup Check
              </h3>
              {webcamStream ? (
                <div className="relative rounded-lg overflow-hidden border border-emerald-300 bg-black aspect-video w-full max-w-[240px] shadow-lg">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                  <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-emerald-50 border border-emerald-250 px-1.5 py-0.5 rounded text-[8.5px] font-bold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Webcam Active
                  </div>
                </div>
              ) : (
                <div className="h-[135px] w-full max-w-[240px] rounded-lg border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center p-4">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider animate-pulse">
                    Webcam Setup Pending
                  </span>
                  <p className="text-[9px] text-slate-400 mt-1 leading-tight">
                    Please allow camera access in your browser when prompted to continue.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-border flex flex-col gap-3">
          <button
            onClick={requestFullscreen}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
          >
            {isMobile ? (
              isResuming ? "Resume Assessment" : "Start Assessment"
            ) : (
              <>
                <Maximize2 className="h-4 w-4" /> {isResuming ? "Enter Fullscreen & Resume Test" : "Enter Fullscreen & Start Test"}
              </>
            )}
          </button>
          <p className="text-[10px] text-slate-400 text-center">
            {isMobile
              ? "By clicking, you authorize Techsol Engineers to start the session monitoring alerts."
              : "By clicking, you authorize Techsol Engineers to request Fullscreen access and start the session monitoring alerts."}
          </p>
        </div>
      </div>
      <div className="text-center text-[10px] text-slate-400">
        Secure Assessment ID: {token.substring(0, 12)}...
      </div>
    </div>
  );
}
