// src/hooks/useDashboardMetrics.ts
import { useState, useEffect } from "react";

export function useDashboardMetrics(candidatesCount: number) {
  const [activeTab, setActiveTab] = useState<
    "screening" | "dashboard" | "candidates" | "jobs" | "pipeline" | "analytics" | "settings" | "assessments" | "health"
  >("screening");
  const [isDark, setIsDark] = useState(false);
  const [credits, setCredits] = useState(480);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [mounted, setMounted] = useState(false);
  
  // Bulk upload tracking
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [screeningQueue, setScreeningQueue] = useState<any[]>([]);

  // Derived counts
  const totalScreenedCount = candidatesCount;
  const activeProcessingCount = Object.keys(uploadProgress).length + screeningQueue.length;

  useEffect(() => {
    setMounted(true);
    const savedCredits = localStorage.getItem("rison_ai_credits");
    if (savedCredits !== null) {
      setCredits(Number(savedCredits));
    }
    const savedWebhook = localStorage.getItem("rison_webhook_url");
    if (savedWebhook !== null) {
      setWebhookUrl(savedWebhook);
    }
    const savedDark = localStorage.getItem("rison_is_dark");
    if (savedDark !== null) {
      setIsDark(savedDark === "true");
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("rison_is_dark", String(isDark));
      if (isDark) {
        document.documentElement.classList.add("dark");
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.setAttribute("data-theme", "light");
      }
    }
  }, [isDark, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("rison_ai_credits", String(credits));
    }
  }, [credits, mounted]);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("rison_webhook_url", webhookUrl);
    }
  }, [webhookUrl, mounted]);

  return {
    activeTab,
    setActiveTab,
    isDark,
    setIsDark,
    credits,
    setCredits,
    webhookUrl,
    setWebhookUrl,
    mounted,
    uploadProgress,
    setUploadProgress,
    screeningQueue,
    setScreeningQueue,
    totalScreenedCount,
    activeProcessingCount
  };
}
