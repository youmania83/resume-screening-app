import { useEffect } from "react";

interface UseAntiCheatProps {
  testStarted: boolean;
  testSubmitted: boolean;
  isMobile: boolean;
  logViolation: (type: string, details: string) => Promise<void>;
  setFullscreenError: (err: boolean) => void;
}

export function useAntiCheat({
  testStarted,
  testSubmitted,
  isMobile,
  logViolation,
  setFullscreenError,
}: UseAntiCheatProps) {
  useEffect(() => {
    if (!testStarted || testSubmitted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        logViolation("tab_switch", "Candidate switched tabs or minimized browser.");
      }
    };

    const handleFullscreenChange = () => {
      if (isMobile) return;
      if (!document.fullscreenElement) {
        logViolation("exit_fullscreen", "Candidate exited full screen mode.");
        setFullscreenError(true);
      } else {
        setFullscreenError(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!isMobile) {
      document.addEventListener("fullscreenchange", handleFullscreenChange);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (!isMobile) {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      }
    };
  }, [testStarted, testSubmitted, isMobile, logViolation, setFullscreenError]);

  useEffect(() => {
    if (!testStarted || testSubmitted) return;

    const preventDefault = (e: Event) => e.preventDefault();

    window.addEventListener("contextmenu", preventDefault);
    window.addEventListener("copy", preventDefault);
    window.addEventListener("paste", preventDefault);
    window.addEventListener("cut", preventDefault);

    return () => {
      window.removeEventListener("contextmenu", preventDefault);
      window.removeEventListener("copy", preventDefault);
      window.removeEventListener("paste", preventDefault);
      window.removeEventListener("cut", preventDefault);
    };
  }, [testStarted, testSubmitted]);
}
