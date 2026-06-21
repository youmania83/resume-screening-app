// src/components/dashboard/OverviewView.tsx
import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Candidate } from "../../types/index";
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  Briefcase, 
  Mail, 
  FileUp, 
  Sparkles, 
  CalendarDays,
  HelpCircle
} from "lucide-react";

interface OverviewViewProps {
  candidates: Candidate[];
}

export function OverviewView({ candidates }: OverviewViewProps) {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  // Derived onboarding progress metrics
  const hasCandidates = candidates.length > 0;
  const hasScores = candidates.some((c) => (c.score || 0) > 0);
  const hasInterviews = candidates.some((c) => 
    ["interviewing", "selected", "onboarded"].includes(c.status || "") || 
    c.interviewScheduledDate
  );

  const steps = useMemo(() => [
    {
      title: "1. Create Job Profile",
      summary: "Define required skills & matching target.",
      details: "Go to the 'Resume Screening' or 'Active Jobs' tab to paste or import a job description profile. This sets the threshold rules for AI screening.",
      icon: Briefcase,
      done: hasCandidates, // Step 1 is done if candidates exist
      area: "Resume Screening",
    },
    {
      title: "2. SMTP & Branding",
      summary: "Configure custom SMTP & portal styles.",
      details: "Go to 'Workspace Settings' -> 'SMTP & Branding' to connect Gmail, Outlook, or Zoho SMTP credentials and upload your logo and hex brand color.",
      icon: Mail,
      done: hasInterviews, // Step 2 is checked if interviews are scheduled (meaning invites sent via SMTP)
      area: "Workspace Settings",
    },
    {
      title: "3. Ingest Resumes",
      summary: "Upload files or link Zoho email sync.",
      details: "Drop PDF/DOCX resumes (single or bulk ZIPs) into the 'Resume Screening' dropzone, or rely on active integrations to fetch files.",
      icon: FileUp,
      done: hasCandidates, // Step 3 check
      area: "Resume Screening",
    },
    {
      title: "4. Review AI Matches",
      summary: "Check parsed scores and duplicate logs.",
      details: "Watch parsing and matching complete in the live queue. Check candidates on the leaderboard ranking and evaluate missing skills.",
      icon: Sparkles,
      done: hasScores,
      area: "Candidates DB",
    },
    {
      title: "5. Invites & Pipeline",
      summary: "Portal schedules candidate slots.",
      details: "Top candidates receive SMTP invite emails containing secure, passwordless links. They confirm slots on the portal. Review status changes in the pipeline.",
      icon: CalendarDays,
      done: hasInterviews,
      area: "ATS Pipeline",
    }
  ], [hasCandidates, hasScores, hasInterviews]);

  const completedCount = useMemo(() => steps.filter(s => s.done).length, [steps]);

  const metrics = useMemo(() => {
    const total = candidates.length;
    const screened = candidates.filter((c) => (c.score || 0) > 0).length;
    const shortlisted = candidates.filter((c) => ["shortlisted", "interviewing"].includes(c.status || "")).length;
    const rejected = candidates.filter((c) => ["rejected", "keka_rejected"].includes(c.status || "")).length;
    const interviews = candidates.filter((c) => c.status === "interviewing").length;
    const selected = candidates.filter((c) => ["selected", "onboarded"].includes(c.status || "")).length;

    return [
      { title: "Total Resumes Received", value: total, desc: "Cumulative uploaded resumes", color: "from-blue-500 to-indigo-600" },
      { title: "AI Screened", value: screened, desc: "Evaluated by AI parsing engine", color: "from-purple-500 to-pink-600" },
      { title: "Shortlisted", value: shortlisted, desc: "Qualified match score candidates", color: "from-emerald-500 to-teal-600" },
      { title: "Rejected", value: rejected, desc: "Did not meet required thresholds", color: "from-rose-500 to-red-600" },
      { title: "Interviews Scheduled", value: interviews, desc: "Scheduled or currently interviewing", color: "from-amber-500 to-orange-600" },
      { title: "Candidates Selected", value: selected, desc: "Passed all stages and selected", color: "from-cyan-500 to-blue-600" },
    ];
  }, [candidates]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      {/* Onboarding Step-by-Step Quick Start Guide */}
      <Card className="shadow-sm border-border bg-card overflow-hidden">
        <CardHeader className="pb-3 border-b border-border bg-secondary/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-xs uppercase tracking-wider font-extrabold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-500" />
                IRA AI SaaS Quick-Start Guide
              </CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                Follow these 5 steps to successfully configure your workspace and begin screening candidates automatically.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Progress:</span>
              <div className="h-2 w-28 bg-secondary rounded-full overflow-hidden border border-border">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${(completedCount / 5) * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-extrabold text-emerald-500">{completedCount}/5 Complete</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3.5">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isSelected = activeStep === idx;
            return (
              <div 
                key={idx} 
                onClick={() => setActiveStep(isSelected ? null : idx)}
                className={`p-3 rounded-lg border transition-all cursor-pointer relative ${
                  isSelected 
                    ? "bg-secondary border-slate-400 dark:border-slate-600 shadow-xs" 
                    : "border-border bg-secondary/20 hover:bg-secondary/40 hover:border-border/80"
                }`}
              >
                <div className="flex items-center justify-between mb-2 select-none">
                  <div className="h-6.5 w-6.5 rounded bg-secondary flex items-center justify-center border border-border">
                    <Icon className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 fill-emerald-500/10" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </div>
                <h4 className="text-[11px] font-extrabold text-foreground leading-snug">{step.title}</h4>
                <p className="text-[9px] text-muted-foreground font-semibold mt-1 leading-normal">
                  {step.summary}
                </p>
                {isSelected && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="pt-2 mt-2 border-t border-border/85 text-[9px] text-slate-400 leading-normal space-y-1.5"
                  >
                    <p className="font-medium">{step.details}</p>
                    <div className="text-[8px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-0.5 mt-1.5">
                      Target Area: {step.area} <ArrowRight className="h-2 w-2" />
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 6 Core Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {metrics.map((stat, i) => (
          <Card key={i} className="shadow-sm border-border bg-card hover:border-slate-400 dark:hover:border-slate-600 transition-all">
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">
                  {stat.title}
                </span>
                <span className="block text-3xl font-extrabold text-foreground dark:text-slate-55 tracking-tight mt-1">
                  {stat.value}
                </span>
              </div>
              <span className="block text-[10px] text-muted-foreground font-semibold">
                {stat.desc}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Leaderboard Table (Lightweight Database View) */}
        <div className="lg:col-span-8">
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Candidate Rankings</CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground">Highest scoring matching candidates across all open positions.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] pl-4">Rank</TableHead>
                    <TableHead>Candidate Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Experience</TableHead>
                    <TableHead>Match %</TableHead>
                    <TableHead>AI Score</TableHead>
                    <TableHead className="pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.slice(0, 10).map((c, idx) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-4 text-xs font-semibold text-muted-foreground/80">#{idx + 1}</TableCell>
                      <TableCell className="font-bold text-xs text-foreground dark:text-slate-100">{c.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-semibold">{c.role}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-semibold">{c.experienceYears || 0} Years</TableCell>
                      <TableCell className="text-xs font-bold text-muted-foreground">{c.matchPercent || 0}%</TableCell>
                      <TableCell>
                        <span className={`text-xs font-bold ${c.score >= 85 ? "text-emerald-600" : c.score >= 70 ? "text-amber-600" : "text-red-500"}`}>
                          {c.score || 0}/100
                        </span>
                      </TableCell>
                      <TableCell className="pr-4">
                        <Badge
                          variant={
                            c.status === "shortlisted"
                              ? "success"
                              : c.status === "interviewing"
                              ? "purple"
                              : c.status === "rejected" || c.status === "keka_rejected"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-[9px] uppercase tracking-wider py-0"
                        >
                          {c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {candidates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                        No candidates screened yet. Upload a resume to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Lightweight Recent Actions Feed */}
        <div className="lg:col-span-4">
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {candidates.slice(0, 5).map((c, i) => (
                <div key={i} className="flex gap-3 text-xs leading-normal">
                  <span className="text-[9px] text-muted-foreground font-mono w-20 flex-shrink-0 pt-0.5">
                    {c.appliedDate ? new Date(c.appliedDate).toLocaleDateString() : "Just now"}
                  </span>
                  <div>
                    <strong className="text-foreground block font-bold">{c.name}</strong>
                    <span className="text-muted-foreground text-[10px] block mt-0.5 font-semibold">
                      Applied for {c.role} (Score: {c.score || 0}/100)
                    </span>
                  </div>
                </div>
              ))}
              {candidates.length === 0 && (
                <div className="text-xs text-muted-foreground py-4 text-center">
                  No recent activities recorded.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
