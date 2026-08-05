"use client";

import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle } from "lucide-react";

export function TestingTimerBanner() {
  const [timeLeft, setTimeLeft] = useState<{
    hours: number;
    minutes: number;
    seconds: number;
    formattedDecimalHours: string;
    isExpired: boolean;
  }>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    formattedDecimalHours: "0.0",
    isExpired: false,
  });

  useEffect(() => {
    // Target time: Tomorrow (Aug 6, 2026) at 8:00 PM IST
    const targetDate = new Date("2026-08-06T20:00:00+05:30");

    const updateTimer = () => {
      const now = new Date();
      const diffMs = targetDate.getTime() - now.getTime();

      if (diffMs <= 0) {
        setTimeLeft({
          hours: 0,
          minutes: 0,
          seconds: 0,
          formattedDecimalHours: "0.0",
          isExpired: true,
        });
        return;
      }

      const totalHours = diffMs / (1000 * 60 * 60);
      const hours = Math.floor(totalHours);
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

      setTimeLeft({
        hours,
        minutes,
        seconds,
        formattedDecimalHours: totalHours.toFixed(1),
        isExpired: false,
      });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full bg-amber-500/15 dark:bg-amber-500/20 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-2.5 flex items-center justify-between shadow-xs select-none transition-all">
      <div className="flex items-center gap-3 mx-auto text-xs font-semibold sm:text-sm">
        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 animate-pulse flex-shrink-0">
          <AlertTriangle className="h-4 w-4" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Testing Phase Active:
          </span>
          {timeLeft.isExpired ? (
            <span className="font-bold text-red-600 dark:text-red-400">
              Testing period has ended (Stopped at 8:00 PM).
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span>Testing will stop in</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-600 dark:bg-amber-500 text-white font-mono font-bold text-xs sm:text-sm shadow-sm tracking-wide">
                <Clock className="h-3.5 w-3.5 animate-spin" style={{ animationDuration: "4s" }} />
                {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
              </span>
              <span className="hidden md:inline text-amber-800/80 dark:text-amber-300/80 text-xs">
                (~{timeLeft.formattedDecimalHours} hours left &bull; Tomorrow at 8:00 PM IST)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
