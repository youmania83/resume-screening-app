// src/components/dashboard/PlatformHealthView.tsx
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Server, Database, Mail, Trash2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toast } from "sonner";

interface DiagnosticsData {
  queue: {
    provider: string;
    depth: number;
    active: number;
    completed: number;
    failed: number;
    dlqCount: number;
  };
  redis: {
    status: string;
  };
  email: {
    status: string;
    provider: string;
  };
  storage: {
    provider: string;
    totalBytes: number;
    filesCount: number;
  };
  tenants: {
    activeCount: number;
  };
  metrics: {
    averageParseTimeMs: number;
  };
  timestamp: string;
}

export function PlatformHealthView() {
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pruning, setPruning] = useState(false);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const resp = await fetch(`${apiBase}/health/diagnostics`);
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.success) {
          setData(json.data);
        }
      }
    } catch (err) {
      console.error("Failed to load health diagnostics", err);
      toast.error("Could not fetch server health diagnostics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  const handlePruningTrigger = async () => {
    setPruning(true);
    toast.loading("Initiating storage pruning job...", { id: "prune-toast" });
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
      const resp = await fetch(`${apiBase}/health/prune-storage`, { method: "POST" });
      if (resp.ok) {
        const json = await resp.json();
        if (json && json.success) {
          toast.success(`Pruning complete! Deleted ${json.deletedCount} orphaned files, freeing ${json.bytesFreed} bytes.`, { id: "prune-toast" });
          fetchDiagnostics();
          return;
        }
      }
      throw new Error("Execution failed");
    } catch {
      toast.error("Storage pruning trigger failed.", { id: "prune-toast" });
    } finally {
      setPruning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center text-xs text-muted-foreground font-semibold">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border border-muted border-t-foreground" />
          <span>Collecting systems diagnostic telemetry...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-xs font-semibold text-rose-500">
        Failed to fetch diagnostics. Ensure backend server is running.
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

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
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Platform Health Control</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">Real-time status of critical systems, queue depths, and database metrics.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchDiagnostics} className="text-xs font-semibold gap-1 border-border">
          Refresh Telemetry
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Redis & Queues */}
        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-indigo-500" />
              Queue & Background Workers
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Queue Provider:</span>
              <Badge variant="outline" className="font-mono text-[10px] bg-secondary/30">{data.queue.provider}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Redis Connection:</span>
              <Badge variant={data.redis.status === "connected" ? "success" : "destructive"} className="text-[9px] font-bold">
                {data.redis.status}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Queue Depth (Active/Queued):</span>
              <span className="font-bold text-foreground">{data.queue.active} active / {data.queue.depth} waiting</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">DLQ Count (Failed parsing):</span>
              <Badge variant={data.queue.dlqCount > 0 ? "destructive" : "outline"} className="font-bold text-[10px]">
                {data.queue.dlqCount} failed
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Database & Storage */}
        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-emerald-500" />
              Database & Storage Engine
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Active Tenants Count:</span>
              <span className="font-bold text-foreground">{data.tenants.activeCount} Tenants</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Storage Provider:</span>
              <Badge variant="outline" className="font-mono uppercase text-[10px] bg-secondary/30">{data.storage.provider}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Total Files Count:</span>
              <span className="font-bold text-foreground">{data.storage.filesCount} file(s)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Total Disk Space Consumed:</span>
              <span className="font-bold text-foreground">{formatBytes(data.storage.totalBytes)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Communication & Processing */}
        <Card className="shadow-sm border-border bg-card">
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-amber-500" />
              Communication & Processing
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Email SMTP Status:</span>
              <Badge variant={data.email.status === "connected" ? "success" : "warning"} className="text-[9px] font-bold">
                {data.email.status}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">SMTP Gateway:</span>
              <span className="font-bold text-foreground truncate max-w-[150px]" title={data.email.provider}>{data.email.provider}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-semibold text-muted-foreground">Avg Resume Parse Latency:</span>
              <span className="font-bold text-foreground">{data.metrics.averageParseTimeMs} ms</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manual Actions panel */}
      <Card className="shadow-sm border-border bg-card">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
            Administrative Systems Maintenance
          </CardTitle>
          <CardDescription className="text-[10px] text-muted-foreground">Run manual diagnostic cleanups and garbage collections on workspace files.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 flex flex-wrap gap-4 items-center">
          <div>
            <span className="block font-bold text-xs text-foreground">Storage Pruning Service</span>
            <span className="text-[10px] text-muted-foreground font-semibold block mt-0.5">
              Scans storage partitions, deletes unreferenced documents, and updates monthly tenant quotas.
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            disabled={pruning}
            onClick={handlePruningTrigger}
            className="text-xs font-semibold gap-1.5 ml-auto"
          >
            <Trash2 className="h-3.5 w-3.5" /> Force Prune Orphans
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
