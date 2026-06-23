import React from "react";
import { Maximize2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProctoringOverlayProps {
  fullscreenError: boolean;
  requestFullscreen: () => Promise<void>;
  isMobile: boolean;
  webcamStream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  faceViolation: "none" | "no_face" | "multiple_faces";
  modelLoaded: boolean;
  dismissFullscreenError?: () => void;
}

export default function ProctoringOverlay({
  fullscreenError,
  requestFullscreen,
  isMobile,
  webcamStream,
  videoRef,
  faceViolation,
  modelLoaded,
  dismissFullscreenError,
}: ProctoringOverlayProps) {
  return (
    <>
      {/* SECURITY LOCKOVER OVERLAY IF USER EXITED FULLSCREEN */}
      <AnimatePresence>
        {!isMobile && fullscreenError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-secondary/98 z-50 flex items-center justify-center p-4"
          >
            <div className="max-w-md w-full bg-white border border-amber-200 rounded-xl p-8 text-center space-y-6 shadow-2xl">
              <div className="h-14 w-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 animate-bounce">
                <Maximize2 className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">Fullscreen Lock Needed</h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  As part of our cheating prevention policy, you must remain in full-screen mode for the duration of
                  this technical assessment.
                </p>
              </div>
              <div className="space-y-3">
                <button
                  onClick={requestFullscreen}
                  className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 rounded-md text-xs transition-colors cursor-pointer"
                >
                  Re-enter Fullscreen & Continue
                </button>
                {dismissFullscreenError && (
                  <button
                    onClick={dismissFullscreenError}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-md text-xs transition-colors cursor-pointer border border-slate-200 animate-fade-in"
                  >
                    Continue in Windowed Mode (Flagged)
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Webcam Monitoring Stream Floating Preview */}
      {webcamStream && (
        <div className="fixed bottom-6 right-6 z-40 bg-white border border-border rounded-xl p-2.5 shadow-xl flex flex-col gap-1.5 w-44 backdrop-blur-md">
          <div className="relative rounded-lg overflow-hidden border border-border bg-black aspect-video w-full">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {faceViolation === "no_face" ? (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-650 border border-red-750 px-1.5 py-0.5 rounded text-[8.5px] font-bold text-white animate-pulse">
                <span>⚠️ NO FACE DETECTED</span>
              </div>
            ) : faceViolation === "multiple_faces" ? (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-650 border border-red-750 px-1.5 py-0.5 rounded text-[8.5px] font-bold text-white animate-pulse">
                <span>⚠️ MULTIPLE FACES</span>
              </div>
            ) : (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[8.5px] font-bold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE PROCTOR
              </div>
            )}
          </div>
          <div
            className={`text-[9px] text-center font-bold tracking-wide ${
              faceViolation !== "none" ? "text-red-600 animate-pulse" : "text-muted-foreground"
            }`}
          >
            {!modelLoaded
              ? "🔄 Loading Proctor AI..."
              : faceViolation === "no_face"
              ? "Candidate Face Missing"
              : faceViolation === "multiple_faces"
              ? "Multiple People Detected"
              : "🛡️ Face Proctor Active"}
          </div>
        </div>
      )}
    </>
  );
}
