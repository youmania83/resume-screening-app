// src/components/dashboard/PipelineView.tsx
import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Candidate } from "../../types/index";

interface PipelineViewProps {
  candidates: Candidate[];
  setSelectedCandidate: (candidate: Candidate | null) => void;
  setActiveTab: (tab: any) => void;
}

export function PipelineView({ candidates, setSelectedCandidate, setActiveTab }: PipelineViewProps) {
  const filterByStatus = (statusList: string[]) => {
    return candidates.filter(c => statusList.includes(c.status.toLowerCase()));
  };

  const selectAndOpen = (c: Candidate) => {
    setSelectedCandidate(c);
    setActiveTab("screening");
  };

  const appliedList = filterByStatus(["applied"]);
  const shortlistedList = filterByStatus(["shortlisted"]);
  const interviewingList = filterByStatus(["interviewing"]);
  const inactiveList = filterByStatus(["hold", "rejected"]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="space-y-6 h-full flex flex-col"
    >
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">ATS Pipeline Stages</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">Board mapping candidate workflows.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 overflow-x-auto custom-scrollbar pb-4 items-start">
        {/* Applied Column */}
        <div className="bg-secondary/40 dark:bg-slate-900/40 border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold uppercase text-muted-foreground">Applied ({appliedList.length})</span>
          </div>
          {appliedList.map(c => (
            <Card key={c.id} className="shadow-sm border-border cursor-pointer hover:border-slate-450 bg-card" onClick={() => selectAndOpen(c)}>
              <CardContent className="p-3 space-y-2 text-xs">
                <span className="font-bold text-xs block truncate text-foreground">{c.name}</span>
                <span className="text-[10px] text-muted-foreground block truncate">{c.role}</span>
                <div className="flex items-center justify-between mt-2.5">
                  <Badge variant="outline" className="text-[8px] font-mono px-1 bg-secondary/40">{c.experienceYears} yrs exp</Badge>
                  <span className="text-xs font-bold text-amber-605">{c.score}%</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Shortlisted Column */}
        <div className="bg-secondary/40 dark:bg-slate-900/40 border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold uppercase text-emerald-600">Shortlisted ({shortlistedList.length})</span>
          </div>
          {shortlistedList.map(c => (
            <Card key={c.id} className="shadow-sm border-border cursor-pointer hover:border-slate-450 bg-card" onClick={() => selectAndOpen(c)}>
              <CardContent className="p-3 space-y-2 text-xs">
                <span className="font-bold text-xs block truncate text-foreground">{c.name}</span>
                <span className="text-[10px] text-muted-foreground block truncate">{c.role}</span>
                <div className="flex items-center justify-between mt-2.5">
                  <Badge variant="outline" className="text-[8px] font-mono px-1 bg-secondary/40">{c.experienceYears} yrs exp</Badge>
                  <span className="text-xs font-bold text-emerald-600">{c.score}%</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Interview Column */}
        <div className="bg-secondary/40 dark:bg-slate-900/40 border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold uppercase text-indigo-600">Interviewing ({interviewingList.length})</span>
          </div>
          {interviewingList.map(c => (
            <Card key={c.id} className="shadow-sm border-border cursor-pointer hover:border-slate-455 bg-card" onClick={() => selectAndOpen(c)}>
              <CardContent className="p-3 space-y-2 text-xs">
                <span className="font-bold text-xs block truncate text-foreground">{c.name}</span>
                <span className="text-[10px] text-muted-foreground block truncate">{c.role}</span>
                <div className="flex items-center justify-between mt-2.5">
                  <Badge variant="outline" className="text-[8px] font-mono px-1 bg-secondary/40">{c.experienceYears} yrs exp</Badge>
                  <span className="text-xs font-bold text-indigo-600">{c.score}%</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Hold / Rejected Column */}
        <div className="bg-secondary/40 dark:bg-slate-900/40 border border-border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold uppercase text-rose-600">Hold / Rejected ({inactiveList.length})</span>
          </div>
          {inactiveList.map(c => (
            <Card key={c.id} className="shadow-sm border-border cursor-pointer hover:border-slate-450 bg-card opacity-70" onClick={() => selectAndOpen(c)}>
              <CardContent className="p-3 space-y-2 text-xs">
                <span className="font-bold text-xs block truncate text-foreground">{c.name}</span>
                <span className="text-[10px] text-muted-foreground block truncate">{c.role}</span>
                <div className="flex items-center justify-between mt-2.5">
                  <Badge variant={c.status === "hold" ? "warning" : "destructive"} className="text-[8px] px-1 py-0 uppercase">{c.status}</Badge>
                  <span className="text-xs font-bold text-slate-400">{c.score}%</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
