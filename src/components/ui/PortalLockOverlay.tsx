"use client";

import React, { useState, useEffect } from "react";
import { Lock, ShieldAlert, KeyRound, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function PortalLockOverlay({ children }: { children: React.ReactNode }) {
  const [isLocked, setIsLocked] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState("");
  const [isUnlockedByAdmin, setIsUnlockedByAdmin] = useState(false);

  useEffect(() => {
    // Check if admin previously unlocked in this browser session
    const unlocked = localStorage.getItem("ira_portal_unlocked");
    if (unlocked === "true") {
      setIsUnlockedByAdmin(true);
      return;
    }

    const checkLockStatus = () => {
      const targetDate = new Date("2026-08-06T20:00:00+05:30");
      const now = new Date();
      if (now >= targetDate && !isUnlockedByAdmin) {
        setIsLocked(true);
      } else {
        setIsLocked(false);
      }
    };

    checkLockStatus();
    const interval = setInterval(checkLockStatus, 2000);
    return () => clearInterval(interval);
  }, [isUnlockedByAdmin]);

  const handleAdminUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    // Passcode to unblock portal: TECHSOL2026 or IRA2026
    if (pin.trim().toUpperCase() === "TECHSOL2026" || pin.trim().toUpperCase() === "IRA2026") {
      localStorage.setItem("ira_portal_unlocked", "true");
      setIsUnlockedByAdmin(true);
      setIsLocked(false);
      toast.success("Portal successfully unlocked by Admin!");
    } else {
      toast.error("Invalid Admin Passcode! Access remains locked.");
    }
  };

  if (!isLocked) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4 font-sans text-slate-100 select-none">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
        {/* Glow backdrop effect */}
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="h-16 w-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-6 shadow-inner animate-pulse">
          <Lock className="h-8 w-8" />
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold tracking-wider uppercase mb-3 border border-amber-500/20">
          <ShieldAlert className="h-3.5 w-3.5" />
          Access Restricted
        </span>

        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
          Testing Period Concluded
        </h1>

        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6">
          The official testing window for <strong>Techsol Engineers Recruit Suite</strong> ended at{" "}
          <strong className="text-amber-300">8:00 PM IST on August 6, 2026</strong>.
          <br />
          All workstation modules, ATS features, and resume screening have been automatically locked.
        </p>

        <div className="w-full p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400 mb-6 space-y-1.5 text-left">
          <div className="flex items-center gap-2 text-slate-300 font-semibold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
            <span>Portal Lock Active</span>
          </div>
          <p className="text-[11px] text-slate-400 pl-6">
            Data remains secure. To request access extension or unlock the workstation, contact the workspace administrator.
          </p>
        </div>

        {!showPinInput ? (
          <button
            onClick={() => setShowPinInput(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
          >
            <KeyRound className="h-4 w-4 text-amber-400" />
            Admin Master Unlock
          </button>
        ) : (
          <form onSubmit={handleAdminUnlock} className="w-full space-y-3">
            <div className="relative">
              <input
                type="password"
                placeholder="Enter Admin Passcode"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-all text-center tracking-widest font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPinInput(false)}
                className="w-1/2 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-md"
              >
                Unlock
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
