import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useProctoring } from "./useProctoring";
import { useAntiCheat } from "./useAntiCheat";
import * as api from "../services/AssessmentApiService";

interface Question {
  id: string;
  questionText: string;
  options: string[];
  difficulty: string;
  topic: string;
}

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

export function useAssessmentSession(token: string) {
  const [sessionId, setSessionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenError, setFullscreenError] = useState(false);

  const [candidateName, setCandidateName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  
  const [testStarted, setTestStarted] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [remainingSeconds, setRemainingSeconds] = useState(10 * 60);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({});

  const [violationCount, setViolationCount] = useState(0);
  const [latestViolationMsg, setLatestViolationMsg] = useState<string | null>(null);
  const [result, setResult] = useState<ResultData | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const proctorGraceActive = useRef(true);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.remove("dark");
    const checkMobile = () => {
      setIsMobile(
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth < 768 ||
        (typeof navigator !== "undefined" && navigator.maxTouchPoints !== undefined && navigator.maxTouchPoints > 1)
      );
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const logViolation = useCallback(
    async (type: string, details: string) => {
      if (!token || testSubmitted) return;
      if (proctorGraceActive.current) return;
      try {
        const data = await api.postViolation(token, type, details);
        setViolationCount(data.count);
        setLatestViolationMsg(details);
        toast.warning(`Security Violation Warning: ${details} (${data.count} logged)`);
      } catch {
        console.error("Failed to post violation");
      }
    },
    [token, testSubmitted]
  );

  const proctoring = useProctoring({
    testStarted,
    testSubmitted,
    isMobile,
    logViolation,
  });

  useAntiCheat({
    testStarted,
    testSubmitted,
    isMobile,
    logViolation,
    setFullscreenError,
  });

  useEffect(() => {
    if (testStarted) {
      proctorGraceActive.current = true;
      const timer = setTimeout(() => {
        proctorGraceActive.current = false;
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [testStarted]);

  useEffect(() => {
    let sId = sessionStorage.getItem("assessment_session_id");
    if (!sId) {
      sId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem("assessment_session_id", sId);
    }
    setSessionId(sId);
  }, []);

  useEffect(() => {
    if (!token || !sessionId) return;
    const loadAssessment = async () => {
      try {
        const res = await api.fetchAssessment(token, sessionId);
        if (res.isCompleted) {
          setResult(res.result);
          setTestSubmitted(true);
        } else if (res.data) {
          setCandidateName(res.data.candidateName);
          setJobTitle(res.data.jobTitle);
          setQuestions(res.data.questions);
          setRemainingSeconds(res.data.remainingSeconds);
          if (res.data.sessionId) {
            setSessionId(res.data.sessionId);
            sessionStorage.setItem("assessment_session_id", res.data.sessionId);
          }

          // Restore progress from server with local storage fallback
          const serverAnswers = res.data.currentAnswers || {};
          const serverIdx = res.data.currentQuestionIndex || 0;

          const localAnswersStr = localStorage.getItem(`answers_${token}`);
          if (localAnswersStr && Object.keys(serverAnswers).length === 0) {
            try {
              setAnswers(JSON.parse(localAnswersStr));
            } catch {}
          } else {
            setAnswers(serverAnswers);
          }

          const localIdxStr = localStorage.getItem(`currentIdx_${token}`);
          if (localIdxStr && serverIdx === 0) {
            const localIdx = parseInt(localIdxStr, 10);
            if (!isNaN(localIdx) && localIdx >= 0 && localIdx < res.data.questions.length) {
              setCurrentIdx(localIdx);
            }
          } else {
            const finalIdx = typeof serverIdx === "number" && serverIdx < res.data.questions.length ? serverIdx : 0;
            setCurrentIdx(finalIdx);
          }
        }
        setLoading(false);
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
        setLoading(false);
      }
    };
    loadAssessment();
  }, [token, sessionId]);

  useEffect(() => {
    if (!testStarted || testSubmitted || !token || !sessionId) return;
    
    // Send initial heartbeat
    api.sendHeartbeat(token, sessionId);
    
    const interval = setInterval(() => {
      api.sendHeartbeat(token, sessionId);
    }, 15000);
    
    return () => clearInterval(interval);
  }, [testStarted, testSubmitted, token, sessionId]);

  const submitAssessment = useCallback(
    async (isAuto = false) => {
      if (submitting || testSubmitted) return;
      if (!isAuto && !window.confirm("Are you sure you want to submit your assessment?")) return;

      setSubmitting(true);
      toast.loading("Calculating assessment metrics...", { id: "submit-loader" });

      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {}

      try {
        const timeTakenSec = 10 * 60 - remainingSeconds;
        const resData = await api.submitAnswers(token, answers, sessionId, timeTakenSec);
        setResult(resData);
        setTestSubmitted(true);
        toast.success("Assessment submitted successfully!", { id: "submit-loader" });
      } catch (err: any) {
        toast.error(err.message || "Failed to submit.", { id: "submit-loader" });
      } finally {
        proctoring.stopWebcam();
        setSubmitting(false);
      }
    },
    [submitting, testSubmitted, remainingSeconds, token, answers, sessionId, proctoring]
  );

  const submitAssessmentRef = useRef<any>(null);
  useEffect(() => {
    submitAssessmentRef.current = submitAssessment;
  });

  useEffect(() => {
    if (testStarted && !testSubmitted && remainingSeconds > 0) {
      timerRef.current = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            toast.error("Time limit reached! Submitting...", { duration: 5000 });
            if (submitAssessmentRef.current) submitAssessmentRef.current(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [testStarted, testSubmitted, remainingSeconds]);

  const requestFullscreen = async () => {
    if (!isMobile) {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        setFullscreenError(false);
      } catch (err) {
        console.warn("Fullscreen request rejected:", err);
      }
    } else {
      setFullscreenError(false);
    }
    proctorGraceActive.current = true;
    setTimeout(() => {
      proctorGraceActive.current = false;
    }, 4000);
    if (!isMobile) {
      await proctoring.startWebcam();
    }
    setTestStarted(true);
  };

  const handleForceResume = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.forceResumeSession(token, sessionId);
      if (data.sessionId) {
        setSessionId(data.sessionId);
        sessionStorage.setItem("assessment_session_id", data.sessionId);
      }
    } catch (err: any) {
      setError(err.message || "Failed to resume session.");
      setLoading(false);
    }
  };

  const saveProgress = useCallback(
    async (newAnswers: Record<string, string>, newIdx: number) => {
      // 1. Save locally
      localStorage.setItem(`answers_${token}`, JSON.stringify(newAnswers));
      localStorage.setItem(`currentIdx_${token}`, newIdx.toString());

      // 2. Save to backend (fire-and-forget, non-blocking)
      if (navigator.onLine) {
        try {
          await api.saveAssessmentProgress(token, newAnswers, newIdx);
        } catch (err) {
          console.warn("Non-blocking save progress failed:", err);
        }
      }
    },
    [token]
  );

  const handleSelectOption = (qId: string, option: string) => {
    setAnswers((prev) => {
      const updated = { ...prev, [qId]: option };
      saveProgress(updated, currentIdx);
      return updated;
    });
  };

  const handleSetCurrentIdx = (newIdx: number) => {
    setCurrentIdx(newIdx);
    saveProgress(answers, newIdx);
  };

  const toggleFlag = (idx: number) => {
    setFlaggedQuestions((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const progressPercent = questions.length > 0
    ? Math.round((Object.keys(answers).length / questions.length) * 100)
    : 0;

  const dismissFullscreenError = () => {
    setFullscreenError(false);
  };

  const isResuming = Object.keys(answers).length > 0 || currentIdx > 0;

  return {
    sessionId,
    loading,
    error,
    fullscreenError,
    candidateName,
    jobTitle,
    questions,
    testStarted,
    testSubmitted,
    submitting,
    remainingSeconds,
    currentIdx,
    setCurrentIdx: handleSetCurrentIdx,
    answers,
    flaggedQuestions,
    violationCount,
    latestViolationMsg,
    result,
    isMobile,
    progressPercent,
    proctoring,
    requestFullscreen,
    handleForceResume,
    submitAssessment,
    handleSelectOption,
    toggleFlag,
    dismissFullscreenError,
    isResuming,
  };
}
