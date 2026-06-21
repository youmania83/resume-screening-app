"use client";
import React from "react";
import { FileText, Download, Award, ShieldAlert, CheckCircle, XCircle, Brain } from "lucide-react";

interface ResumeTabProps {
  candidate: any;
  resumeDocument: any; // latest resume document version metadata
}

export default function ResumeTab({ candidate, resumeDocument }: ResumeTabProps) {
  const score = candidate.score || 0;

  // Helper to color AI risk levels
  const getRiskColor = (level: string) => {
    switch (level?.toLowerCase()) {
      case "high":
        return "text-rose-400 bg-rose-950/40 border-rose-800/40";
      case "medium":
        return "text-amber-400 bg-amber-950/40 border-amber-800/40";
      default:
        return "text-emerald-400 bg-emerald-950/40 border-emerald-800/40";
    }
  };

  return (
    <div className="space-y-6">
      {/* File Storage Metadata Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-violet-950/50 p-3 rounded-lg border border-violet-850 text-violet-400">
            <FileText size={24} />
          </div>
          <div>
            <h3 className="text-slate-100 font-semibold text-sm sm:text-base">
              {resumeDocument?.title || `${candidate.name} Resume`}
            </h3>
            <p className="text-xs text-slate-500 mt-1 truncate max-w-md">
              Storage: <span className="text-slate-400">{resumeDocument?.file_url || "S3 / Object Store (Simulated)"}</span>
            </p>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-1">
              <span>Version: <span className="text-slate-300 font-bold">v{resumeDocument?.version || 1}</span></span>
              <span>•</span>
              <span>Type: <span className="text-slate-300 font-bold">{resumeDocument?.document_type || "Resume"}</span></span>
            </div>
          </div>
        </div>
        {resumeDocument?.file_url && (
          <a
            href={resumeDocument.file_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-slate-950 hover:bg-slate-850 text-slate-300 hover:text-white px-4 py-2 rounded-lg border border-slate-800 text-xs font-semibold transition-colors"
          >
            <Download size={14} />
            Download Resume
          </a>
        )}
      </div>

      {/* AI Screening Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Core Stats Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <div>
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">AI Match Score</h3>
            <div className="flex items-end gap-2">
              <span className="text-5xl font-extrabold text-violet-400">{score}</span>
              <span className="text-slate-500 text-lg mb-1">/100</span>
            </div>
            <div className="w-full bg-slate-950 h-2.5 rounded-full border border-slate-850 mt-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-violet-600 to-indigo-500 h-full rounded-full"
                style={{ width: `${score}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4">
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold">Confidence</div>
              <div className="text-sm font-semibold text-slate-200">{candidate.confidence || "High"}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase font-bold">Risk Level</div>
              <div className={`text-xs font-semibold px-2 py-0.5 rounded border inline-block mt-1 ${getRiskColor(candidate.risk_level)}`}>
                {candidate.risk_level || "Low"}
              </div>
            </div>
          </div>

          {candidate.recommendation && (
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex gap-2">
              <Brain size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">AI Recommendation</div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{candidate.recommendation}</p>
              </div>
            </div>
          )}
        </div>

        {/* Matched vs Missing Skills Card */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Award size={18} className="text-violet-400" />
            Skills Analysis
          </h2>

          <div>
            <div className="text-xs text-emerald-400 font-bold mb-2 flex items-center gap-1.5">
              <CheckCircle size={14} />
              Matched Skills
            </div>
            <div className="flex flex-wrap gap-1.5">
              {candidate.matched_skills && candidate.matched_skills.length > 0 ? (
                candidate.matched_skills.map((s: string, idx: number) => (
                  <span key={idx} className="bg-emerald-950/30 text-emerald-400 px-2 py-0.5 rounded text-[11px] border border-emerald-800/30">
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500 italic">No exact skill matches identified.</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs text-rose-400 font-bold mb-2 flex items-center gap-1.5">
              <XCircle size={14} />
              Missing / Gap Skills
            </div>
            <div className="flex flex-wrap gap-1.5">
              {candidate.missing_skills && candidate.missing_skills.length > 0 ? (
                candidate.missing_skills.map((s: string, idx: number) => (
                  <span key={idx} className="bg-rose-950/30 text-rose-400 px-2 py-0.5 rounded text-[11px] border border-rose-800/30">
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500 italic">No major skill gaps found.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-1.5">
            <CheckCircle size={14} /> Key Strengths
          </h3>
          <ul className="space-y-2">
            {candidate.strengths && candidate.strengths.length > 0 ? (
              candidate.strengths.map((str: string, idx: number) => (
                <li key={idx} className="text-xs text-slate-350 bg-slate-950 p-2.5 rounded border border-slate-850">
                  {str}
                </li>
              ))
            ) : (
              <li className="text-xs text-slate-500 italic">No detailed strengths listed.</li>
            )}
          </ul>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400 mb-3 flex items-center gap-1.5">
            <ShieldAlert size={14} /> Risk Areas / Weaknesses
          </h3>
          <ul className="space-y-2">
            {candidate.weaknesses && candidate.weaknesses.length > 0 ? (
              candidate.weaknesses.map((w: string, idx: number) => (
                <li key={idx} className="text-xs text-slate-350 bg-slate-950 p-2.5 rounded border border-slate-850">
                  {w}
                </li>
              ))
            ) : (
              <li className="text-xs text-slate-500 italic">No specific risk areas listed.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
