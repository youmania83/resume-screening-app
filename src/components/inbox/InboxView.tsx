"use client";
import React, { useState, useEffect, useCallback } from "react";
import { 
  Search, FileUp, RefreshCw, Trash2, GitMerge, AlertCircle, CheckCircle, 
  Clock, Database, Mail, ShieldAlert, Sparkles, HardDrive 
} from "lucide-react";
import { toast } from "sonner";

export default function InboxView() {
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [emailHealth, setEmailHealth] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncingEmail, setSyncingEmail] = useState(false);

  // Merge modal state
  const [selectedDuplicate, setSelectedDuplicate] = useState<any>(null);
  const [mergeReason, setMergeReason] = useState("Resolving parsed duplicate candidate");
  const [merging, setMerging] = useState(false);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        page: page.toString(),
        limit: "15",
        status: statusFilter,
        search
      });
      const res = await fetch(`/api/inbox?${q}`);
      const data = await res.json();
      if (data.success) {
        setInboxItems(data.data);
        setTotalPages(data.pagination.pages);
      }
    } catch {
      toast.error("Failed to load inbox resumes.");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/stats");
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchEmailHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/email-health");
      const data = await res.json();
      if (data.success) {
        setEmailHealth(data.health);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchInbox();
    fetchStats();
    fetchEmailHealth();
  }, [fetchInbox, fetchStats, fetchEmailHealth]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < e.target.files.length; i++) {
      formData.append("files", e.target.files[i]);
    }

    const uploadToast = toast.loading("Ingesting files...");
    try {
      const res = await fetch("/api/resumes/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Uploaded successfully! Enqueued ${data.enqueuedIds?.length || 0} jobs.`, { id: uploadToast });
        fetchInbox();
        fetchStats();
      } else {
        toast.error(data.error || "Upload failed.", { id: uploadToast });
      }
    } catch {
      toast.error("File upload network error.", { id: uploadToast });
    }
  };

  const handleSyncEmails = async (provider: string) => {
    setSyncingEmail(true);
    const syncToast = toast.loading(`Syncing ${provider} inbox...`);
    try {
      const res = await fetch("/api/inbox/email-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message, { id: syncToast });
        fetchInbox();
        fetchStats();
        fetchEmailHealth();
      } else {
        toast.error("Email sync failed.", { id: syncToast });
      }
    } catch {
      toast.error("Email sync request failed.", { id: syncToast });
    } finally {
      setSyncingEmail(false);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      const res = await fetch(`/api/inbox/retry/${id}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Job re-queued successfully.");
        fetchInbox();
        fetchStats();
      }
    } catch {
      toast.error("Failed to retry job.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this inbox item?")) return;
    try {
      const res = await fetch(`/api/inbox/delete/${id}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Inbox item deleted.");
        fetchInbox();
        fetchStats();
      }
    } catch {
      toast.error("Failed to delete inbox item.");
    }
  };

  const handleMerge = async () => {
    if (!selectedDuplicate) return;
    setMerging(true);
    try {
      const res = await fetch("/api/inbox/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryCandidateId: selectedDuplicate.primary_id,
          duplicateCandidateId: selectedDuplicate.duplicate_id,
          reason: mergeReason
        })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Candidates merged successfully!");
        setSelectedDuplicate(null);
        fetchInbox();
        fetchStats();
      } else {
        toast.error(data.error || "Merge failed.");
      }
    } catch {
      toast.error("Merge request error.");
    } finally {
      setMerging(false);
    }
  };

  const openMergeReview = async (item: any) => {
    try {
      const res = await fetch(`/api/candidates/${item.candidate_id}`);
      const candData = await res.json();
      if (candData.success) {
        // Fetch candidate duplicate relation details
        const dupCheck = await fetch(`/api/candidates?search=${candData.candidate.email}`);
        const dupData = await dupCheck.json();
        const primary = dupData.candidates?.find((c: any) => c.id !== item.candidate_id);
        
        setSelectedDuplicate({
          file_name: item.file_name,
          duplicate_id: item.candidate_id,
          duplicate_name: candData.candidate.name,
          duplicate_email: candData.candidate.email,
          primary_id: primary?.id || "existing-id",
          primary_name: primary?.name || "Existing Match Profile",
          primary_email: primary?.email || candData.candidate.email
        });
      }
    } catch {
      toast.error("Failed to fetch duplicate candidates information.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-violet-900 to-indigo-900 border border-violet-850 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Sparkles className="text-violet-400" />
            Resume Ingestion Inbox
          </h1>
          <p className="text-xs text-violet-300 mt-1">
            Asynchronously parse, scan, validate, and match incoming candidate resumes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <label className="flex items-center gap-2 bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 rounded-lg px-4 py-2 text-xs font-semibold cursor-pointer transition-all shadow-md">
            <FileUp size={14} className="text-violet-400" />
            Upload File / ZIP
            <input type="file" multiple onChange={handleFileUpload} className="hidden" accept=".pdf,.docx,.doc,.txt,.zip" />
          </label>
          <button
            onClick={() => handleSyncEmails("mock")}
            disabled={syncingEmail}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-850 disabled:opacity-50 text-slate-200 border border-slate-800 rounded-lg px-4 py-2 text-xs font-semibold transition-all shadow-md"
          >
            <Mail size={14} className="text-indigo-400" />
            Sync Mailbox
          </button>
        </div>
      </div>

      {/* Analytics KPI Block */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex items-center gap-4">
            <div className="bg-violet-950/40 border border-violet-800/40 p-2.5 rounded-lg text-violet-400">
              <Clock size={20} />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">Queue Stack</div>
              <div className="text-lg font-bold text-slate-200 mt-0.5">
                {stats.counts.queued || 0} Queued / {stats.counts.processing || 0} In Progress
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex items-center gap-4">
            <div className="bg-emerald-950/40 border border-emerald-800/40 p-2.5 rounded-lg text-emerald-400">
              <CheckCircle size={20} />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">Successfully Analyzed</div>
              <div className="text-lg font-bold text-slate-200 mt-0.5">
                {stats.counts.matched || 0} Matched
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex items-center gap-4">
            <div className="bg-amber-950/40 border border-amber-800/40 p-2.5 rounded-lg text-amber-400">
              <GitMerge size={20} />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">Duplicate Detection</div>
              <div className="text-lg font-bold text-slate-200 mt-0.5">
                {stats.counts.duplicate || 0} Duplicates
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex items-center gap-4">
            <div className="bg-rose-950/40 border border-rose-800/40 p-2.5 rounded-lg text-rose-400">
              <HardDrive size={20} />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">SaaS Storage Usage</div>
              <div className="text-lg font-bold text-slate-200 mt-0.5">
                {Math.round((stats.storage?.tenantStorageUsedBytes || 0) / 1024)} KB ({stats.storage?.tenantFiles || 0} files)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main List Column */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Search by candidate, email, or filename..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full bg-slate-950 border border-slate-850 rounded-lg pl-10 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {["", "Queued", "Processing", "Matched", "Needs Review", "Duplicate", "Failed"].map((status) => (
                <button
                  key={status}
                  onClick={() => { setStatusFilter(status); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    statusFilter === status 
                      ? "bg-violet-900/40 text-violet-400 border-violet-800" 
                      : "bg-slate-950 text-slate-400 border-slate-850 hover:bg-slate-850"
                  }`}
                >
                  {status || "All"}
                </button>
              ))}
            </div>
          </div>

          {/* Ingestion Table */}
          <div className="overflow-x-auto border border-slate-850 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-850 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="p-4">File Name</th>
                  <th className="p-4">Candidate Profile</th>
                  <th className="p-4">Confidence</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                      Loading inbox...
                    </td>
                  </tr>
                ) : inboxItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500 italic">
                      No matching resumes found in the ingestion queue.
                    </td>
                  </tr>
                ) : (
                  inboxItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-950/40 transition-colors text-slate-300">
                      <td className="p-4 font-medium text-slate-100 max-w-xs truncate">{item.file_name}</td>
                      <td className="p-4">
                        {item.candidate_name ? (
                          <div>
                            <div className="font-semibold text-slate-200">{item.candidate_name}</div>
                            <div className="text-[10px] text-slate-500">{item.candidate_email}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="p-4">
                        {item.overall_confidence ? (
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-violet-400">{Math.round(item.overall_confidence * 100)}%</span>
                            <span className="text-[10px] text-slate-500">(Skills: {Math.round(item.skills_confidence * 100)}%)</span>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${
                          item.status === "Matched" ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/40" :
                          item.status === "Processing" ? "bg-indigo-950/40 text-indigo-400 border-indigo-800/40 animate-pulse" :
                          item.status === "Duplicate" ? "bg-amber-950/40 text-amber-400 border-amber-800/40" :
                          item.status === "Needs Review" ? "bg-amber-950/40 text-amber-400 border-amber-800/40" :
                          item.status === "Failed" ? "bg-rose-950/40 text-rose-400 border-rose-800/40" :
                          "bg-slate-950 text-slate-400 border-slate-850"
                        }`}>
                          {item.status}
                        </span>
                        {item.error_message && (
                          <div className="text-[10px] text-rose-400 mt-1 max-w-xs truncate flex items-center gap-1">
                            <AlertCircle size={10} className="flex-shrink-0" />
                            {item.error_message}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-right flex justify-end gap-2">
                        {item.status === "Duplicate" && (
                          <button
                            onClick={() => openMergeReview(item)}
                            className="p-1.5 text-amber-400 bg-amber-950/20 border border-amber-800/30 hover:bg-amber-950/50 rounded transition-colors"
                            title="Review & Merge Duplicate"
                          >
                            <GitMerge size={14} />
                          </button>
                        )}
                        {(item.status === "Failed" || item.status === "Queued") && (
                          <button
                            onClick={() => handleRetry(item.id)}
                            className="p-1.5 text-violet-400 bg-violet-950/20 border border-violet-800/30 hover:bg-violet-950/50 rounded transition-colors"
                            title="Retry Job"
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 text-rose-400 bg-rose-950/20 border border-rose-800/30 hover:bg-rose-950/50 rounded transition-colors"
                          title="Delete record"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-850 pt-4 mt-4">
              <span className="text-[11px] text-slate-500 font-semibold">
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-slate-950 hover:bg-slate-850 disabled:opacity-40 text-slate-200 border border-slate-850 rounded-lg text-xs font-semibold transition-all"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 bg-slate-950 hover:bg-slate-850 disabled:opacity-40 text-slate-200 border border-slate-850 rounded-lg text-xs font-semibold transition-all"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Status Column */}
        <div className="space-y-6">
          {/* Email Sync Status Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-850 pb-2.5">
              <Mail size={16} className="text-violet-400" />
              Email Ingestion Sync Status
            </h3>
            <div className="space-y-3">
              {emailHealth ? (
                Object.keys(emailHealth).map((providerKey) => {
                  const prov = emailHealth[providerKey];
                  return (
                    <div key={providerKey} className="flex items-center justify-between gap-3 p-2.5 bg-slate-950 rounded-lg border border-slate-850">
                      <div>
                        <span className="text-xs font-bold text-slate-200 uppercase">{providerKey} Connected</span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Last sync: {prov.lastSyncTime ? new Date(prov.lastSyncTime).toLocaleTimeString() : "Never"}
                        </div>
                        {prov.errorMessage && (
                          <div className="text-[9px] text-rose-400 mt-0.5 truncate max-w-[150px]">{prov.errorMessage}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${prov.connected ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-slate-700"}`} />
                        <button
                          onClick={() => handleSyncEmails(providerKey)}
                          disabled={syncingEmail}
                          className="p-1 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 transition-colors disabled:opacity-40"
                          title={`Sync ${providerKey}`}
                        >
                          <RefreshCw size={11} className={syncingEmail ? "animate-spin" : ""} />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-slate-500 italic text-xs">Loading sync health...</p>
              )}
            </div>
          </div>

          {/* Processing SLA Timings */}
          {stats && stats.sla && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-850 pb-2.5">
                <Clock size={16} className="text-violet-400" />
                Ingestion SLA Monitor
              </h3>
              <div className="space-y-2 text-xs">
                {stats.sla.length === 0 ? (
                  <p className="text-slate-500 italic text-[11px]">No processing audit logs found.</p>
                ) : (
                  stats.sla.map((s: any) => (
                    <div key={s.step} className="flex justify-between items-center py-1">
                      <span className="text-slate-400">{s.step}</span>
                      <span className="font-bold text-slate-200">{s.avg_duration_ms ? `${s.avg_duration_ms}ms` : "0ms"}</span>
                    </div>
                  ))
                )}
                <div className="pt-2 border-t border-slate-850 mt-2 text-[10px] text-slate-500 flex items-center gap-1.5">
                  <ShieldAlert size={12} className="text-amber-500" />
                  Alert triggers if overall process exceeds 5 mins.
                </div>
              </div>
            </div>
          )}

          {/* Storage Cost Controls */}
          {stats && stats.storage && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-850 pb-2.5">
                <Database size={16} className="text-violet-400" />
                Storage Cost Controls
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-400">Tenant Files</span>
                  <span className="font-bold text-slate-200">{stats.storage.tenantFiles}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-400">Tenant Storage</span>
                  <span className="font-bold text-slate-200">{Math.round((stats.storage.tenantStorageUsedBytes || 0) / 1024 * 10) / 10} KB</span>
                </div>
                <div className="pt-2 border-t border-slate-850 mt-2">
                  <div className="flex justify-between py-0.5 text-[11px] text-slate-500">
                    <span>Total Platform Files</span>
                    <span>{stats.storage.totalFiles}</span>
                  </div>
                  <div className="flex justify-between py-0.5 text-[11px] text-slate-500">
                    <span>Total Platform Storage</span>
                    <span>{Math.round((stats.storage.totalStorageUsedBytes || 0) / 1024 * 10) / 10} KB</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Duplicate Candidate Merge Review Modal */}
      {selectedDuplicate && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-6">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <GitMerge className="text-amber-400" />
              Duplicate Merge Review
            </h3>
            
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-850 space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block">Uploaded File:</span>
                <span className="font-semibold text-slate-200">{selectedDuplicate.file_name}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-850">
                <div>
                  <span className="text-amber-400 font-bold block">New Upload Profile</span>
                  <span className="text-slate-300 font-semibold">{selectedDuplicate.duplicate_name}</span>
                  <span className="text-slate-500 block">{selectedDuplicate.duplicate_email}</span>
                </div>
                <div>
                  <span className="text-emerald-400 font-bold block">Primary Profile</span>
                  <span className="text-slate-300 font-semibold">{selectedDuplicate.primary_name}</span>
                  <span className="text-slate-500 block">{selectedDuplicate.primary_email}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-semibold">Merge Reason / Rationale</label>
              <textarea
                value={mergeReason}
                onChange={(e) => setMergeReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSelectedDuplicate(null)}
                className="px-4 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs font-semibold text-slate-450 hover:bg-slate-850 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                disabled={merging}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                {merging ? "Merging..." : "Confirm Merge"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
