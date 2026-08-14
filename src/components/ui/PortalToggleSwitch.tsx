// src/components/ui/PortalToggleSwitch.tsx
"use client";
import React from "react";
import { Pause, Play, Loader2 } from "lucide-react";

interface PortalToggleSwitchProps {
  isPaused: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export function PortalToggleSwitch({
  isPaused,
  onToggle,
  disabled = false,
  size = "md",
  showLabel = true
}: PortalToggleSwitchProps) {
  const isSm = size === "sm";
  const isLg = size === "lg";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={isPaused ? "Portal is Paused. Click to turn ON (Resume & catch-up sync)" : "Portal is Active. Click to turn OFF (Pause all background operations)"}
      className={`relative inline-flex items-center rounded-full transition-all duration-300 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border shadow-xs ${
        isSm ? "h-6 px-1 min-w-[76px]" : isLg ? "h-9 px-1.5 min-w-[128px]" : "h-7 px-1 min-w-[96px]"
      } ${
        isPaused
          ? "bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:border-amber-500/60"
          : "bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/60"
      } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      {/* Label text inside track */}
      {showLabel && (
        <span
          className={`flex items-center gap-1 font-extrabold tracking-wide uppercase transition-all duration-300 ${
            isSm ? "text-[9px]" : isLg ? "text-[12px]" : "text-[10px]"
          } ${isPaused ? "pl-2 pr-6" : "pl-6 pr-2"}`}
        >
          {isPaused ? (
            <>
              <Pause className={`${isSm ? "h-2.5 w-2.5" : "h-3 w-3"} text-amber-600 dark:text-amber-400`} />
              <span>Paused</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Active</span>
            </>
          )}
        </span>
      )}

      {/* Sliding Knob */}
      <span
        className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-md transition-all duration-300 flex items-center justify-center font-bold border ${
          isSm ? "h-4.5 w-4.5" : isLg ? "h-7 w-7" : "h-5 w-5"
        } ${
          isPaused
            ? "right-1 bg-amber-500 text-white border-amber-600 shadow-amber-500/30"
            : "left-1 bg-emerald-500 text-white border-emerald-600 shadow-emerald-500/30"
        }`}
      >
        {disabled ? (
          <Loader2 className={`${isSm ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} animate-spin text-white`} />
        ) : isPaused ? (
          <Play className={`${isSm ? "h-2 w-2" : "h-3 w-3"} text-white fill-white ml-0.5`} />
        ) : (
          <Pause className={`${isSm ? "h-2 w-2" : "h-3 w-3"} text-white fill-white`} />
        )}
      </span>
    </button>
  );
}
