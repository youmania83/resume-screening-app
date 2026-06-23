import React from "react";
import { Clock, ShieldAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Toaster } from "sonner";

interface Question {
  id: string;
  questionText: string;
  options: string[];
  difficulty: string;
  topic: string;
}

interface ExamInterfaceProps {
  jobTitle: string;
  candidateName: string;
  remainingSeconds: number;
  submitAssessment: (isAuto?: boolean) => Promise<void>;
  progressPercent: number;
  questions: Question[];
  currentIdx: number;
  setCurrentIdx: (idx: number) => void;
  answers: Record<string, string>;
  flaggedQuestions: Record<string, boolean>;
  toggleFlag: (idx: number) => void;
  handleSelectOption: (qId: string, option: string) => void;
  violationCount: number;
  latestViolationMsg: string | null;
}

export default function ExamInterface({
  jobTitle,
  candidateName,
  remainingSeconds,
  submitAssessment,
  progressPercent,
  questions,
  currentIdx,
  setCurrentIdx,
  answers,
  flaggedQuestions,
  toggleFlag,
  handleSelectOption,
  violationCount,
  latestViolationMsg,
}: ExamInterfaceProps) {
  const currentQuestion = questions[currentIdx];
  const selectedAnswer = answers[currentQuestion?.id];
  const isFlagged = flaggedQuestions[currentIdx];

  const [isOnline, setIsOnline] = React.useState(true);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleSubmitClick = () => {
    if (!isOnline) {
      alert("⚠️ You are currently offline. Please restore your internet connection before submitting your assessment so your answers can be graded.");
      return;
    }
    submitAssessment(false);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (!currentQuestion) return null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between select-none">
      <Toaster position="top-right" theme="light" closeButton />

      {/* OFFLINE RESILIENCE BANNER */}
      {!isOnline && (
        <div className="bg-amber-600 text-white text-xs font-bold py-2 px-6 text-center animate-pulse flex items-center justify-center gap-2 sticky top-0 z-20 shadow-md">
          <span>📶 Working Offline. Answers are saved locally in browser cache and will sync automatically when your connection returns.</span>
        </div>
      )}

      {/* A. HEADER */}
      <header className="bg-white/95 border-b border-border px-6 py-4 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-extrabold tracking-wider">Candidate Portal</span>
            <h2 className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2 mt-0.5">
              {jobTitle} Assessment <span className="hidden sm:inline">— {candidateName}</span>
            </h2>
          </div>

          {/* TIMER */}
          <div className="flex items-center gap-4">
            {/* Connection Status Badge */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold ${
                isOnline
                  ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                  : "bg-amber-50 border-amber-200 text-amber-600 animate-pulse"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-500" : "bg-amber-500 animate-ping"}`} />
              {isOnline ? "Cloud Synced" : "Offline Mode"}
            </div>

            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs font-bold ${
                remainingSeconds < 120
                  ? "bg-rose-50 border-rose-200 text-rose-600 animate-pulse"
                  : "bg-secondary border-border text-emerald-600"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {formatTime(remainingSeconds)}
            </div>

            {/* Submit */}
            <button
              onClick={handleSubmitClick}
              className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-4 py-2 rounded-md transition-colors cursor-pointer shadow-md"
            >
              Submit Test
            </button>
          </div>
        </div>
      </header>

      {/* B. MAIN INTERFACE */}
      <main className="max-w-5xl w-full mx-auto px-6 py-8 flex-1 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Left column - Question Grid & Status */}
        <div className="md:col-span-1 space-y-6 order-2 md:order-1">
          <div className="bg-white border border-border rounded-xl p-5 space-y-5 shadow-sm">
            <div>
              <h3 className="text-xs uppercase font-extrabold tracking-wider text-muted-foreground">
                Assessment Progress
              </h3>
              <div className="mt-2.5 flex items-center gap-3">
                <div className="flex-1 bg-secondary rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-slate-950 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-muted-foreground font-mono leading-none">
                  {progressPercent}%
                </span>
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

                  let btnClass = "border-border bg-white text-muted-foreground hover:bg-background";
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
            <div className="border-t border-border pt-4 space-y-2">
              <h4 className="text-[10px] uppercase font-extrabold text-muted-foreground tracking-wider">
                Security Shield
              </h4>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Monitoring Online
              </div>
              {violationCount > 0 && (
                <div className="text-[10px] bg-red-50 p-2.5 rounded text-red-600 flex flex-col gap-1">
                  <span className="font-bold flex items-center gap-1 uppercase tracking-wide">
                    <ShieldAlert className="h-3 w-3 text-red-500" /> {violationCount} Violations Recorded
                  </span>
                  <span className="text-[9px] text-muted-foreground italic truncate">Latest: {latestViolationMsg}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column - Question Card */}
        <div className="md:col-span-3 order-1 md:order-2">
          <div className="bg-white border border-border rounded-xl p-8 flex flex-col justify-between min-h-[420px] shadow-sm">
            {/* Header info */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  Question {currentIdx + 1} of {questions.length}
                </span>

                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className="text-[9px] font-extrabold uppercase px-2 tracking-wider border-border text-muted-foreground"
                  >
                    {currentQuestion.topic}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`text-[9px] font-extrabold uppercase px-2 tracking-wider border-border ${
                      currentQuestion.difficulty === "easy"
                        ? "text-emerald-600"
                        : currentQuestion.difficulty === "medium"
                        ? "text-amber-600"
                        : "text-rose-600"
                    }`}
                  >
                    {currentQuestion.difficulty}
                  </Badge>

                  <button
                    onClick={() => toggleFlag(currentIdx)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 transition-all cursor-pointer ${
                      isFlagged
                        ? "bg-amber-50 border-amber-200 text-amber-600"
                        : "bg-background border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    Flag
                  </button>
                </div>
              </div>

              {/* Question Text */}
              <h1 className="text-base font-semibold leading-relaxed text-foreground">
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
                          : "bg-background/50 border-border text-foreground/90 hover:bg-secondary/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-5 w-5 rounded-full flex items-center justify-center border text-[10px] font-extrabold ${
                            isSel ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-border text-muted-foreground"
                          }`}
                        >
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
            <div className="border-t border-border pt-6 flex items-center justify-between mt-8">
              <button
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx(currentIdx - 1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded border border-border text-xs font-bold text-muted-foreground hover:bg-background disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>

              {currentIdx < questions.length - 1 ? (
                <button
                  onClick={() => setCurrentIdx(currentIdx + 1)}
                  className="flex items-center gap-1.5 bg-background hover:bg-secondary border border-border text-muted-foreground px-4 py-2 rounded text-xs font-bold transition-colors cursor-pointer"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmitClick}
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
      <footer className="bg-secondary border-t border-border py-3.5 text-center text-[10px] text-muted-foreground">
        🛡️ Rison AI Secure Proctor System. Text selection, copy, paste, and right-clicks are disabled. Avoid exiting
        fullscreen mode.
      </footer>
    </div>
  );
}
