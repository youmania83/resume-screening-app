// src/components/dashboard/AnalyticsView.tsx
import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend } from "recharts";
import { Candidate } from "../../types/index";

interface AnalyticsViewProps {
  candidates: Candidate[];
}

export function AnalyticsView({ candidates }: AnalyticsViewProps) {
  const totalScreenedCount = candidates.length;

  const dynamicPieData = useMemo(() => {
    const highMatchCount = candidates.filter(c => (c.score || 0) >= 80).length;
    const moderateMatchCount = candidates.filter(c => (c.score || 0) >= 50 && (c.score || 0) < 80).length;
    const lowMatchCount = candidates.filter(c => (c.score || 0) < 50).length;

    return [
      { name: "Shortlisted (>80)", value: totalScreenedCount > 0 ? highMatchCount : 42, color: "#10b981" },
      { name: "Moderate Match (50-80)", value: totalScreenedCount > 0 ? moderateMatchCount : 58, color: "#f59e0b" },
      { name: "Low Match (<50)", value: totalScreenedCount > 0 ? lowMatchCount : 14, color: "#ef4444" },
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Recruitment Performance Metrics</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">Advanced charts monitoring conversion volumes and candidate distribution.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Daily Volume */}
        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Daily Upload Volume</CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground">Evaluations triggered per week-day cycle.</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dynamicVolumeData}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#475569" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#475569" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                <YAxis stroke="#94a3b8" fontSize={10} />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '4px' }} />
                <Area type="monotone" dataKey="Volume" stroke="#475569" strokeWidth={1.5} fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie distribution */}
        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Candidate Score Split</CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground">Division ratio of compatibility brackets.</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dynamicPieData} cx="50%" cy="50%" innerRadius={70} outerRadius={95} paddingAngle={4} dataKey="value">
                  {dynamicPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '10px' }} />
                <Legend verticalAlign="bottom" height={36} iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
