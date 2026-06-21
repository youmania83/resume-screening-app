"use client";
import React, { useState, useEffect } from "react";
import { Sliders, CheckCircle, AlertCircle, Save } from "lucide-react";
import { toast } from "sonner";

export default function ScoringSettings() {
  const [weights, setWeights] = useState({
    skills: 30,
    experience: 25,
    industry: 15,
    education: 15,
    location: 15
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWeights();
  }, []);

  const loadWeights = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/scoring-weights");
      const data = await res.json();
      if (data.success && data.weights) {
        setWeights(data.weights);
      }
    } catch {
      toast.error("Failed to load scoring weights.");
    } finally {
      setLoading(false);
    }
  };

  const handleWeightChange = (key: keyof typeof weights, value: string) => {
    const numeric = parseInt(value || "0", 10);
    setWeights(prev => ({
      ...prev,
      [key]: isNaN(numeric) ? 0 : Math.max(0, Math.min(100, numeric))
    }));
  };

  const totalSum = weights.skills + weights.experience + weights.industry + weights.education + weights.location;
  const isValid = totalSum === 100;

  const handleSave = async () => {
    if (!isValid) {
      toast.error(`Weights total must be exactly 100%. Currently it is ${totalSum}%.`);
      return;
    }

    setSaving(true);
    const saveToast = toast.loading("Saving weights...");
    try {
      const res = await fetch("/api/inbox/scoring-weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weights })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Scoring weights saved successfully.", { id: saveToast });
      } else {
        toast.error("Failed to save weights.", { id: saveToast });
      }
    } catch {
      toast.error("Network error saving weights.", { id: saveToast });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center text-slate-500 italic">
        Loading weights configuration...
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6 max-w-xl">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="bg-violet-950/50 p-2.5 rounded-lg border border-violet-850 text-violet-400">
          <Sliders size={20} />
        </div>
        <div>
          <h2 className="text-slate-100 font-bold text-base">Match Score Weights Config</h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Configure how different resume areas contribute to the overall AI candidate match score.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {(Object.keys(weights) as Array<keyof typeof weights>).map((key) => (
          <div key={key} className="flex items-center justify-between gap-4 p-3 bg-slate-950 rounded-lg border border-slate-850">
            <div>
              <span className="text-xs font-bold text-slate-200 capitalize">{key} weight</span>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {key === "skills" && "Relevance of parsed skills compared to JD required skills."}
                {key === "experience" && "Match of candidate years of experience against job seniority level."}
                {key === "industry" && "Candidate's exposure to matching industry sectors."}
                {key === "education" && "Academic credentials and degree relevance fit."}
                {key === "location" && "Candidate commute proximity and remote work fit."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={weights[key]}
                onChange={(e) => handleWeightChange(key, e.target.value)}
                className="w-16 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-center text-xs text-slate-200 focus:outline-none focus:border-violet-500"
                min="0"
                max="100"
              />
              <span className="text-slate-500 text-xs font-semibold">%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Validation status info */}
      <div className={`p-4 rounded-lg border flex items-center gap-3 text-xs ${
        isValid 
          ? "bg-emerald-950/20 border-emerald-800/30 text-emerald-400" 
          : "bg-amber-950/20 border-amber-800/30 text-amber-400"
      }`}>
        {isValid ? (
          <>
            <CheckCircle size={16} className="flex-shrink-0" />
            <span>Sum is exactly 100%. Configuration is balanced and ready to save.</span>
          </>
        ) : (
          <>
            <AlertCircle size={16} className="flex-shrink-0 animate-pulse" />
            <span>
              Weights must sum up to exactly 100%. Current sum: <span className="font-bold">{totalSum}%</span>. Please adjust.
            </span>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={!isValid || saving}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-xs font-semibold shadow-md transition-colors"
        >
          <Save size={14} />
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}
