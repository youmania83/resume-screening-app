// src/components/dashboard/HRInterviewDashboard.tsx
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Clock, User, Mail, Briefcase, Search, CalendarCheck, Send, X, ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Candidate } from "../../types/index";
import { toast } from "sonner";

interface HRInterviewDashboardProps {
  candidates: Candidate[];
  loadCandidates: () => void;
}

export function HRInterviewDashboard({ candidates, loadCandidates }: HRInterviewDashboardProps) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const [searchQuery, setSearchQuery] = useState("");
  const [schedulingCandidate, setSchedulingCandidate] = useState<Candidate | null>(null);
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [viewFilter, setViewFilter] = useState<"pending" | "scheduled" | "all">("pending");

  // Filter candidates with status "interviewing" (pending HR interview) or "interview_scheduled"
  const interviewCandidates = useMemo(() => {
    return candidates.filter(c => {
      const status = (c.status || "").toLowerCase();
      if (viewFilter === "pending") return status === "interviewing";
      if (viewFilter === "scheduled") return status === "interview_scheduled";
      return status === "interviewing" || status === "interview_scheduled";
    }).filter(c => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.role.toLowerCase().includes(q);
    });
  }, [candidates, viewFilter, searchQuery]);

  const pendingCount = candidates.filter(c => (c.status || "").toLowerCase() === "interviewing").length;
  const scheduledCount = candidates.filter(c => (c.status || "").toLowerCase() === "interview_scheduled").length;

  const handleScheduleInterview = async () => {
    if (!schedulingCandidate || !interviewDate || !interviewTime) {
      toast.error("Please select both date and time for the interview.");
      return;
    }

    const scheduledDateTime = new Date(`${interviewDate}T${interviewTime}`);
    if (scheduledDateTime <= new Date()) {
      toast.error("Interview date must be in the future.");
      return;
    }

    setIsScheduling(true);
    toast.loading("Scheduling interview & sending calendar invite...", { id: "schedule-loader" });

    try {
      // 1. Schedule via calendar endpoint (creates interview record + sends ICS email)
      const calResp = await fetch(`${apiBase}/calendar/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: schedulingCandidate.id,
          scheduledDate: scheduledDateTime.toISOString(),
          title: `HR Interview - ${schedulingCandidate.name}`,
          description: `HR Interview for ${schedulingCandidate.role} position`
        })
      });

      if (!calResp.ok) {
        throw new Error("Failed to create calendar event.");
      }

      // 2. Update candidate status to "interview_scheduled"
      const decisionResp = await fetch(`${apiBase}/candidates/${schedulingCandidate.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision: "interview_scheduled",
          remarks: `HR Interview scheduled for ${scheduledDateTime.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
        })
      });

      if (decisionResp.ok) {
        toast.success(`Interview scheduled! Calendar invite sent to ${schedulingCandidate.email}`, { id: "schedule-loader" });
      } else {
        toast.success(`Interview created but status update may have failed.`, { id: "schedule-loader" });
      }

      // 3. Reset form and refresh candidates
      setSchedulingCandidate(null);
      setInterviewDate("");
      setInterviewTime("");
      loadCandidates();

    } catch (err: any) {
      toast.error(err.message || "Failed to schedule interview.", { id: "schedule-loader" });
    } finally {
      setIsScheduling(false);
    }
  };

  // Generate time slots in 30-minute intervals
  const timeSlots = useMemo(() => {
    const slots: string[] = [];
    for (let h = 9; h <= 18; h++) {
      for (const m of ["00", "30"]) {
        if (h === 18 && m === "30") continue;
        const hour = h.toString().padStart(2, "0");
        slots.push(`${hour}:${m}`);
      }
    }
    return slots;
  }, []);

  // Get minimum date (tomorrow)
  const minDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      {/* Header Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Pending Interview</p>
              <p className="text-2xl font-bold text-foreground">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CalendarCheck className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Scheduled</p>
              <p className="text-2xl font-bold text-foreground">{scheduledCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Total in Pipeline</p>
              <p className="text-2xl font-bold text-foreground">{pendingCount + scheduledCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-5 gap-6">
        {/* Candidate List - Left Panel */}
        <div className="col-span-3">
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Interview Queue</CardTitle>
                  <CardDescription className="text-[10px] text-muted-foreground">
                    Candidates awaiting HR interview scheduling
                  </CardDescription>
                </div>
                <div className="relative w-56">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search candidate..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-secondary/40 border border-border rounded-md pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-semibold"
                  />
                </div>
              </div>
              {/* View Filter Tabs */}
              <div className="flex items-center gap-2 mt-3">
                {[
                  { id: "pending" as const, label: "Pending", count: pendingCount, color: "text-amber-600" },
                  { id: "scheduled" as const, label: "Scheduled", count: scheduledCount, color: "text-emerald-600" },
                  { id: "all" as const, label: "All", count: pendingCount + scheduledCount, color: "text-blue-600" },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setViewFilter(tab.id)}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      viewFilter === tab.id
                        ? "bg-primary/10 text-primary border border-primary/20 shadow-xs"
                        : "text-muted-foreground hover:bg-secondary/50 border border-transparent"
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-0 max-h-[520px] overflow-y-auto custom-scrollbar">
              {interviewCandidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Calendar className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-xs font-bold">No candidates in this queue</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Candidates with &quot;interviewing&quot; status will appear here</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {interviewCandidates.map(c => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className={`p-4 hover:bg-secondary/30 transition-colors cursor-pointer ${
                        schedulingCandidate?.id === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                      }`}
                      onClick={() => {
                        if ((c.status || "").toLowerCase() === "interviewing") {
                          setSchedulingCandidate(c);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold shadow-sm flex-shrink-0">
                            {c.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground">{c.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                                <Mail className="h-2.5 w-2.5" /> {c.email}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5">
                              <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                                <Briefcase className="h-2.5 w-2.5" /> {c.role}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-semibold">
                                {c.experienceYears}y exp
                              </span>
                              <span className={`text-[10px] font-bold ${c.score >= 80 ? "text-emerald-600" : c.score >= 60 ? "text-amber-600" : "text-red-500"}`}>
                                Score: {c.score}%
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <Badge
                            variant={(c.status || "").toLowerCase() === "interview_scheduled" ? "success" : "warning"}
                            className="text-[8px] uppercase tracking-wider py-0"
                          >
                            {(c.status || "").toLowerCase() === "interview_scheduled" ? "Scheduled" : "Pending"}
                          </Badge>
                          {(c.status || "").toLowerCase() === "interview_scheduled" && c.interviewScheduledDate && (
                            <span className="text-[9px] text-emerald-600 font-semibold">
                              {new Date(c.interviewScheduledDate).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                          {(c.status || "").toLowerCase() === "interviewing" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSchedulingCandidate(c);
                              }}
                              className="text-[9px] font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer"
                            >
                              Schedule →
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Scheduling Panel - Right Side */}
        <div className="col-span-2">
          <Card className="shadow-sm border-border bg-card sticky top-6">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary" />
                Schedule Interview
              </CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground">
                Select a candidate from the queue, pick date & time, and send invite
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5">
              <AnimatePresence mode="wait">
                {!schedulingCandidate ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-12 text-muted-foreground"
                  >
                    <User className="h-12 w-12 text-muted-foreground/20 mb-3" />
                    <p className="text-xs font-bold">No Candidate Selected</p>
                    <p className="text-[10px] text-muted-foreground mt-1 text-center max-w-[200px]">
                      Click on a pending candidate from the queue to schedule their HR interview
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-5"
                  >
                    {/* Selected Candidate Info */}
                    <div className="bg-secondary/40 rounded-lg p-4 border border-border relative">
                      <button
                        onClick={() => setSchedulingCandidate(null)}
                        className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                          {schedulingCandidate.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-foreground">{schedulingCandidate.name}</p>
                          <p className="text-[10px] text-muted-foreground font-semibold">{schedulingCandidate.email}</p>
                          <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">{schedulingCandidate.role} • Score: {schedulingCandidate.score}%</p>
                        </div>
                      </div>
                    </div>

                    {/* Date Picker */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2 block">
                        Interview Date
                      </label>
                      <div className="relative">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-2.5" />
                        <input
                          type="date"
                          value={interviewDate}
                          onChange={(e) => setInterviewDate(e.target.value)}
                          min={minDate}
                          className="w-full bg-secondary/40 border border-border rounded-md pl-9 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-semibold"
                        />
                      </div>
                    </div>

                    {/* Time Picker */}
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2 block">
                        Interview Time
                      </label>
                      <div className="relative">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-2.5" />
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground absolute right-3 top-2.5 pointer-events-none" />
                        <select
                          value={interviewTime}
                          onChange={(e) => setInterviewTime(e.target.value)}
                          className="w-full bg-secondary/40 border border-border rounded-md pl-9 pr-8 py-2 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-semibold appearance-none cursor-pointer"
                        >
                          <option value="">Select time slot</option>
                          {timeSlots.map(slot => {
                            const [h, m] = slot.split(":");
                            const hour = parseInt(h);
                            const ampm = hour >= 12 ? "PM" : "AM";
                            const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
                            return (
                              <option key={slot} value={slot}>
                                {displayHour}:{m} {ampm}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* Preview */}
                    {interviewDate && interviewTime && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 rounded-lg p-3"
                      >
                        <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-400 mb-1">Interview Preview</p>
                        <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                          {new Date(`${interviewDate}T${interviewTime}`).toLocaleString("en-US", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-500 mt-1 font-semibold">
                          📧 Calendar invite will be sent to {schedulingCandidate.email}
                        </p>
                      </motion.div>
                    )}

                    {/* Schedule Button */}
                    <Button
                      className="w-full text-xs font-bold gap-2"
                      disabled={!interviewDate || !interviewTime || isScheduling}
                      onClick={handleScheduleInterview}
                    >
                      {isScheduling ? (
                        <>
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Scheduling...
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          Schedule & Send Invite
                        </>
                      )}
                    </Button>

                    <p className="text-[9px] text-muted-foreground text-center">
                      This will create a calendar event, send an ICS invite email, and update the candidate status
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
