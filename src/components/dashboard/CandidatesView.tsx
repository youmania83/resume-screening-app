// src/components/dashboard/CandidatesView.tsx
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Search, FileDown, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Candidate } from "../../types/index";
import { toast } from "sonner";

interface CandidatesViewProps {
  candidates: Candidate[];
  filteredCandidates: Candidate[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  scoreFilter: string;
  setScoreFilter: (filter: string) => void;
  statusFilter: string;
  setStatusFilter: (filter: string) => void;
  expFilter: string;
  setExpFilter: (filter: string) => void;
  roleFilter: string;
  setRoleFilter: (filter: string) => void;
  setSelectedCandidate: (candidate: Candidate | null) => void;
  setActiveTab: (tab: any) => void;
  handleDeleteCandidate: (id: string) => void;
}

export function CandidatesView({
  candidates,
  filteredCandidates,
  searchQuery,
  setSearchQuery,
  scoreFilter,
  setScoreFilter,
  statusFilter,
  setStatusFilter,
  expFilter,
  setExpFilter,
  roleFilter,
  setRoleFilter,
  setSelectedCandidate,
  setActiveTab,
  handleDeleteCandidate
}: CandidatesViewProps) {
  const uniqueRoles = useMemo(() => {
    return Array.from(new Set(candidates.map(c => c.jobTitle || c.role)));
  }, [candidates]);

  const exportToCSV = () => {
    if (filteredCandidates.length === 0) {
      toast.error("No candidate data available to export.");
      return;
    }
    const headers = ["Name", "Email", "Phone", "Target Role", "Experience Years", "AI Match Score", "Match Percent", "Confidence", "Status", "Applied Date"];
    const rows = filteredCandidates.map(c => [
      c.name,
      c.email,
      c.phone || "",
      c.role,
      c.experienceYears,
      c.score,
      c.matchPercent,
      c.confidence,
      c.status,
      c.appliedDate
    ]);

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `techsol_candidates_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV export initiated.");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <Card className="shadow-sm border-border bg-card">
        <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Candidate Pipeline Database</CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground">Search, filter and access evaluations logs.</CardDescription>
          </div>
          <div className="relative w-72">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search name, skills or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-secondary/40 border border-border rounded-md pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-semibold"
            />
          </div>
        </CardHeader>

        {/* Filter Toolbar */}
        <div className="px-6 py-2.5 border-b border-border bg-secondary/40 flex flex-wrap items-center gap-4 text-xs select-none">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold text-slate-455">Match Rating:</span>
            <select
              value={scoreFilter}
              onChange={(e) => setScoreFilter(e.target.value)}
              className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer"
            >
              <option value="all">All Match Ratings</option>
              <option value="high">High Match (≥85%)</option>
              <option value="moderate">Moderate Match (50-80%)</option>
              <option value="low">{"Low Match (<50%)"}</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold text-slate-455">Pipeline Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="applied">Applied</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="interviewing">Interviewing</option>
              <option value="selected">Selected</option>
              <option value="hired">Hired</option>
              <option value="hold">On Hold</option>
              <option value="rejected">Rejected</option>
              <option value="talent_pool">Talent Pool</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold text-slate-455">Experience:</span>
            <select
              value={expFilter}
              onChange={(e) => setExpFilter(e.target.value)}
              className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer"
            >
              <option value="all">All Experience Levels</option>
              <option value="entry">Entry (0-2 Yrs)</option>
              <option value="mid">Mid (3-5 Yrs)</option>
              <option value="senior">Senior (6+ Yrs)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold text-slate-455">Target Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer"
            >
              <option value="all">All Roles</option>
              {uniqueRoles.map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>

          {(scoreFilter !== "all" || statusFilter !== "all" || expFilter !== "all" || roleFilter !== "all" || searchQuery !== "") && (
            <button
              onClick={() => {
                setScoreFilter("all");
                setStatusFilter("all");
                setExpFilter("all");
                setRoleFilter("all");
                setSearchQuery("");
              }}
              className="text-[9px] font-bold text-muted-foreground hover:text-foreground uppercase transition-colors mr-2 cursor-pointer"
            >
              Clear All Filters
            </button>
          )}

          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 text-[9px] font-bold text-slate-100 hover:text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md px-3 py-1 uppercase transition-colors shadow-sm ml-auto cursor-pointer"
          >
            <FileDown className="h-3 w-3" />
            Export CSV / Excel
          </button>
        </div>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Candidate Name</TableHead>
                <TableHead>Target Role</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Date Parsed</TableHead>
                <TableHead>Top Skills Matched</TableHead>
                <TableHead>Match Rating</TableHead>
                <TableHead>Pipeline Status</TableHead>
                <TableHead className="pr-6 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCandidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground font-semibold text-xs bg-secondary/40/10">
                    No candidates found matching the selected search and filter criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCandidates.map(c => (
                  <TableRow
                    key={c.id}
                    onClick={() => {
                      setSelectedCandidate(c);
                      setActiveTab("screening");
                    }}
                    className="cursor-pointer"
                  >
                    <TableCell className="pl-6">
                      <div>
                        <span className="text-xs font-bold block text-foreground">{c.name}</span>
                        <span className="text-[10px] text-muted-foreground font-semibold block mt-0.5">{c.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-foreground font-semibold">
                      <div>
                        <span className="block font-semibold">
                          {c.jobTitle || c.role} {c.jobCode && <span className="text-[10px] font-normal text-slate-400">({c.jobCode})</span>}
                        </span>
                        {c.jobLocation && <span className="text-[10px] font-normal text-muted-foreground block mt-0.5">{c.jobLocation}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-semibold">{c.experienceYears} Years</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono font-semibold">{c.appliedDate}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[280px]">
                        {c.matchedSkills.map(s => (
                          <Badge key={s} variant="outline" className="text-[8px] bg-secondary/40 px-1 border border-border text-foreground/90 font-semibold select-none">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold ${c.score >= 85 ? "text-emerald-600" : c.score >= 70 ? "text-amber-600" : "text-red-500"}`}>
                          {c.score}%
                        </span>
                        <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden select-none">
                          <div
                            className={`h-full ${c.score >= 85 ? "bg-emerald-500" : c.score >= 70 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${c.score}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === "shortlisted" ? "success" : c.status === "interviewing" ? "purple" : c.status === "hold" ? "warning" : c.status === "rejected" ? "destructive" : c.status === "selected" || c.status === "hired" || c.status === "onboarded" ? "success" : c.status === "talent_pool" ? "info" : "secondary"} className="text-[9px] uppercase tracking-wider py-0">
                        {c.status === "talent_pool" ? "Talent Pool" : c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeleteCandidate(c.id)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                        title="Delete candidate"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
