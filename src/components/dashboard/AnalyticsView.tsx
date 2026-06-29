// src/components/dashboard/AnalyticsView.tsx
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend, BarChart, Bar } from "recharts";
import { Candidate } from "../../types/index";
import { BarChart3, TrendingUp, PieChart as PieIcon, Award, UserCheck, Percent } from "lucide-react";

interface AnalyticsViewProps {
  candidates: Candidate[];
}

export function AnalyticsView({ candidates }: AnalyticsViewProps) {
  const totalScreenedCount = candidates.length;

  const dynamicPieData = useMemo(() => {
    const highMatchCount = candidates.filter(c => (c.score || 0) >= 80).length;
    const moderateMatchCount = candidates.filter(c => (c.score || 0) >= 50 && (c.score || 0) < 80).length;
    const lowMatchCount = candidates.filter(c => (c.score || 0) < 50).length;

    if (totalScreenedCount === 0) {
      return [
        { name: "Shortlisted (>80)", value: 42, color: "#10b981" },
        { name: "Moderate Match (50-80)", value: 58, color: "#6366f1" },
        { name: "Low Match (<50)", value: 14, color: "#f43f5e" },
      ];
    }

    return [
      { name: "Shortlisted (>80)", value: highMatchCount, color: "#10b981" },
      { name: "Moderate Match (50-80)", value: moderateMatchCount, color: "#6366f1" },
      { name: "Low Match (<50)", value: lowMatchCount, color: "#f43f5e" },
    ];
  }, [candidates, totalScreenedCount]);

  const dynamicVolumeData = useMemo(() => {
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

    return totalScreenedCount > 0
      ? daysOfWeek.map(day => ({ name: day, Volume: volumeCounts[day] }))
      : [
          { name: "Mon", Volume: 12 },
          { name: "Tue", Volume: 19 },
          { name: "Wed", Volume: 32 },
          { name: "Thu", Volume: 24 },
          { name: "Fri", Volume: 45 },
          { name: "Sat", Volume: 15 },
          { name: "Sun", Volume: 8 },
        ];
  }, [candidates, totalScreenedCount]);

  // Experience level distribution data
  const dynamicExperienceData = useMemo(() => {
    let entry = 0, mid = 0, senior = 0, lead = 0;

    candidates.forEach(c => {
      const exp = c.experienceYears || 0;
      if (exp < 2) entry++;
      else if (exp <= 5) mid++;
      else if (exp <= 10) senior++;
      else lead++;
    });

    if (totalScreenedCount === 0) {
      return [
        { name: "Entry (<2y)", Count: 5, color: "#818cf8" },
        { name: "Mid (2-5y)", Count: 14, color: "#6366f1" },
        { name: "Senior (5-10y)", Count: 8, color: "#4f46e5" },
        { name: "Lead (>10y)", Count: 3, color: "#3730a3" },
      ];
    }

    return [
      { name: "Entry (<2y)", Count: entry, color: "#818cf8" },
      { name: "Mid (2-5y)", Count: mid, color: "#6366f1" },
      { name: "Senior (5-10y)", Count: senior, color: "#4f46e5" },
      { name: "Lead (>10y)", Count: lead, color: "#3730a3" },
    ];
  }, [candidates, totalScreenedCount]);

  // Summary Metrics calculations
  const summaryStats = useMemo(() => {
    const total = candidates.length;
    const scoredCandidates = candidates.filter(c => (c.score || 0) > 0);
    const avgScore = scoredCandidates.length > 0
      ? Math.round(scoredCandidates.reduce((acc, c) => acc + (c.score || 0), 0) / scoredCandidates.length)
      : 74; // Fallback mock average

    const passThresholdRate = scoredCandidates.length > 0
      ? Math.round((candidates.filter(c => (c.score || 0) >= 70).length / scoredCandidates.length) * 100)
      : 68; // Fallback mock pass rate

    return {
      avgScore,
      passThresholdRate,
      activeJobs: totalScreenedCount > 0 ? Array.from(new Set(candidates.map(c => c.role))).length : 4
    };
  }, [candidates, totalScreenedCount]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 select-none">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Recruitment Performance Metrics</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">Vibrant interactive charts monitoring match splits, upload timelines, and experience splits.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Volume Area Chart (Col Span 2) */}
        <Card className="lg:col-span-2 shadow-sm border-border bg-card relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 via-indigo-650 to-cyan-500" />
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-indigo-500" />
                Daily Upload Volume
              </CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground mt-0.5">Evaluations triggered per week-day cycle.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dynamicVolumeData}>
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
                <Area type="monotone" dataKey="Volume" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Split Chart (Col Span 1) */}
        <Card className="lg:col-span-1 shadow-sm border-border bg-card relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-rose-500" />
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
                <PieIcon className="h-4 w-4 text-emerald-500" />
                Candidate Score Split
              </CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground mt-0.5">Division ratio of compatibility brackets.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dynamicPieData} cx="50%" cy="45%" innerRadius={65} outerRadius={85} paddingAngle={4} dataKey="value">
                  {dynamicPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--card)' }} />
                <Legend verticalAlign="bottom" height={36} iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 'bold' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Experience Level Bar Chart (Col Span 2) */}
        <Card className="lg:col-span-2 shadow-sm border-border bg-card relative overflow-hidden group">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-400 via-purple-500 to-indigo-650" />
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-violet-500" />
                Experience Level Distribution
              </CardTitle>
              <CardDescription className="text-[10px] text-muted-foreground mt-0.5">Candidate counts classified by career seniority bands.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dynamicExperienceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={10} tickLine={false} width={80} />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)' }} />
                <Bar dataKey="Count" radius={[0, 4, 4, 0]} barSize={18}>
                  {dynamicExperienceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Match Statistics Widget (Col Span 1) */}
        <Card className="lg:col-span-1 shadow-sm border-border bg-card relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 to-blue-500" />
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
              <Award className="h-4 w-4 text-indigo-500" />
              Recruitment Performance Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 select-none">
            {/* Stat Item 1 */}
            <div className="flex items-center gap-3 border border-border/60 bg-secondary/20 hover:bg-secondary/40 transition-colors p-3.5 rounded-xl">
              <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Percent className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Average Candidate Score</span>
                <span className="block text-lg font-extrabold text-foreground mt-0.5">{summaryStats.avgScore}%</span>
              </div>
            </div>

            {/* Stat Item 2 */}
            <div className="flex items-center gap-3 border border-border/60 bg-secondary/20 hover:bg-secondary/40 transition-colors p-3.5 rounded-xl">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <UserCheck className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Interview Conversion Rate</span>
                <span className="block text-lg font-extrabold text-foreground mt-0.5">{summaryStats.passThresholdRate}%</span>
              </div>
            </div>

            {/* Stat Item 3 */}
            <div className="flex items-center gap-3 border border-border/60 bg-secondary/20 hover:bg-secondary/40 transition-colors p-3.5 rounded-xl">
              <div className="h-8 w-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-900/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                <BarChart3 className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Active Job Roles Profiled</span>
                <span className="block text-lg font-extrabold text-foreground mt-0.5">{summaryStats.activeJobs} positions</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
