// src/components/dashboard/ScreeningView.tsx
import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { 
  Sparkles, 
  RefreshCw, 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  Users, 
  Award, 
  CalendarCheck, 
  ChevronRight, 
  Zap, 
  Mail, 
  FileText, 
  AlertCircle,
  Building2,
  MapPin,
  X
} from "lucide-react";
import { AiScreeningConsole } from "./screening/AiScreeningConsole";
import { ManualIngestionModal } from "./screening/ManualIngestionModal";
import { Candidate, StructuredJD } from "../../types/index";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface ScreeningViewProps {
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

  // Compute KPI metrics dynamically
  const metrics = useMemo(() => {
    const total = props.candidates.length;
    const shortlisted = props.candidates.filter(c => (c.score || 0) >= 80 || c.status === "shortlisted").length;
    const assessmentPassed = props.candidates.filter(c => (c as any).assessment_status === "passed" || c.status === "qualified").length;
    const interviewing = props.candidates.filter(c => c.status === "interviewing" || c.status === "interview_scheduled").length;
    return { total, shortlisted, assessmentPassed, interviewing };
  }, [props.candidates]);

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
      if (statusFilter === "assessment_passed") return (c as any).assessment_status === "passed" || c.status === "qualified";
      if (statusFilter === "interviewing") return c.status === "interviewing" || c.status === "interview_scheduled";
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
      {/* 🤖 AUTONOMOUS SCREENING COMMAND CENTER HEADER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 shadow-lg border border-indigo-500/20 relative overflow-hidden">
        {/* Background glow effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Header Info */}
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Autonomous 30-Min Sync Active
              </span>
              <span className="text-slate-400 text-[11px]">• Zoho Mail & Keka ATS Auto-Ingestion</span>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
              AI Resume Screening & Candidate Pipeline
              <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" />
            </h1>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={props.handleEmailFetch}
              disabled={props.isSyncingEmail}
              variant="outline"
              size="sm"
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-semibold backdrop-blur-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${props.isSyncingEmail ? "animate-spin text-indigo-400" : ""}`} />
              {props.isSyncingEmail ? "Syncing Mailbox..." : "Sync Zoho Mail"}
            </Button>

            <Button
              onClick={() => setIsManualModalOpen(true)}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30"
            >
              <Plus className="h-4 w-4 mr-1" />
              Manual Import
            </Button>
          </div>
        </div>

        {/* Live Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10">
          <div className="bg-white/5 backdrop-blur-md rounded-lg p-2.5 border border-white/10 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-lg font-extrabold leading-none text-white">{metrics.total}</span>
              <span className="text-[10px] text-slate-300 font-medium">Total Applicants</span>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-md rounded-lg p-2.5 border border-white/10 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Award className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-lg font-extrabold leading-none text-emerald-400">{metrics.shortlisted}</span>
              <span className="text-[10px] text-slate-300 font-medium">Shortlisted (80%+)</span>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-md rounded-lg p-2.5 border border-white/10 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-lg font-extrabold leading-none text-amber-400">{metrics.assessmentPassed}</span>
              <span className="text-[10px] text-slate-300 font-medium">Assessment Passed</span>
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-md rounded-lg p-2.5 border border-white/10 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
              <CalendarCheck className="h-4 w-4" />
            </div>
            <div>
              <span className="block text-lg font-extrabold leading-none text-purple-300">{metrics.interviewing}</span>
              <span className="text-[10px] text-slate-300 font-medium">Interviews Scheduled</span>
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
                className="w-full bg-secondary/50 border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-indigo-500/30"
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
                    ? "bg-indigo-600 text-white shadow-sm"
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
                    ? "bg-purple-600 text-white shadow-sm"
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
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
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
                          ? "bg-indigo-500/10 border-l-4 border-l-indigo-600 dark:bg-indigo-950/30"
                          : ""
                      }`}
                    >
                      {/* Left: Rank & Candidate Meta */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 ${
                          idx === 0 ? "bg-amber-500/20 text-amber-500 border border-amber-500/30" :
                          idx === 1 ? "bg-slate-400/20 text-slate-400 border border-slate-400/30" :
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

                        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${isSelected ? "translate-x-1 text-indigo-500" : ""}`} />
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
