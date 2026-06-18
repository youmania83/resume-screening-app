"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { 
  ShieldAlert, 
  Clock, 
  ChevronRight, 
  ChevronLeft,
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Award, 
  Sparkles,
  Lock,
  Maximize2
} from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { toast, Toaster } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

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

export default function CandidateAssessmentPage() {
  const params = useParams();
  const token = params.token as string;

  const [sessionId, setSessionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreenError, setFullscreenError] = useState(false);

  // Assessment Info
  const [candidateName, setCandidateName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // Test State
  const [testStarted, setTestStarted] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Timer State
  const [remainingSeconds, setRemainingSeconds] = useState(10 * 60);
  
  // Navigation & Answers
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({});

  // Violations
  const [violationCount, setViolationCount] = useState(0);
  const [latestViolationMsg, setLatestViolationMsg] = useState<string | null>(null);

  // Result screen details
  const [result, setResult] = useState<ResultData | null>(null);

  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [faceViolation, setFaceViolation] = useState<"none" | "no_face" | "multiple_faces">("none");
  const modelRef = useRef<any>(null);
  const [isMobile, setIsMobile] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const proctorGraceActive = useRef(true);

  // Force light theme for the candidate assessment portal and detect mobile device
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.remove("dark");

    const checkMobile = () => {
      const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      setIsMobile(mobileCheck);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Link webcam stream to video element when active
  useEffect(() => {
    if (webcamStream && videoRef.current) {
      videoRef.current.srcObject = webcamStream;
    }
  }, [webcamStream]);

  // Clean up webcam stream tracks on component unmount
  useEffect(() => {
    return () => {
      if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [webcamStream]);

  // Load TensorFlow.js and BlazeFace models dynamically when the test is started (skipped on mobile)
  useEffect(() => {
    if (!testStarted || isMobile) return;

    let active = true;
    const loadScripts = async () => {
      try {
        if (!(window as any).tf) {
          const tfScript = document.createElement("script");
          tfScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs";
          tfScript.async = true;
          document.body.appendChild(tfScript);
          await new Promise((resolve) => (tfScript.onload = resolve));
        }

        if (!(window as any).blazeface) {
          const bfScript = document.createElement("script");
          bfScript.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface";
          bfScript.async = true;
          document.body.appendChild(bfScript);
          await new Promise((resolve) => (bfScript.onload = resolve));
        }

        if (active && (window as any).blazeface) {
          console.log("Loading BlazeFace model...");
          const model = await (window as any).blazeface.load();
          modelRef.current = model;
          setModelLoaded(true);
          console.log("BlazeFace model loaded successfully.");
        }
      } catch (err) {
        console.error("Failed to load face detection models:", err);
      }
    };

    loadScripts();

    return () => {
      active = false;
    };
  }, [testStarted]);

  // Periodic Face Proctoring Checks
  useEffect(() => {
    if (isMobile || !modelLoaded || !webcamStream || !videoRef.current || testSubmitted) return;

    let intervalId: NodeJS.Timeout;
    const detectFace = async () => {
      if (!videoRef.current || !modelRef.current || testSubmitted) return;

      try {
        if (videoRef.current.readyState >= 2 && videoRef.current.videoWidth > 0) {
          const predictions = await modelRef.current.estimateFaces(videoRef.current, false);

          if (predictions.length === 0) {
            setFaceViolation("no_face");
            logViolation("no_face_detected", "No face detected in webcam feed.");
          } else if (predictions.length > 1) {
            setFaceViolation("multiple_faces");
            logViolation("multiple_faces_detected", "Multiple faces detected in webcam feed!");
          } else {
            setFaceViolation("none");
          }
        }
      } catch (e) {
        console.error("Face detection check failed:", e);
      }
    };

    intervalId = setInterval(detectFace, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [modelLoaded, webcamStream, testSubmitted]);

  // Proctoring Grace Period to handle startup transition lag
  useEffect(() => {
    if (testStarted) {
      proctorGraceActive.current = true;
      const timer = setTimeout(() => {
        proctorGraceActive.current = false;
      }, 4000); // 4 seconds grace period to allow browser state to stabilize
      return () => clearTimeout(timer);
    }
  }, [testStarted]);

  // 1. Initialize session storage ID
  useEffect(() => {
    let sId = sessionStorage.getItem("assessment_session_id");
    if (!sId) {
      sId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem("assessment_session_id", sId);
    }
    setSessionId(sId);
  }, []);

  // 2. Fetch assessment details on mount/session check
  useEffect(() => {
    if (!token || !sessionId) return;

    const loadAssessment = async () => {
      try {
        const resp = await fetch(`${apiBase}/assessment/${token}?sessionId=${sessionId}`);
        if (!resp.ok) {
          const errData = await resp.json();
          // If already completed or expired, check if we can query results
          if (resp.status === 403 && (errData.error?.includes("completed") || errData.error?.includes("submitted"))) {
            // Attempt to load results directly
            const resultResp = await fetch(`${apiBase}/assessment/results/get?token=${token}`);
            if (resultResp.ok) {
              const resData = await resultResp.json();
              setResult(resData);
              setTestSubmitted(true);
              setLoading(false);
              return;
            }
          }
          throw new Error(errData.error || "Failed to load assessment information.");
        }

        const data = await resp.json();
        setCandidateName(data.candidateName);
        setJobTitle(data.jobTitle);
        setQuestions(data.questions);
        setRemainingSeconds(data.remainingSeconds);
        if (data.sessionId) {
          setSessionId(data.sessionId);
          sessionStorage.setItem("assessment_session_id", data.sessionId);
        }
        setLoading(false);
      } catch (err: any) {
        setError(err.message || "An unexpected error occurred.");
        setLoading(false);
      }
    };

    loadAssessment();
  }, [token, sessionId, apiBase]);

  // 3. Timer Countdown
  useEffect(() => {
    if (testStarted && !testSubmitted && remainingSeconds > 0) {
      timerRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [testStarted, testSubmitted]);

  // 4. Log Security Violation API helper
  const logViolation = async (type: string, details: string) => {
    if (!token || testSubmitted) return;
    if (proctorGraceActive.current) {
      console.log(`[Proctor Grace] Ignored startup transition violation: ${type} - ${details}`);
      return;
    }
    try {
      const resp = await fetch(`${apiBase}/assessment/violation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, violationType: type, details })
      });
      if (resp.ok) {
        const data = await resp.json();
        setViolationCount(data.count);
        setLatestViolationMsg(details);
        toast.warning(`Security Violation Warning: ${details} (${data.count} logged)`);
      }
    } catch (e) {
      console.error("Failed to post violation:", e);
    }
  };

  // 5. Anti-cheat browser listeners
  useEffect(() => {
    if (!testStarted || testSubmitted) return;

    // A. Detect Visibility Change (Tab Switch / Minimize)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logViolation("tab_switch", "Candidate switched tabs or minimized browser.");
      }
    };

    // B. Detect Focus Loss (Blur)
    const handleBlur = () => {
      logViolation("blur", "Candidate clicked outside exam window.");
    };

    // C. Detect Fullscreen Exits
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
    // window.addEventListener("blur", handleBlur); // Disabled to prevent false-positives from notifications/overlays
    if (!isMobile) {
      document.addEventListener("fullscreenchange", handleFullscreenChange);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // window.removeEventListener("blur", handleBlur);
      if (!isMobile) {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      }
    };
  }, [testStarted, testSubmitted, isMobile]);

  // 6. Security overrides: contextmenu, copy, paste, cut
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

  // Request fullscreen trigger
  const requestFullscreen = async () => {
    if (!isMobile) {
      // 1. Attempt Fullscreen (non-blocking on failure)
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        setFullscreenError(false);
      } catch (err) {
        console.warn("Fullscreen request rejected or not supported:", err);
        toast.warning("Fullscreen mode could not be locked. Please maximize your window to avoid cheating alerts.");
      }
    } else {
      setFullscreenError(false);
    }

    // Re-enable grace period for 4 seconds during transition to prevent false violations
    proctorGraceActive.current = true;
    setTimeout(() => {
      proctorGraceActive.current = false;
    }, 4000);

    // 2. Initialize proctoring webcam video feed (asynchronous background execution) - skip on mobile
    if (!isMobile && !webcamStream && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(stream => {
          setWebcamStream(stream);
        })
        .catch(camErr => {
          console.warn("Webcam blocked or not available:", camErr);
          toast.error("Proctoring webcam connection is recommended for identity verification.");
        });
    } else if (isMobile) {
      console.log("Skipping webcam initialization on mobile device.");
    } else {
      console.warn("Webcam API not supported in this browser context.");
    }

    // 3. Always transition to the test screen
    setTestStarted(true);
  };

  // Handle force resuming the test session
  const handleForceResume = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${apiBase}/assessment/${token}/force-resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldSessionId: sessionId })
      });
      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || "Failed to resume session.");
      }
      const data = await resp.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
        sessionStorage.setItem("assessment_session_id", data.sessionId);
      }
    } catch (err: any) {
      setError(err.message || "Failed to resume session.");
      setLoading(false);
    }
  };

  // Auto-submit when time expires
  const handleAutoSubmit = () => {
    toast.error("Time limit reached! Submitting assessment automatically...", { duration: 5000 });
    submitAssessment(true);
  };

  // Main Submit function
  const submitAssessment = async (isAuto = false) => {
    if (submitting || testSubmitted) return;
    
    // Confirm if manually submitting
    if (!isAuto) {
      const confirmSubmit = window.confirm("Are you sure you want to submit your assessment? You cannot modify your answers afterwards.");
      if (!confirmSubmit) return;
    }

    setSubmitting(true);
    toast.loading("Calculating assessment metrics and ranking status...", { id: "submit-loader" });

    // Exit fullscreen if possible
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (e) {}

    try {
      const timeTakenSec = (10 * 60) - remainingSeconds;
      
      const resp = await fetch(`${apiBase}/assessment/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          answers,
          sessionId,
          timeTaken: timeTakenSec
        })
      });

      if (!resp.ok) {
        throw new Error("Failed to submit assessment answers.");
      }

      // Fetch finalized results
      const resultResp = await fetch(`${apiBase}/assessment/results/get?token=${token}`);
      if (!resultResp.ok) {
        throw new Error("Assessment submitted successfully, but scorecard failed to load.");
      }

      const resData = await resultResp.json();
      setResult(resData);
      setTestSubmitted(true);
      toast.success("Assessment submitted successfully!", { id: "submit-loader" });
    } catch (err: any) {
      toast.error(err.message || "Failed to submit.", { id: "submit-loader" });
    } finally {
      if (webcamStream) {
        try {
          webcamStream.getTracks().forEach(track => track.stop());
        } catch (e) {}
        setWebcamStream(null);
      }
      setSubmitting(false);
    }
  };

  const handleSelectOption = (qId: string, option: string) => {
    setAnswers(prev => ({
      ...prev,
      [qId]: option
    }));
  };

  const toggleFlag = (idx: number) => {
    setFlaggedQuestions(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // Format seconds -> MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-800">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
          <p className="text-sm text-slate-500 font-semibold tracking-wide">Initializing secure portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const isSessionMismatch = error.includes("Only one active session allowed");

    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-800 px-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-500 to-rose-500" />
          <div className={`h-14 w-14 rounded-full flex items-center justify-center mx-auto border ${
            isSessionMismatch ? "bg-amber-50 border-amber-200 text-amber-600" : "bg-red-50 border-red-200 text-red-600"
          }`}>
            {isSessionMismatch ? <Lock className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {isSessionMismatch ? "Session in Progress" : "Access Prohibited"}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {isSessionMismatch 
                ? "This assessment is already active in another browser, tab, or window. If you closed it or switched devices, you can resume it here. Resuming will close any other active windows."
                : error
              }
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
          <div className="text-xs text-slate-400 border-t border-slate-100 pt-4">
            Security logs recorded. IP & active session identifiers are mapped.
          </div>
        </div>
      </div>
    );
  }

  // --- SCORECARD RESULT VIEW ---
  if (testSubmitted && result) {
    const isPass = result.status === "PASS";
    const minutes = Math.floor(result.timeTaken / 60);
    const seconds = result.timeTaken % 60;
    
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between py-12 px-4 select-none">
        <Toaster position="top-right" theme="light" closeButton />
        <div className="max-w-xl w-full mx-auto bg-white border border-slate-200 rounded-2xl p-8 shadow-xl space-y-8">
          
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Assessment Completed</h1>
            <p className="text-xs text-slate-500">Your test answers have been analyzed and locked.</p>
          </div>

          {/* Results Summary Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 relative overflow-hidden">
            {isPass && <div className="absolute right-0 top-0 h-20 w-20 bg-emerald-500/5 rotate-45 transform translate-x-8 -translate-y-8" />}
            
            <div className="flex flex-col items-center justify-center border-b border-slate-200 pb-5 mb-5 space-y-1">
              <span className="text-xs text-slate-500 uppercase tracking-widest font-bold">Your Score</span>
              <span className={`text-5xl font-extrabold tracking-tight ${isPass ? "text-emerald-600" : "text-rose-600"}`}>
                {result.assessmentScore}%
              </span>
              <Badge className={`text-[9.5px] font-bold tracking-wider uppercase px-2.5 py-0.5 mt-2.5 border ${
                isPass 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                  : "bg-rose-50 border-rose-200 text-rose-700"
              }`}>
                {result.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Candidate:</span>
                <span className="font-semibold text-slate-900 mt-0.5 truncate">{result.candidateName}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Role Target:</span>
                <span className="font-semibold text-slate-900 mt-0.5 truncate">{result.jobRole}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Correct Answers:</span>
                <span className="font-semibold text-emerald-600 mt-0.5 font-mono">
                  {result.correctAnswers} / {result.totalQuestions}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Time Taken:</span>
                <span className="font-semibold text-slate-900 mt-0.5 font-mono">
                  {minutes}m {seconds}s
                </span>
              </div>
              <div className="flex flex-col col-span-2">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Security Violations:</span>
                <span className={`font-semibold mt-0.5 font-mono flex items-center gap-1.5 ${
                  result.violationCount > 0 ? "text-amber-600 font-bold" : "text-emerald-600"
                }`}>
                  {result.violationCount} Violations
                  {result.violationCount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                </span>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="border-t border-slate-100 pt-6 text-center space-y-3">
            {isPass ? (
              <p className="text-xs text-slate-600 leading-relaxed">
                🎉 Congratulations! You have met the qualification criteria. An automated calendar invite has been sent to your email to schedule a final video interview panel with the HR team.
              </p>
            ) : (
              <p className="text-xs text-slate-600 leading-relaxed">
                Thank you for completing the assessment. Your details have been recorded in our talent database. If our team decides to proceed with alternative roles, we will contact you.
              </p>
            )}
            <div className="text-[9.5px] text-slate-400 pt-2 font-mono">
              Secure Session ID: {sessionId.substring(0, 15)}...
            </div>
          </div>

        </div>
        
        <div className="text-center text-[10px] text-slate-500 font-medium">
          Powered by Rison AI Screen & Assessment Engine
        </div>
      </div>
    );
  }

  // --- EXAM INSTRUCTIONS SCREEN ---
  if (!testStarted) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between py-12 px-4 select-none">
        <Toaster position="top-right" theme="light" closeButton />
        <div className="max-w-xl w-full mx-auto bg-white border border-slate-200 rounded-2xl p-8 shadow-xl space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <div className="h-10 w-10 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center text-slate-700">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">Technical Assessment</h1>
              <p className="text-xs text-slate-500">Position: {jobTitle}</p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-slate-600">
            <p>Welcome, <strong className="text-slate-900">{candidateName}</strong>.</p>
            <p>Please review the rules carefully before starting. Failure to comply with these rules can flag your submission and disqualify you automatically.</p>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
              <h2 className="text-xs uppercase font-extrabold text-slate-500 tracking-wider flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" /> Exam Rules & Security Policies
              </h2>
              <ul className="space-y-2 text-xs text-slate-600 list-disc list-inside">
                <li><strong>15 Minutes Total Time</strong>: The exam contains 10 MCQs. You have 15 minutes. It auto-submits on expiry.</li>
                <li><strong>Single Window Constraint</strong>: Tab switching, window minimization, or browser focus loss will log violations.</li>
                {!isMobile && <li><strong>Fullscreen Locked</strong>: The test must be taken in Full-screen mode. Exiting fullscreen logs a violation.</li>}
                <li><strong>Controls Disabled</strong>: Text copying, pasting, text cutting, selection, and right-clicks are disabled.</li>
                <li><strong>Single active session</strong>: The test cannot be opened in multiple tabs or devices.</li>
              </ul>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
            <button
              onClick={requestFullscreen}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-lg text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
            >
              {isMobile ? "Start Assessment" : <><Maximize2 className="h-4 w-4" /> Enter Fullscreen & Start Test</>}
            </button>
            <p className="text-[10px] text-slate-400 text-center">
              {isMobile 
                ? "By clicking, you authorize Rison AI to start the session monitoring alerts."
                : "By clicking, you authorize Rison AI to request Fullscreen access and start the session monitoring alerts."
              }
            </p>
          </div>
        </div>
        <div className="text-center text-[10px] text-slate-400">
          Secure Assessment ID: {token.substring(0, 12)}...
        </div>
      </div>
    );
  }

  // --- ACTIVE TESTING SCREEN ---
  const currentQuestion = questions[currentIdx];
  const selectedAnswer = answers[currentQuestion.id];
  const isFlagged = flaggedQuestions[currentIdx];
  const progressPercent = Math.round(((Object.keys(answers).length) / questions.length) * 100);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between select-none">
      <Toaster position="top-right" theme="light" closeButton />

      {/* A. HEADER */}
      <header className="bg-white/95 border-b border-slate-200 px-6 py-4 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">Candidate Portal</span>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2 mt-0.5">
              {jobTitle} Assessment <span className="hidden sm:inline">— {candidateName}</span>
            </h2>
          </div>

          {/* TIMER */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs font-bold ${
              remainingSeconds < 120 
                ? "bg-rose-50 border-rose-200 text-rose-600 animate-pulse" 
                : "bg-slate-100 border-slate-200 text-emerald-600"
            }`}>
              <Clock className="h-3.5 w-3.5" />
              {formatTime(remainingSeconds)}
            </div>

            {/* Submit */}
            <button
              onClick={() => submitAssessment(false)}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-4 py-2 rounded-md transition-colors cursor-pointer shadow-md"
            >
              Submit Test
            </button>
          </div>
        </div>
      </header>

      {/* SECURITY LOCKOVER OVERLAY IF USER EXITED FULLSCREEN */}
      <AnimatePresence>
        {!isMobile && fullscreenError && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-100/98 z-50 flex items-center justify-center p-4"
          >
            <div className="max-w-md w-full bg-white border border-amber-200 rounded-xl p-8 text-center space-y-6 shadow-2xl">
              <div className="h-14 w-14 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto text-amber-600 animate-bounce">
                <Maximize2 className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Fullscreen Lock Needed</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  As part of our cheating prevention policy, you must remain in full-screen mode for the duration of this technical assessment.
                </p>
              </div>
              <button
                onClick={requestFullscreen}
                className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2.5 rounded-md text-xs transition-colors cursor-pointer"
              >
                Re-enter Fullscreen & Continue
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* B. MAIN INTERFACE */}
      <main className="max-w-5xl w-full mx-auto px-6 py-8 flex-1 grid grid-cols-1 md:grid-cols-4 gap-8">
        
        {/* Left column - Question Grid & Status */}
        <div className="md:col-span-1 space-y-6 order-2 md:order-1">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5 shadow-sm">
            <div>
              <h3 className="text-xs uppercase font-extrabold tracking-wider text-slate-500">Assessment Progress</h3>
              <div className="mt-2.5 flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-slate-950 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-slate-500 font-mono leading-none">{progressPercent}%</span>
              </div>
            </div>

            {/* Grid */}
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">Question List</span>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {questions.map((q, idx) => {
                  const isAnswered = answers[q.id] !== undefined;
                  const isCur = currentIdx === idx;
                  const flagged = flaggedQuestions[idx];

                  let btnClass = "border-slate-200 bg-white text-slate-500 hover:bg-slate-50";
                  if (isCur) {
                    btnClass = "border-slate-900 bg-slate-900 text-white font-bold shadow-md";
                  } else if (flagged) {
                    btnClass = "border-amber-200 bg-amber-50 text-amber-600";
                  } else if (isAnswered) {
                    btnClass = "border-emerald-200 bg-emerald-50 text-emerald-600";
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIdx(idx)}
                      className={`h-9 w-full rounded border text-xs font-semibold flex items-center justify-center transition-all cursor-pointer ${btnClass}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Security Alerts summary */}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <h4 className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider">Security Shield</h4>
              <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Monitoring Online
              </div>
              {violationCount > 0 && (
                <div className="text-[10px] bg-red-50 p-2.5 rounded text-red-600 flex flex-col gap-1">
                  <span className="font-bold flex items-center gap-1 uppercase tracking-wide">
                    <ShieldAlert className="h-3 w-3 text-red-500" /> {violationCount} Violations Recorded
                  </span>
                  <span className="text-[9px] text-slate-500 italic truncate">Latest: {latestViolationMsg}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column - Question Card */}
        <div className="md:col-span-3 order-1 md:order-2">
          <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col justify-between min-h-[420px] shadow-sm">
            
            {/* Header info */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Question {currentIdx + 1} of {questions.length}
                </span>
                
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[9px] font-extrabold uppercase px-2 tracking-wider border-slate-200 text-slate-600">
                    {currentQuestion.topic}
                  </Badge>
                  <Badge variant="outline" className={`text-[9px] font-extrabold uppercase px-2 tracking-wider border-slate-200 ${
                    currentQuestion.difficulty === "easy" ? "text-emerald-600" :
                    currentQuestion.difficulty === "medium" ? "text-amber-600" :
                    "text-rose-600"
                  }`}>
                    {currentQuestion.difficulty}
                  </Badge>
                  
                  <button
                    onClick={() => toggleFlag(currentIdx)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 transition-all cursor-pointer ${
                      isFlagged 
                        ? "bg-amber-50 border-amber-200 text-amber-600" 
                        : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                    }`}
                  >
                    Flag
                  </button>
                </div>
              </div>

              {/* Question Text */}
              <h1 className="text-base font-semibold leading-relaxed text-slate-900">
                {currentQuestion.questionText}
              </h1>

              {/* Options */}
              <div className="space-y-3 pt-3">
                {currentQuestion.options.map((option, oIdx) => {
                  const isSel = selectedAnswer === option;
                  
                  return (
                    <button
                      key={oIdx}
                      onClick={() => handleSelectOption(currentQuestion.id, option)}
                      className={`w-full text-left p-4 rounded-lg border text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${
                        isSel
                          ? "bg-slate-900 border-slate-900 text-white font-bold shadow-md"
                          : "bg-slate-50/50 border-slate-200 text-slate-700 hover:bg-slate-100/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-5 w-5 rounded-full flex items-center justify-center border text-[10px] font-extrabold ${
                          isSel 
                            ? "bg-slate-800 border-slate-700 text-white" 
                            : "bg-white border-slate-200 text-slate-500"
                        }`}>
                          {String.fromCharCode(65 + oIdx)}
                        </span>
                        {option}
                      </div>
                      
                      {isSel && <div className="h-2 w-2 rounded-full bg-white" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="border-t border-slate-100 pt-6 flex items-center justify-between mt-8">
              <button
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx(prev => prev - 1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>

              {currentIdx < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentIdx(prev => prev + 1)}
                  className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 px-4 py-2 rounded text-xs font-bold transition-colors cursor-pointer"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => submitAssessment(false)}
                  className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-6 py-2.5 rounded transition-all cursor-pointer shadow-lg"
                >
                  Submit Assessment
                </button>
              )}
            </div>

          </div>
        </div>

      </main>

      {/* C. FOOTER */}
      <footer className="bg-slate-100 border-t border-slate-200 py-3.5 text-center text-[10px] text-slate-500">
        🛡️ Rison AI Secure Proctor System. Text selection, copy, paste, and right-clicks are disabled. Avoid exiting fullscreen mode.
      </footer>
      {/* Webcam Monitoring Stream Floating Preview */}
      {webcamStream && (
        <div className="fixed bottom-6 right-6 z-40 bg-white border border-slate-200 rounded-xl p-2.5 shadow-xl flex flex-col gap-1.5 w-44 backdrop-blur-md">
          <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-black aspect-video w-full">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-full object-cover scale-x-[-1]" 
            />
            {faceViolation === "no_face" ? (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-600 border border-red-700 px-1.5 py-0.5 rounded text-[8.5px] font-bold text-white animate-pulse">
                <span>⚠️ NO FACE DETECTED</span>
              </div>
            ) : faceViolation === "multiple_faces" ? (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-red-650 border border-red-700 px-1.5 py-0.5 rounded text-[8.5px] font-bold text-white animate-pulse">
                <span>⚠️ MULTIPLE FACES</span>
              </div>
            ) : (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[8.5px] font-bold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LIVE PROCTOR
              </div>
            )}
          </div>
          <div className={`text-[9px] text-center font-bold tracking-wide ${
            faceViolation !== "none" ? "text-red-600 animate-pulse" : "text-slate-500"
          }`}>
            {!modelLoaded 
              ? "🔄 Loading Proctor AI..." 
              : faceViolation === "no_face" 
              ? "Candidate Face Missing" 
              : faceViolation === "multiple_faces" 
              ? "Multiple People Detected" 
              : "🛡️ Face Proctor Active"
            }
          </div>
        </div>
      )}
    </div>
  );
}
