// src/components/dashboard/JobsView.tsx
import React from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/card";
import { Badge } from "../ui/badge";
import { JobListItem, StructuredJD } from "../../types/index";
import { toast } from "sonner";

interface JobsViewProps {
  jobs: JobListItem[];
  setActiveTab: (tab: any) => void;
  setImportTab: (tab: any) => void;
  setActiveJD: (jd: StructuredJD) => void;
}

export function JobsView({ jobs, setActiveTab, setImportTab, setActiveJD }: JobsViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Enterprise Job Listings</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">Manage positions and respective AI search vectors.</p>
        </div>
        <Button
          variant="default"
          size="sm"
          className="text-xs font-semibold gap-1.5"
          onClick={() => {
            setActiveTab("screening");
            setImportTab("url");
            toast.info("Import a new Job Description workspace.");
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Import New Position
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {jobs.map((job, i) => (
          <Card key={i} className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground">
                    {job.title} {job.jobCode && <span className="text-[10px] font-normal text-slate-400">({job.jobCode})</span>}
                  </CardTitle>
                  <CardDescription className="text-[10px] mt-0.5 font-semibold">{job.dept} • {job.loc}</CardDescription>
                </div>
                <Badge variant={job.status === "Active" ? "success" : "secondary"} className="text-[8px] uppercase tracking-wider">
                  {job.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 text-xs space-y-2">
              <div className="flex justify-between text-[11px] text-muted-foreground font-semibold">
                <span>Experience Vector:</span>
                <span className="font-bold text-foreground">{job.exp}</span>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground font-semibold">
                <span>Candidates Evaluated:</span>
                <span className="font-bold text-foreground">{job.candidates}</span>
              </div>
              {job.lastSyncedAt && (
                <div className="flex justify-between text-[11px] text-muted-foreground font-semibold items-center">
                  <span>Last Auto-Sync:</span>
                  <span className="font-bold text-foreground flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {new Date(job.lastSyncedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
              )}
            </CardContent>
            <CardFooter className="pb-4 pt-0 flex justify-between gap-2 border-t border-border/60 mt-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs mt-3 border-border text-foreground/90 font-semibold"
                onClick={() => {
                  setActiveJD(job.jd);
                  setActiveTab("screening");
                  toast.info(`Swapped active workspace context to "${job.title}"`);
                }}
              >
                Select Position
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </motion.div>
  );
}
