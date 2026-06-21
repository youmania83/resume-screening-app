// src/components/dashboard/OverviewView.tsx
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Candidate } from "../../types/index";

interface OverviewViewProps {
  candidates: Candidate[];
}

export function OverviewView({ candidates }: OverviewViewProps) {
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
      {/* 6 Core Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {metrics.map((stat, i) => (
          <Card key={i} className="shadow-sm border-border bg-card hover:border-slate-400 dark:hover:border-slate-600 transition-all">
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-2">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 block">
                  {stat.title}
                </span>
                <span className="block text-3xl font-extrabold text-foreground dark:text-slate-50 tracking-tight mt-1">
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
