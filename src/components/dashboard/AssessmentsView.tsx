// src/components/dashboard/AssessmentsView.tsx
import React, { useState } from "react";
import { motion } from "framer-motion";
import { FileText, CheckCircle2, Clock, Award, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Candidate } from "../../types/index";
import { toast } from "sonner";

interface AssessmentsViewProps {
  candidates: Candidate[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  assessmentStatusFilter: string;
  setAssessmentStatusFilter: (filter: string) => void;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
  setSelectedCandidate: (candidate: Candidate | null) => void;
  setActiveTab: (tab: any) => void;
  loadCandidates: () => Promise<void>;
}

export function AssessmentsView({
  candidates,
  searchQuery,
  setSearchQuery,
  assessmentStatusFilter,
  setAssessmentStatusFilter,
  statusFilter,
  setStatusFilter,
  setSelectedCandidate,
  setActiveTab,
  loadCandidates
}: AssessmentsViewProps) {
  const [isSendingInvite, setIsSendingInvite] = useState<Record<string, boolean>>({});

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Assessment invite link copied to clipboard!");
  };

  const handleSendAssessmentInvite = async (id: string) => {
    setIsSendingInvite(prev => ({ ...prev, [id]: true }));
    toast.loading("Sending AI assessment invitation...", { id: "invite-loader" });

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const resp = await fetch(`${apiBase}/assessment/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: id })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          toast.success("Assessment invitation sent successfully!", { id: "invite-loader" });
          await loadCandidates();
          return;
        }
      }
      throw new Error("Failed to send assessment invite.");
    } catch (e: any) {
      console.warn("Backend send invite failed:", e);
      toast.error(e.message || "Failed to send assessment invitation.", { id: "invite-loader" });
    } finally {
      setIsSendingInvite(prev => ({ ...prev, [id]: false }));
    }
  };

  const invitedCandidates = candidates.filter(c => c.assessmentToken);
  const completedCandidates = candidates.filter(c => c.assessmentStatus === "passed" || c.assessmentStatus === "failed");
  const pendingCandidates = candidates.filter(c => c.assessmentStatus === "pending");
  const passedCandidatesCount = candidates.filter(c => c.assessmentStatus === "passed").length;
  const totalCompletedCount = completedCandidates.length;

  const passRate = totalCompletedCount > 0
    ? `${Math.round((passedCandidatesCount / totalCompletedCount) * 100)}%`
    : "0%";

  const filtered = candidates.filter(c => {
    const q = searchQuery.toLowerCase();
    const nameMatch = c.name.toLowerCase().includes(q) || 
      c.role.toLowerCase().includes(q) || 
      (c.jobTitle || "").toLowerCase().includes(q) || 
      (c.jobLocation || "").toLowerCase().includes(q);
    if (!nameMatch) return false;

    if (statusFilter !== "all" && c.status !== statusFilter) return false;

    if (assessmentStatusFilter !== "all") {
      if (assessmentStatusFilter === "not_invited" && c.assessmentToken) return false;
      if (assessmentStatusFilter === "pending" && c.assessmentStatus !== "pending") return false;
      if (assessmentStatusFilter === "passed" && c.assessmentStatus !== "passed") return false;
      if (assessmentStatusFilter === "failed" && c.assessmentStatus !== "failed") return false;
      if (["pending", "passed", "failed"].includes(assessmentStatusFilter) && !c.assessmentToken) return false;
    }

    return true;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 select-none">
        {[
          { title: "Total Invited", value: invitedCandidates.length, desc: "Sent assessment link", icon: FileText, color: "text-blue-500" },
          { title: "Tests Completed", value: totalCompletedCount, desc: "Completed submissions", icon: CheckCircle2, color: "text-emerald-500" },
          { title: "Pending Attempts", value: pendingCandidates.length, desc: "Link active / in-progress", icon: Clock, color: "text-amber-500" },
          { title: "Test Pass Rate", value: passRate, desc: "Score >= 70% threshold", icon: Award, color: "text-indigo-500" }
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="shadow-sm border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{stat.title}</span>
                <Icon className={`h-4.5 w-4.5 ${stat.color}`} />
              </CardHeader>
              <CardContent className="pb-4">
                <div className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</div>
                <span className="text-[9px] text-muted-foreground/80 mt-1 block font-semibold">{stat.desc}</span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="shadow-sm border-border bg-card">
        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">AI Assessment Dashboard</CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground">Track candidate test results, final score weights, and cheating violations.</CardDescription>
          </div>
          <div className="relative w-72">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search name or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-secondary/40 border border-border rounded-md pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-semibold"
            />
          </div>
        </CardHeader>

        <div className="px-6 py-2.5 border-b border-border bg-secondary/40 flex flex-wrap items-center gap-4 text-xs select-none">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold text-slate-455">Test Status:</span>
            <select
              value={assessmentStatusFilter}
              onChange={(e) => setAssessmentStatusFilter(e.target.value)}
              className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer"
            >
              <option value="all">All Test Statuses</option>
              <option value="pending">Pending Attempt</option>
              <option value="passed">Passed Assessment</option>
              <option value="failed">Failed Assessment</option>
              <option value="not_invited">Not Yet Invited</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold text-slate-455">HR Rank:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer"
            >
              <option value="all">All Ranks</option>
              <option value="Qualified">Qualified (≥80%)</option>
              <option value="Review">Review (60-79%)</option>
              <option value="Rejected">Rejected (&lt;60%)</option>
              <option value="shortlisted">Shortlisted (Resume Passed)</option>
            </select>
          </div>
        </div>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-150 dark:border-slate-900 bg-secondary/30 text-[9.5px] uppercase font-bold text-muted-foreground tracking-wider">
                  <TableHead className="py-3 pl-6">Candidate Name</TableHead>
                  <TableHead className="py-3">Job Role</TableHead>
                  <TableHead className="py-3 text-center">Resume Score</TableHead>
                  <TableHead className="py-3 text-center">Test Score</TableHead>
                  <TableHead className="py-3 text-center font-bold">Final Score</TableHead>
                  <TableHead className="py-3 text-center">Violations</TableHead>
                  <TableHead className="py-3 text-center">Test Status</TableHead>
                  <TableHead className="py-3 text-center">HR Ranking</TableHead>
                  <TableHead className="py-3 text-center">Submit Date</TableHead>
                  <TableHead className="py-3 pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs">
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                      No candidates matching the selected filters were found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(c => {
                    const resumeScore = c.score || 0;
                    const testScore = c.assessmentScore;
                    const finalScore = c.finalScore;
                    const violations = c.violationCount || 0;
                    const isInvited = !!c.assessmentToken;
                    const testStatus = c.assessmentStatus;
                    const submissionDate = c.assessmentCompletedAt
                      ? new Date(c.assessmentCompletedAt).toLocaleDateString()
                      : null;

                    return (
                      <TableRow key={c.id} className="border-b border-border/50 hover:bg-secondary/40/30">
                        <TableCell className="py-3.5 pl-6 font-semibold text-foreground">
                          <div className="flex flex-col">
                            <span>{c.name}</span>
                            <span className="text-[10px] text-muted-foreground font-medium">{c.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 text-muted-foreground font-medium">
                          <div>
                            <span className="text-foreground font-semibold block">{c.jobTitle || c.role}</span>
                            {c.jobLocation && <span className="text-[10px] text-muted-foreground block mt-0.5">{c.jobLocation}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 text-center">
                          <Badge variant="outline" className="text-[10px] font-mono font-bold bg-secondary/30 border-border text-foreground/90">
                            {resumeScore}%
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3.5 text-center">
                          {testScore !== undefined && testScore !== null ? (
                            <Badge variant="outline" className={`text-[10px] font-mono font-bold ${testScore >= 70 ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-500" : "bg-rose-950/10 border-rose-500/20 text-rose-500"}`}>
                              {testScore}%
                            </Badge>
                          ) : isInvited ? (
                            <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider flex items-center justify-center gap-1 select-none">
                              <Clock className="h-3 w-3" /> Sent
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider select-none">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5 text-center font-bold">
                          {finalScore !== undefined && finalScore !== null ? (
                            <Badge className={`text-[10px] font-mono font-extrabold px-2 ${finalScore >= 80 ? "bg-emerald-500 text-foreground" : finalScore >= 60 ? "bg-amber-500 text-foreground" : "bg-rose-500 text-white"}`}>
                              {Number(finalScore).toFixed(1)}%
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider select-none">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5 text-center">
                          {isInvited && testStatus ? (
                            <Badge variant="outline" className={`text-[10px] font-mono font-bold px-2 py-0.5 border ${violations > 0 ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-950/20" : "border-border bg-secondary/40 text-muted-foreground"}`}>
                              {violations} {violations === 1 ? "violation" : "violations"}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider select-none">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5 text-center">
                          {testStatus ? (
                            <Badge variant="outline" className={`text-[9.5px] font-bold uppercase px-2 py-0 border ${testStatus === "passed" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                              {testStatus}
                            </Badge>
                          ) : isInvited ? (
                            <Badge variant="outline" className="text-[9.5px] font-bold uppercase px-2 py-0 border-amber-200 bg-amber-50 text-amber-700">
                              Pending
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9.5px] font-bold uppercase px-2 py-0 border-border bg-secondary/40 text-slate-400">
                              Not Invited
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5 text-center">
                          <Badge variant="outline" className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-0 border ${c.status === "Qualified" || c.status === "interviewing" || c.status === "selected" || c.status === "onboarded" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : c.status === "Review" ? "border-amber-200 bg-amber-50 text-amber-700" : c.status === "Rejected" || c.status === "rejected" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-border bg-secondary/40 text-muted-foreground"}`}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3.5 text-center font-mono font-medium text-muted-foreground select-none">
                          {submissionDate || "—"}
                        </TableCell>
                        <TableCell className="py-3.5 pr-6 text-right space-x-2">
                          {!isInvited && resumeScore >= 70 && (
                            <Button
                              size="sm"
                              className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] px-2 py-1 font-bold rounded"
                              onClick={() => handleSendAssessmentInvite(c.id)}
                              disabled={isSendingInvite[c.id]}
                            >
                              Send Invite
                            </Button>
                          )}
                          {isInvited && testStatus === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-[10px] px-2 py-1 font-bold rounded border-border text-foreground/90"
                                onClick={() => {
                                  const inviteUrl = `${window.location.origin.includes("localhost") ? "https://resume-screening-app-sage.vercel.app" : window.location.origin}/assessment/${c.assessmentToken}`;
                                  copyToClipboard(inviteUrl);
                                }}
                              >
                                Copy Link
                              </Button>
                              <Button
                                size="sm"
                                className="bg-slate-900 hover:bg-slate-800 text-white text-[10px] px-2 py-1 font-bold rounded"
                                onClick={() => handleSendAssessmentInvite(c.id)}
                                disabled={isSendingInvite[c.id]}
                              >
                                Resend
                              </Button>
                            </>
                          )}
                          {isInvited && testStatus && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[10px] px-2 py-1 font-bold rounded border-border text-muted-foreground"
                              onClick={() => {
                                setSelectedCandidate(c);
                                setActiveTab("candidates");
                                toast.info(`Swapped candidate view to audit logs for ${c.name}`);
                              }}
                            >
                              Audit Logs
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
