// app/page.tsx
"use client"
import React, { useRef, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Briefcase, Users, Layers, Settings, Sparkles, FileCheck2, BarChart3, Activity, Award, UserCheck, Calendar } from "lucide-react"
import { Badge } from "@/src/components/ui/badge"
import { toast } from "sonner"
import { useCandidates } from "@/src/hooks/useCandidates"
import { useJobs } from "@/src/hooks/useJobs"
import { useDashboardMetrics } from "@/src/hooks/useDashboardMetrics"
import { useIngestionPipeline } from "@/src/hooks/useIngestionPipeline"

// Sub-views
import { ScreeningView } from "@/src/components/dashboard/ScreeningView"
import { OverviewView } from "@/src/components/dashboard/OverviewView"
import { JobsView } from "@/src/components/dashboard/JobsView"
import { CandidatesView } from "@/src/components/dashboard/CandidatesView"
import { AssessmentsView } from "@/src/components/dashboard/AssessmentsView"
import { PipelineView } from "@/src/components/dashboard/PipelineView"
import { AnalyticsView } from "@/src/components/dashboard/AnalyticsView"
import { SettingsView } from "@/src/components/dashboard/SettingsView"
import { PlatformHealthView } from "@/src/components/dashboard/PlatformHealthView"
import { HRInterviewDashboard } from "@/src/components/dashboard/HRInterviewDashboard"

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const saved = localStorage.getItem("ira_user")
    if (!saved) {
      const trySilentLogin = async () => {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
        try {
          const res = await fetch(`${apiBase}/auth/silent-login`, { method: "POST" });
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.user) {
              localStorage.setItem("ira_user", JSON.stringify(data.user));
              setUser(data.user);
              return;
            }
          }
        } catch (e) {
          console.warn("Silent login failed:", e);
        }
        router.push("/login");
      };
      trySilentLogin();
    } else {
      try {
        setUser(JSON.parse(saved))
      } catch {
        router.push("/login")
      }
    }
  }, [router])

  const handleLogout = async () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
    try {
      await fetch(`${apiBase}/auth/logout`, { method: "POST" })
    } catch (e) {
      console.warn("Backend logout call failed", e)
    }
    localStorage.removeItem("ira_user")
    toast.success("Signed out successfully.")
    router.push("/login")
  }

  const {
    candidates,
    setCandidates,
    selectedCandidate,
    setSelectedCandidate,
    searchQuery,
    setSearchQuery,
    scoreFilter,
    setScoreFilter,
    statusFilter,
    setStatusFilter,
    assessmentStatusFilter,
    setAssessmentStatusFilter,
    expFilter,
    setExpFilter,
    roleFilter,
    setRoleFilter,
    isAssessmentSubmitting,
    isInterviewSubmitting,
    isOnboardingSubmitting,
    assessmentScoreInput,
    setAssessmentScoreInput,
    interviewFeedbackInput,
    setInterviewFeedbackInput,
    handleAssessmentSubmit,
    handleInterviewSubmit,
    handleOnboardSubmit,
    handleDeleteCandidate,
    handleDecision,
    filteredCandidates,
    loadCandidates
  } = useCandidates(!!user)

  const {
    jobs,
    activeJD,
    setActiveJD,
    importTab,
    setImportTab,
    importUrl,
    setImportUrl,
    jdTextPaste,
    setJdTextPaste,
    jdFile,
    setJdFile,
    isExtracting,
    isEditingJD,
    setIsEditingJD,
    handleJdExtract,
    saveOrUpdateJob
  } = useJobs(!!user)

  const {
    activeTab,
    setActiveTab,
    isDark,
    setIsDark,
    credits,
    setCredits,
    webhookUrl,
    setWebhookUrl,
    mounted,
    totalScreenedCount
  } = useDashboardMetrics(candidates.length)

  const {
    dragActive,
    fileInputRef,
    folderInputRef,
    handleDrag,
    handleDrop,
    handleFileChange,
    handleFolderChange,
    triggerFileSelect,
    triggerFolderSelect,
    handleSimulatedIngestion,
    isIngesting,
    uploadProgress,
    screeningQueue,
    dismissQueueItem
  } = useIngestionPipeline({
    activeJD,
    setCandidates,
    setSelectedCandidate,
    setCredits
  })

  const jdFileInputRef = useRef<HTMLInputElement | null>(null)

  // handleDecision is now provided by useCandidates hook
  // It persists to DB and sends email notifications automatically

  const handleSaveJD = () => {
    if (activeJD) {
      saveOrUpdateJob(activeJD)
      setIsEditingJD(false)
      toast.success("Job description profile saved & synced.")
    }
  }

  if (!mounted || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          <p className="text-xs text-muted-foreground font-semibold">Loading workstation...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans antialiased text-foreground">
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-[220px] flex-shrink-0 bg-card border-r border-border flex flex-col justify-between z-20 select-none">
        <div>
          <div className="h-14 flex items-center px-4.5 border-b border-border gap-2.5">
            <div className="h-7 w-7 bg-gradient-to-tr from-indigo-500 via-indigo-600 to-violet-600 text-white rounded-lg flex items-center justify-center shadow-md">
              <Sparkles className="h-4 w-4 animate-pulse" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground via-indigo-900 to-indigo-700 dark:from-foreground dark:to-indigo-300">Techsole Engineers</span>
              <span className="block text-[9px] text-muted-foreground font-bold tracking-wider leading-none">RECRUIT SUITE</span>
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {[
              { id: "screening", label: "Resume Screening", icon: FileCheck2 },
              { id: "dashboard", label: "Dashboard", icon: Layers },
              { id: "jobs", label: "Active Jobs", icon: Briefcase },
              { id: "candidates", label: "Candidates DB", icon: Users },
              { id: "assessments", label: "AI Assessments", icon: Award },
              { id: "pipeline", label: "ATS Pipeline", icon: UserCheck },
              { id: "hr_interview", label: "HR Interview", icon: Calendar },
              { id: "analytics", label: "Analytics", icon: BarChart3 },
              { id: "health", label: "System Health", icon: Activity }
            ].map(item => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
                    isActive 
                      ? "bg-primary/10 text-primary shadow-xs border border-primary/20" 
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground border border-transparent"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground/80"}`} />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-border">
          <button onClick={() => setActiveTab("settings")} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-semibold transition-all ${activeTab === "settings" ? "bg-secondary text-foreground shadow-xs border border-border/50" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground border border-transparent"}`}>
            <Settings className="h-4 w-4 text-muted-foreground/80" />
            Workspace Settings
          </button>
          
          <div className="mt-3 p-2.5 bg-secondary/40 rounded-lg border border-border flex flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-foreground border border-border shadow-xs">
                {user ? user.name.split(" ").map((n: string) => n[0]).join("").toUpperCase() : "YK"}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold text-foreground truncate leading-tight">
                  {user ? user.name : "Yogesh Wadhwa"}
                </span>
                <span className="block text-[9px] text-muted-foreground truncate font-medium">
                  {user ? (user.role === "owner" ? "Workspace Owner" : user.role) : "Techsol Admin"}
                </span>
              </div>
            </div>
            <button 
              onClick={handleLogout} 
              className="w-full text-center py-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive text-[10px] font-bold rounded transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>

          <div className="mt-3.5 text-center space-y-1 text-[9px] text-muted-foreground select-none leading-normal border-t border-border/30 pt-3">
            <div className="font-semibold text-slate-500 dark:text-slate-400">
              Powered by IRA from Rison Ai Tech
            </div>
            <div className="text-[8px] text-slate-400 dark:text-slate-500 font-normal px-1">
              Apple, App Store, and Google Play are trademarks of their respective owners.
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 z-10 select-none">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Enterprise Console</span>
            <div className="h-4 w-px bg-border" />
            <Badge variant="outline" className="text-[10px] font-semibold px-2.5 py-0.5 text-foreground bg-secondary/50 border-border">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              DeepSeek-Coder v1.5 API Connected
            </Badge>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground/80" />
                <span>Screened: <strong className="text-foreground font-bold">{totalScreenedCount}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-emerald-500/80" />
                <span>API Status: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">Unlimited Access</strong></span>
              </div>
            </div>

            <div className="h-4 w-px bg-border" />
            <button onClick={() => setIsDark(!isDark)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
              {isDark ? "☀️" : "🌙"}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-background">
          {activeTab === "screening" && (
            <ScreeningView
              importTab={importTab}
              setImportTab={setImportTab}
              importUrl={importUrl}
              setImportUrl={setImportUrl}
              jdTextPaste={jdTextPaste}
              setJdTextPaste={setJdTextPaste}
              jdFile={jdFile}
              setJdFile={setJdFile}
              isExtracting={isExtracting}
              activeJD={activeJD}
              setActiveJD={setActiveJD}
              isEditingJD={isEditingJD}
              setIsEditingJD={setIsEditingJD}
              handleJdImport={handleJdExtract}
              handleSaveJD={handleSaveJD}
              jdFileInputRef={jdFileInputRef}
              isIngesting={isIngesting}
              handleSimulatedIngestion={handleSimulatedIngestion}
              dragActive={dragActive}
              handleDrag={handleDrag}
              handleDrop={handleDrop}
              triggerFileSelect={triggerFileSelect}
              fileInputRef={fileInputRef}
              handleFileChange={handleFileChange}
              triggerFolderSelect={triggerFolderSelect}
              folderInputRef={folderInputRef}
              handleFolderChange={handleFolderChange}
              uploadProgress={uploadProgress}
              screeningQueue={screeningQueue}
              candidates={candidates}
              selectedCandidate={selectedCandidate}
              setSelectedCandidate={setSelectedCandidate}
              dismissQueueItem={dismissQueueItem}
              handleDeleteCandidate={handleDeleteCandidate}
              assessmentScoreInput={assessmentScoreInput}
              setAssessmentScoreInput={setAssessmentScoreInput}
              handleAssessmentSubmit={handleAssessmentSubmit}
              isAssessmentSubmitting={isAssessmentSubmitting}
              interviewFeedbackInput={interviewFeedbackInput}
              setInterviewFeedbackInput={setInterviewFeedbackInput}
              handleInterviewSubmit={handleInterviewSubmit}
              isInterviewSubmitting={isInterviewSubmitting}
              isOnboardingSubmitting={isOnboardingSubmitting}
              handleOnboardSubmit={handleOnboardSubmit}
              handleDecision={handleDecision}
            />
          )}

          {activeTab === "dashboard" && <OverviewView candidates={candidates} />}
          {activeTab === "jobs" && <JobsView jobs={jobs} setActiveTab={setActiveTab} setImportTab={setImportTab} setActiveJD={setActiveJD} />}
          {activeTab === "candidates" && (
            <CandidatesView
              candidates={candidates}
              filteredCandidates={filteredCandidates}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              scoreFilter={scoreFilter}
              setScoreFilter={setScoreFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              expFilter={expFilter}
              setExpFilter={setExpFilter}
              roleFilter={roleFilter}
              setRoleFilter={setRoleFilter}
              setSelectedCandidate={setSelectedCandidate}
              setActiveTab={setActiveTab}
              handleDeleteCandidate={handleDeleteCandidate}
            />
          )}
          {activeTab === "assessments" && (
            <AssessmentsView
              candidates={candidates}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              assessmentStatusFilter={assessmentStatusFilter}
              setAssessmentStatusFilter={setAssessmentStatusFilter}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              setSelectedCandidate={setSelectedCandidate}
              setActiveTab={setActiveTab}
              loadCandidates={loadCandidates}
            />
          )}
          {activeTab === "pipeline" && <PipelineView candidates={candidates} setSelectedCandidate={setSelectedCandidate} setActiveTab={setActiveTab} />}
          {activeTab === "hr_interview" && <HRInterviewDashboard candidates={candidates} loadCandidates={loadCandidates} />}
          {activeTab === "analytics" && <AnalyticsView candidates={candidates} />}
          {activeTab === "health" && <PlatformHealthView />}
          {activeTab === "settings" && <SettingsView webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl} />}
        </main>
      </div>
    </div>
  )
}
