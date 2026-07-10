// src/components/dashboard/AnalyticsView.tsx
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell, Legend } from "recharts";
import { Candidate } from "../../types/index";
import { BarChart3, TrendingUp, UserCheck, XCircle, Users, CheckCircle } from "lucide-react";
import { Badge } from "../ui/badge";

interface AnalyticsViewProps {
  candidates: Candidate[];
}

export function AnalyticsView({ candidates }: AnalyticsViewProps) {
  const totalApplied = candidates.length;

  // Calculate counts for key stages
  const stats = useMemo(() => {
    const total = candidates.length;
    
    // Status counts
    const appliedCount = total;
    const shortlistedCount = candidates.filter(c => (c.status || "").toLowerCase() === "shortlisted").length;
    const interviewingCount = candidates.filter(c => (c.status || "").toLowerCase() === "interviewing").length;
    const scheduledCount = candidates.filter(c => (c.status || "").toLowerCase() === "interview_scheduled").length;
    const rejectedCount = candidates.filter(c => (c.status || "").toLowerCase() === "rejected").length;
    const selectedCount = candidates.filter(c => ["selected", "hired", "onboarded"].includes((c.status || "").toLowerCase())).length;
    const holdCount = candidates.filter(c => (c.status || "").toLowerCase() === "hold").length;

    // Percentages (relative to total applied)
    const shortlistedPercent = total > 0 ? Math.round((shortlistedCount / total) * 100) : 0;
    const scheduledPercent = total > 0 ? Math.round((scheduledCount / total) * 100) : 0;
    const rejectedPercent = total > 0 ? Math.round((rejectedCount / total) * 100) : 0;
    const selectedPercent = total > 0 ? Math.round((selectedCount / total) * 100) : 0;
    
    // Average scores
    const scoredCandidates = candidates.filter(c => (c.score || 0) > 0);
    const avgScore = scoredCandidates.length > 0
      ? Math.round(scoredCandidates.reduce((acc, c) => acc + (c.score || 0), 0) / scoredCandidates.length)
      : 0;

    return {
      total,
      appliedCount,
      shortlistedCount,
      interviewingCount,
      scheduledCount,
      rejectedCount,
      selectedCount,
      holdCount,
      shortlistedPercent,
      scheduledPercent,
      rejectedPercent,
      selectedPercent,
      avgScore
    };
  }, [candidates]);

  // Data for the main funnel bar chart (Applied vs Shortlisted vs Interview Scheduled vs Selected vs Rejected)
  const funnelChartData = useMemo(() => {
    if (totalApplied === 0) {
      // Mock data if empty
      return [
        { stage: "Applied", Count: 100, Percentage: 100, color: "#6366f1" },
        { stage: "Shortlisted", Count: 60, Percentage: 60, color: "#3b82f6" },
        { stage: "Interview Scheduled", Count: 35, Percentage: 35, color: "#06b6d4" },
        { stage: "Selected / Hired", Count: 15, Percentage: 15, color: "#10b981" },
        { stage: "Rejected", Count: 25, Percentage: 25, color: "#f43f5e" }
      ];
    }

    return [
      {
        stage: "Applied",
        Count: stats.appliedCount,
        Percentage: 100,
        color: "#6366f1" // Indigo
      },
      {
        stage: "Shortlisted",
        Count: stats.shortlistedCount,
        Percentage: stats.shortlistedPercent,
        color: "#3b82f6" // Blue
      },
      {
        stage: "Interview Scheduled",
        Count: stats.scheduledCount,
        Percentage: stats.scheduledPercent,
        color: "#06b6d4" // Cyan
      },
      {
        stage: "Selected / Hired",
        Count: stats.selectedCount,
        Percentage: stats.selectedPercent,
        color: "#10b981" // Emerald
      },
      {
        stage: "Rejected",
        Count: stats.rejectedCount,
        Percentage: stats.rejectedPercent,
        color: "#f43f5e" // Rose
      }
    ];
  }, [stats, totalApplied]);

  // Dynamic daily upload volume line/area chart data
  const volumeData = useMemo(() => {
    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const volumeCounts: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };

    candidates.forEach(c => {
      if (c.appliedDate) {
        try {
          const date = new Date(c.appliedDate);
          const dayName = daysOfWeek[date.getDay()];
          if (volumeCounts[dayName] !== undefined) {
            volumeCounts[dayName]++;
          }
        } catch {
          // ignore date parse errors
        }
      }
    });

    return totalApplied > 0
      ? daysOfWeek.map(day => ({ name: day, Candidates: volumeCounts[day] }))
      : [
          { name: "Mon", Candidates: 12 },
          { name: "Tue", Candidates: 19 },
          { name: "Wed", Candidates: 32 },
          { name: "Thu", Candidates: 24 },
          { name: "Fri", Candidates: 45 },
          { name: "Sat", Candidates: 15 },
          { name: "Sun", Candidates: 8 },
        ];
  }, [candidates, totalApplied]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Recruitment Analytics</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">
          Performance metrics for Techsol Engineers recruitment funnel
        </p>
      </div>

      {/* Modern Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Applied */}
        <Card className="shadow-sm border-border bg-card relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Total Applied</span>
              <p className="text-2xl font-bold text-foreground">{stats.appliedCount}</p>
              <span className="text-[9px] text-muted-foreground font-semibold">100% of candidate pool</span>
            </div>
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Interview Scheduled */}
        <Card className="shadow-sm border-border bg-card relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Interview Scheduled</span>
              <p className="text-2xl font-bold text-foreground">{stats.scheduledCount}</p>
              <div className="flex items-center gap-1">
                <Badge className="bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20 text-[9px] font-bold py-0">
                  {stats.scheduledPercent}%
                </Badge>
                <span className="text-[9px] text-muted-foreground font-semibold">schedule rate</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-500">
              <UserCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Selected / Hired */}
        <Card className="shadow-sm border-border bg-card relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Selected / Hired</span>
              <p className="text-2xl font-bold text-foreground">{stats.selectedCount}</p>
              <div className="flex items-center gap-1">
                <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 text-[9px] font-bold py-0">
                  {stats.selectedPercent}%
                </Badge>
                <span className="text-[9px] text-muted-foreground font-semibold">selection rate</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <CheckCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Rejected */}
        <Card className="shadow-sm border-border bg-card relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Rejected</span>
              <p className="text-2xl font-bold text-foreground">{stats.rejectedCount}</p>
              <div className="flex items-center gap-1">
                <Badge className="bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 text-[9px] font-bold py-0">
                  {stats.rejectedPercent}%
                </Badge>
                <span className="text-[9px] text-muted-foreground font-semibold">rejection rate</span>
              </div>
            </div>
            <div className="h-10 w-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
              <XCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analysis Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recruitment Funnel Comparison (Col Span 2) */}
        <Card className="lg:col-span-2 shadow-sm border-border bg-card relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-500" />
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Recruitment Funnel Breakdown
            </CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground">
              Comparison of candidates by stage (number count and percentage of total applied)
            </CardDescription>
          </CardHeader>

          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelChartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
                <XAxis dataKey="stage" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Candidate Count', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: '9px', fill: '#94a3b8', fontWeight: 'bold' } }} />
                <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} label={{ value: 'Percentage (%)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fontSize: '9px', fill: '#94a3b8', fontWeight: 'bold' } }} />
                <Tooltip 
                  contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }}
                  formatter={(value: any, name?: any) => [value, name || ""]}
                />
                <Bar yAxisId="left" dataKey="Count" name="Count (Candidate)" radius={[4, 4, 0, 0]} barSize={24}>
                  {funnelChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
                <Bar yAxisId="right" dataKey="Percentage" name="Percentage (%)" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={8} opacity={0.3} />
                <Legend verticalAlign="top" height={36} iconSize={10} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Funnel Conversion Insights Panel (Col Span 1) */}
        <Card className="lg:col-span-1 shadow-sm border-border bg-card relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 to-indigo-500" />
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">
              Conversion Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {/* Shortlist Conversion */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[10px] uppercase text-muted-foreground">Shortlist Rate</span>
                <span className="text-foreground">{stats.shortlistedCount} Candidates ({stats.shortlistedPercent}%)</span>
              </div>
              <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.shortlistedPercent}%` }}
                  transition={{ duration: 0.8 }}
                  className="bg-blue-500 h-full rounded-full"
                />
              </div>
            </div>

            {/* Scheduled Conversion */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[10px] uppercase text-muted-foreground">Interview Scheduled Rate</span>
                <span className="text-foreground">{stats.scheduledCount} Candidates ({stats.scheduledPercent}%)</span>
              </div>
              <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.scheduledPercent}%` }}
                  transition={{ duration: 0.8 }}
                  className="bg-cyan-500 h-full rounded-full"
                />
              </div>
            </div>

            {/* Selection Conversion */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[10px] uppercase text-muted-foreground">Selection/Hiring Rate</span>
                <span className="text-foreground">{stats.selectedCount} Candidates ({stats.selectedPercent}%)</span>
              </div>
              <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.selectedPercent}%` }}
                  transition={{ duration: 0.8 }}
                  className="bg-emerald-500 h-full rounded-full"
                />
              </div>
            </div>

            {/* Rejection Rate */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className="text-[10px] uppercase text-rose-500">Rejection Rate</span>
                <span className="text-foreground">{stats.rejectedCount} Candidates ({stats.rejectedPercent}%)</span>
              </div>
              <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${stats.rejectedPercent}%` }}
                  transition={{ duration: 0.8 }}
                  className="bg-rose-500 h-full rounded-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Trend Line Chart */}
      <Card className="shadow-sm border-border bg-card relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 to-cyan-500" />
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            Weekly Recruitment Volume
          </CardTitle>
          <CardDescription className="text-[10px] text-muted-foreground">
            Daily candidate upload/application trend
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volumeData}>
              <defs>
                <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} vertical={false} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }} />
              <Area type="monotone" dataKey="Candidates" name="Intake Count" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorVolume)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </motion.div>
  );
}
