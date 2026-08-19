// src/components/dashboard/ScreeningView.tsx
import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  Sparkles, 
  RefreshCw, 
  Plus, 
  Search, 
  CheckCircle2, 
  Users, 
  Award, 
  CalendarCheck, 
  ChevronRight, 
  X
} from "lucide-react";
import { AiScreeningConsole } from "./screening/AiScreeningConsole";
import { ManualIngestionModal } from "./screening/ManualIngestionModal";
import { Candidate, StructuredJD } from "../../types/index";
import { CandidateStats } from "../../hooks/useCandidates";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface ScreeningViewProps {
  stats?: CandidateStats;
  importTab: "url" | "file" | "text";
  setImportTab: (tab: "url" | "file" | "text") => void;
  importUrl: string;
  setImportUrl: (url: string) => void;
  jdTextPaste: string;
  setJdTextPaste: (text: string) => void;
  jdFile: File | null;
  setJdFile: (file: File | null) => void;
  isExtracting: boolean;
  activeJD: StructuredJD | null;
  setActiveJD: (jd: StructuredJD | null) => void;
  isEditingJD: boolean;
  setIsEditingJD: (editing: boolean) => void;
  handleJdImport: () => void;
  handleSaveJD: () => void;
  jdFileInputRef: React.RefObject<HTMLInputElement | null>;

  isIngesting: boolean;
  dragActive: boolean;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  triggerFileSelect: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  triggerFolderSelect: () => void;
  folderInputRef: React.RefObject<HTMLInputElement | null>;
  handleFolderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadProgress: Record<string, number>;
  screeningQueue: any[];
  candidates: Candidate[];
  selectedCandidate: Candidate | null;
  setSelectedCandidate: (candidate: Candidate | null) => void;
  dismissQueueItem: (id: string) => void;

  handleDeleteCandidate: (id: string) => void;
  assessmentScoreInput: number;
  setAssessmentScoreInput: (score: number) => void;
  handleAssessmentSubmit: (id: string, score: number) => void;
  isAssessmentSubmitting: boolean;
  interviewFeedbackInput: string;
  setInterviewFeedbackInput: (text: string) => void;
  handleInterviewSubmit: (id: string, decision: "pass" | "fail", feedback: string) => void;
  isInterviewSubmitting: boolean;
  isOnboardingSubmitting: boolean;
  handleOnboardSubmit: (id: string) => void;
  handleDecision: (id: string, status: any) => void;
  handleEmailFetch: () => void;
  isSyncingEmail: boolean;
}

