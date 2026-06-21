"use client";
import React, { useState } from "react";
import { User, Tag, Plus, X, Briefcase, Mail, Phone, Calendar, DollarSign } from "lucide-react";

interface OverviewTabProps {
  candidate: any;
  tags: any[];
  recruiters: any[];
  onAddTag: (tagName: string) => Promise<void>;
  onRemoveTag: (tagId: string) => Promise<void>;
  onUpdateRecruiter: (recruiterId: string) => Promise<void>;
}

export default function OverviewTab({
  candidate,
  tags,
  recruiters,
  onAddTag,
  onRemoveTag,
  onUpdateRecruiter
}: OverviewTabProps) {
  const [newTag, setNewTag] = useState("");
  const [loadingTag, setLoadingTag] = useState(false);

  const handleTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    setLoadingTag(true);
    try {
      await onAddTag(newTag.trim());
      setNewTag("");
    } finally {
      setLoadingTag(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Left Column - Essential Bio & Scores */}
      <div className="md:col-span-2 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
            <User size={20} className="text-violet-400" />
            General Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-slate-300">
            <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
              <Mail size={16} className="text-slate-500" />
              <div>
                <div className="text-xs text-slate-500">Email</div>
                <div className="text-sm font-medium">{candidate.email || "N/A"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
              <Phone size={16} className="text-slate-500" />
              <div>
                <div className="text-xs text-slate-500">Phone</div>
                <div className="text-sm font-medium">{candidate.phone || "N/A"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
              <Briefcase size={16} className="text-slate-500" />
              <div>
                <div className="text-xs text-slate-500">Target Role</div>
                <div className="text-sm font-medium">{candidate.role || "N/A"}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
              <Calendar size={16} className="text-slate-500" />
              <div>
                <div className="text-xs text-slate-500">Availability Date</div>
                <div className="text-sm font-medium">{candidate.availability_date || "Immediate"}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Staffing and Compensation Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
            <DollarSign size={20} className="text-emerald-400" />
            Compensation & Visa Profile
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-slate-300">
            <div>
              <div className="text-xs text-slate-500 mb-1">Expected Salary</div>
              <div className="text-sm font-semibold bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                {candidate.expected_salary || "Not Specified"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Current Salary</div>
              <div className="text-sm font-semibold bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                {candidate.current_salary || "Not Specified"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Work Authorization</div>
              <div className="text-sm font-semibold bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                {candidate.work_authorization || "Not Specified"}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Visa / Relocation Status</div>
              <div className="text-sm font-semibold bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                {candidate.visa_status || "Not Specified"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - Recruiter Assignment & Tags */}
      <div className="space-y-6">
        {/* Recruiter Selector */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
            <User size={18} className="text-amber-400" />
            Assigned Recruiter
          </h2>
          <div className="space-y-3">
            <label className="text-xs text-slate-500">Ownership Assignment</label>
            <select
              value={candidate.recruiter_owner_id || ""}
              onChange={(e) => onUpdateRecruiter(e.target.value)}
              className="w-full bg-slate-950 text-slate-100 rounded-lg p-2 border border-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-500 text-sm"
            >
              <option value="">Unassigned</option>
              {recruiters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Tags management */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-slate-100 mb-3 flex items-center gap-2 border-b border-slate-800 pb-2">
            <Tag size={18} className="text-pink-400" />
            Candidate Tags
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {tags.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No tags added yet.</span>
            ) : (
              tags.map((t) => (
                <span
                  key={t.id}
                  className="flex items-center gap-1 bg-violet-950/40 text-violet-400 px-2 py-1 rounded text-xs border border-violet-800/40"
                >
                  {t.tag_name}
                  <button
                    onClick={() => onRemoveTag(t.id)}
                    className="hover:text-pink-400 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))
            )}
          </div>
          <form onSubmit={handleTagSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder="Add Tag (e.g. Java)"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              disabled={loadingTag}
              className="flex-1 bg-slate-950 text-slate-100 rounded-lg px-3 py-1.5 border border-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={loadingTag}
              className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg p-1.5 border border-violet-500/30 transition-colors flex items-center justify-center"
            >
              <Plus size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