export function ScreeningView(props: ScreeningViewProps) {
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Compute KPI metrics dynamically from backend stats or candidate list
  const metrics = useMemo(() => {
    if (props.stats && props.stats.totalApplicants > 0) {
      return {
        total: props.stats.totalApplicants,
        shortlisted: props.stats.shortlisted,
        assessmentPassed: props.stats.assessmentPassed !== undefined ? props.stats.assessmentPassed : props.candidates.filter(c => ((c as any).assessmentStatus || (c as any).assessment_status) === "passed" || (c.status || "").toLowerCase().includes("pass") || (c.assessmentScore !== undefined && c.assessmentScore !== null && Number(c.assessmentScore) >= 70)).length,
        interviewing: (props.stats.interviewsScheduled && props.stats.interviewsScheduled > 0) ? props.stats.interviewsScheduled : props.candidates.filter(c => (c.status || "").toLowerCase().includes("interview") || ((c as any).kekaStatus || (c as any).keka_status || "").toLowerCase().includes("interview") || !!c.interviewScheduledDate).length
      };
    }
    const total = props.candidates.length;
    const shortlisted = props.candidates.filter(c => (c.score || 0) >= 80 || c.status === "shortlisted").length;
    const assessmentPassed = props.candidates.filter(c => ((c as any).assessmentStatus || (c as any).assessment_status) === "passed" || (c.status || "").toLowerCase().includes("pass") || (c.assessmentScore !== undefined && c.assessmentScore !== null && Number(c.assessmentScore) >= 70)).length;
    const interviewing = props.candidates.filter(c => (c.status || "").toLowerCase().includes("interview") || ((c as any).kekaStatus || (c as any).keka_status || "").toLowerCase().includes("interview") || !!c.interviewScheduledDate).length;
    return { total, shortlisted, assessmentPassed, interviewing };
  }, [props.candidates, props.stats]);

  // Filter candidates based on search & tab selection
  const filteredCandidates = useMemo(() => {
    return props.candidates.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.role && c.role.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;

      if (statusFilter === "shortlisted") return (c.score || 0) >= 80 || c.status === "shortlisted";
      if (statusFilter === "review") return (c.score || 0) >= 60 && (c.score || 0) < 80;
      if (statusFilter === "assessment_passed") {
        const assStatus = (c.assessmentStatus || (c as any).assessment_status || "").toLowerCase();
        const s = (c.status || "").toLowerCase();
        const keka = ((c as any).kekaStatus || (c as any).keka_status || "").toLowerCase();
        return (
          assStatus === "passed" ||
          assStatus === "completed" ||
          s.includes("pass") ||
          s === "qualified" ||
          s === "assessment_passed" ||
          keka.includes("pass") ||
          (c.assessmentScore !== undefined && c.assessmentScore !== null && Number(c.assessmentScore) >= 70)
        );
      }
      if (statusFilter === "interviewing") {
        const s = (c.status || "").toLowerCase();
        const keka = ((c as any).kekaStatus || (c as any).keka_status || "").toLowerCase();
        return (
          s.includes("interview") ||
          s === "scheduled" ||
          keka.includes("interview") ||
          !!c.interviewScheduledDate
        );
      }
      if (statusFilter === "rejected") return c.status === "rejected" || (c.score || 0) < 60;

      return true;
    });
  }, [props.candidates, searchQuery, statusFilter]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="h-full flex flex-col gap-5"
    >
      {/* 👑 EXECUTIVE PREMIUM SCREENING HEADER (No harsh purple / Bleed proof) */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        
        {/* Top Title & Control Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Autonomous 30-Min Sync Active
              </span>
              <span className="text-muted-foreground text-[11px] font-medium">• Zoho Mail & Keka ATS Auto-Ingestion</span>
            </div>
            
            <h1 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
              AI Candidate Screening Pipeline
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </h1>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={props.handleEmailFetch}
              disabled={props.isSyncingEmail}
              variant="outline"
              size="sm"
              className="bg-secondary/50 hover:bg-secondary text-foreground border-border text-xs font-semibold"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${props.isSyncingEmail ? "animate-spin text-emerald-600" : ""}`} />
              {props.isSyncingEmail ? "Syncing..." : "Sync Zoho Mail"}
            </Button>

            <Button
              onClick={() => setIsManualModalOpen(true)}
              size="sm"
              className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-xs font-semibold shadow-sm"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Manual Import
            </Button>
          </div>
        </div>

        {/* Executive Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          
          <div className="bg-secondary/40 border border-border/60 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-lg font-extrabold leading-none text-foreground">{metrics.total}</span>
              <span className="text-[10px] text-muted-foreground font-semibold mt-1 block">Total Applicants</span>
            </div>
          </div>

          <div className="bg-secondary/40 border border-border/60 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Award className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-lg font-extrabold leading-none text-emerald-600 dark:text-emerald-400">{metrics.shortlisted}</span>
              <span className="text-[10px] text-muted-foreground font-semibold mt-1 block">Shortlisted (80%+)</span>
            </div>
          </div>

          <div className="bg-secondary/40 border border-border/60 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-lg font-extrabold leading-none text-amber-600 dark:text-amber-400">{metrics.assessmentPassed}</span>
              <span className="text-[10px] text-muted-foreground font-semibold mt-1 block">Assessment Passed</span>
            </div>
          </div>

          <div className="bg-secondary/40 border border-border/60 rounded-xl p-3 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0">
              <CalendarCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-lg font-extrabold leading-none text-foreground">{metrics.interviewing}</span>
              <span className="text-[10px] text-muted-foreground font-semibold mt-1 block">Interviews Scheduled</span>
            </div>
          </div>

        </div>

      </div>

      {/* 🎛️ MAIN WORKSPACE GRID: Candidate Evaluation Stream (Left) + AI Inspection Console (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Candidate Stream & Pipeline List */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Filter & Search Bar */}
          <div className="bg-card border border-border rounded-xl p-3 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
            
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search candidate, role, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-slate-400/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 custom-scrollbar">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                  statusFilter === "all"
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({props.candidates.length})
              </button>

              <button
                onClick={() => setStatusFilter("shortlisted")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                  statusFilter === "shortlisted"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                Shortlisted
              </button>

              <button
                onClick={() => setStatusFilter("assessment_passed")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                  statusFilter === "assessment_passed"
                    ? "bg-amber-600 text-white shadow-sm"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                Passed Test
              </button>

              <button
                onClick={() => setStatusFilter("interviewing")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                  statusFilter === "interviewing"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                Interviewing
              </button>

              <button
                onClick={() => setStatusFilter("rejected")}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${
                  statusFilter === "rejected"
                    ? "bg-rose-600 text-white shadow-sm"
                    : "bg-secondary/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                Rejected
              </button>
            </div>
          </div>

          {/* Active Ingestion Queue Notice (If processing files) */}
          {props.screeningQueue.length > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Active Ingestion Pipeline ({props.screeningQueue.length} files parsing)
                </span>
              </div>
              <div className="space-y-1.5">
                {props.screeningQueue.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-[11px] bg-card p-2 rounded-lg border border-border">
                    <span className="font-semibold text-foreground truncate max-w-[200px]">{item.fileName}</span>
                    <Badge variant="secondary" className="text-[9px]">Parsing & Scoring...</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Candidates Stream Leaderboard */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/20">
              <div>
                <h3 className="text-xs uppercase tracking-wider font-bold text-foreground">Screened Candidate Stream</h3>
                <p className="text-[10px] text-muted-foreground">Ranked by AI match score & evaluation confidence.</p>
              </div>
              <span className="text-xs font-bold text-muted-foreground">Showing {filteredCandidates.length} profiles</span>
            </div>

            {filteredCandidates.length === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                <Users className="h-8 w-8 text-slate-400" />
                <p className="font-bold">No candidates found</p>
                <p className="text-[11px] text-slate-400">Try adjusting your filter or search query.</p>
              </div>
            ) : (
              <div className="divide-y divide-border max-h-[650px] overflow-y-auto custom-scrollbar">
                {filteredCandidates.map((c, idx) => {
                  const score = c.score || 0;
                  const isHigh = score >= 80;
                  const isMid = score >= 60 && score < 80;
                  const isSelected = props.selectedCandidate?.id === c.id;

                  return (
                    <div
                      key={c.id}
                      onClick={() => props.setSelectedCandidate(c)}
                      className={`p-4 flex items-center justify-between gap-4 cursor-pointer transition-all hover:bg-secondary/40 ${
                        isSelected
                          ? "bg-slate-100 border-l-4 border-l-slate-900 dark:bg-slate-800/60 dark:border-l-slate-400"
                          : ""
                      }`}
                    >
                      {/* Left: Rank & Candidate Meta */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                          idx === 0 ? "bg-amber-500/20 text-amber-600 border border-amber-500/30" :
                          idx === 1 ? "bg-slate-400/20 text-slate-500 border border-slate-400/30" :
                          idx === 2 ? "bg-amber-700/20 text-amber-700 border border-amber-700/30" :
                          "bg-secondary text-muted-foreground"
                        }`}>
                          #{idx + 1}
                        </span>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-foreground truncate">{c.name}</span>
                            {c.applicationSource && (
                              <span className="text-[9px] font-semibold px-1.5 py-0.2 bg-secondary text-muted-foreground rounded border border-border">
                                {c.applicationSource}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                            <span>{c.jobTitle || c.role}</span>
                            <span>•</span>
                            <span>{c.experienceYears} Years Exp</span>
                            {c.appliedDate && (
                              <>
                                <span>•</span>
                                <span>Applied: {new Date(c.appliedDate).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Score Ring & Decision Status Badge */}
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Score Pill */}
                        <div className={`px-2.5 py-1 rounded-lg border text-xs font-extrabold flex items-center gap-1 ${
                          isHigh ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                          isMid ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                          "bg-rose-500/10 text-rose-500 border-rose-500/20"
                        }`}>
                          <span>{score}%</span>
                        </div>

                        {/* Status Badge */}
                        <Badge
                          variant={
                            c.status === "shortlisted" ? "success" :
                            c.status === "interviewing" ? "purple" :
                            c.status === "hold" ? "warning" :
                            c.status === "rejected" ? "destructive" :
                            "secondary"
                          }
                          className="text-[10px] uppercase tracking-wider px-2 py-0.5"
                        >
                          {c.status}
                        </Badge>

                        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isSelected ? "translate-x-1 text-slate-900 dark:text-white" : ""}`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Column: AI Deep Candidate Inspection Console */}
        <div className="lg:col-span-5">
          <AiScreeningConsole
            selectedCandidate={props.selectedCandidate}
            handleDeleteCandidate={props.handleDeleteCandidate}
            assessmentScoreInput={props.assessmentScoreInput}
            setAssessmentScoreInput={props.setAssessmentScoreInput}
            handleAssessmentSubmit={props.handleAssessmentSubmit}
            isAssessmentSubmitting={props.isAssessmentSubmitting}
            interviewFeedbackInput={props.interviewFeedbackInput}
            setInterviewFeedbackInput={props.setInterviewFeedbackInput}
            handleInterviewSubmit={props.handleInterviewSubmit}
            isInterviewSubmitting={props.isInterviewSubmitting}
            isOnboardingSubmitting={props.isOnboardingSubmitting}
            handleOnboardSubmit={props.handleOnboardSubmit}
            handleDecision={props.handleDecision}
          />
        </div>

      </div>

      {/* 📥 MANUAL INGESTION MODAL OVERLAY */}
      <ManualIngestionModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        importTab={props.importTab}
        setImportTab={props.setImportTab}
        importUrl={props.importUrl}
        setImportUrl={props.setImportUrl}
        jdTextPaste={props.jdTextPaste}
        setJdTextPaste={props.setJdTextPaste}
        jdFile={props.jdFile}
        setJdFile={props.setJdFile}
        isExtracting={props.isExtracting}
        activeJD={props.activeJD}
        setActiveJD={props.setActiveJD}
        isEditingJD={props.isEditingJD}
        setIsEditingJD={props.setIsEditingJD}
        handleJdImport={props.handleJdImport}
        handleSaveJD={props.handleSaveJD}
        jdFileInputRef={props.jdFileInputRef}
        isIngesting={props.isIngesting}
        dragActive={props.dragActive}
        handleDrag={props.handleDrag}
        handleDrop={props.handleDrop}
        triggerFileSelect={props.triggerFileSelect}
        fileInputRef={props.fileInputRef}
        handleFileChange={props.handleFileChange}
        triggerFolderSelect={props.triggerFolderSelect}
        folderInputRef={props.folderInputRef}
        handleFolderChange={props.handleFolderChange}
        uploadProgress={props.uploadProgress}
        handleEmailFetch={props.handleEmailFetch}
        isSyncingEmail={props.isSyncingEmail}
      />
    </motion.div>
  );
}
