// src/hooks/useCandidates.ts
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Candidate } from "../types/index";
import { inferCandidateRole, isGenericRoleTitle } from "../lib/roleInference";

export interface CandidateStats {
  totalApplicants: number;
  totalRecords: number;
  screened: number;
  assessmentPassed?: number;
  shortlisted: number;
  rejected: number;
  interviewsScheduled: number;
  candidatesSelected: number;
}

export function useCandidates(isLoggedIn?: boolean) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [stats, setStats] = useState<CandidateStats>({
    totalApplicants: 0,
    totalRecords: 0,
    screened: 0,
    shortlisted: 0,
    rejected: 0,
    interviewsScheduled: 0,
    candidatesSelected: 0
  });
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState("all");
  const [expFilter, setExpFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  const [isAssessmentSubmitting, setIsAssessmentSubmitting] = useState(false);
  const [isInterviewSubmitting, setIsInterviewSubmitting] = useState(false);
  const [isOnboardingSubmitting, setIsOnboardingSubmitting] = useState(false);

  const [assessmentScoreInput, setAssessmentScoreInput] = useState(85);
  const [interviewFeedbackInput, setInterviewFeedbackInput] = useState("");

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://api.risonaitech.com/api";

  const loadCandidates = useCallback(async () => {
    try {
      const [resp, statsResp] = await Promise.all([
        fetch(`${apiBase}/candidates?limit=200`, { credentials: "include" }),
        fetch(`${apiBase}/candidates/stats`, { credentials: "include" }).catch(() => null)
      ]);

      if (statsResp && statsResp.ok) {
        const statsData = await statsResp.json();
        if (statsData && statsData.success && statsData.stats) {
          setStats(statsData.stats);
        }
      }

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.candidates)) {
          // Normalize backend mapping
          const mapped: Candidate[] = data.candidates.map((c: any) => {
            const rawName = (c.name || "").trim();
            const rawEmail = (c.email || "").trim();

            const isJunkNameStr = !rawName || /candidate name not found|name not found|not found|unknown candidate|unknown/i.test(rawName);
            const isJunkEmailStr = !rawEmail || /not found|not_found|unknown/i.test(rawEmail);

            const cleanEmail = isJunkEmailStr ? "" : rawEmail;
            const fallbackNameFromEmail = cleanEmail.includes("@") ? cleanEmail.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()) : "";
            const cleanName = isJunkNameStr ? (fallbackNameFromEmail || "Candidate") : rawName;

            const candSkills = Array.isArray(c.skills) ? c.skills : [];
            const candMatchedSkills = Array.isArray(c.matched_skills) ? c.matched_skills : [];
            const finalMatchedSkills = candMatchedSkills.length > 0 ? candMatchedSkills : candSkills.slice(0, 5);

            const cleanRole = !isGenericRoleTitle(c.role)
              ? c.role
              : inferCandidateRole({ skills: candSkills, experienceYears: c.experience_years, name: cleanName, role: c.role });
            const cleanJobTitle = (c.job_title && !isGenericRoleTitle(c.job_title)) ? c.job_title : cleanRole;
            const cleanJobLocation = (c.job_location && !/not specified/i.test(c.job_location) && c.job_location !== "null") ? c.job_location : undefined;

            return {
              id: c.id,
              name: cleanName,
              role: cleanRole,
              score: c.score,
              matchPercent: c.match_percent,
              experienceYears: c.experience_years,
              experienceMatch: c.experience_match,
              recommendation: c.recommendation,
              confidence: c.confidence || "90% (High)",
              riskLevel: c.risk_level || "Low",
              strengths: c.strengths || [],
              weaknesses: c.weaknesses || [],
              missingSkills: c.missing_skills || [],
              matchedSkills: finalMatchedSkills,
              skills: candSkills,
              certifications: c.certifications || [],
              projects: c.projects || [],
              keywords: c.keywords || [],
              riskFactors: c.risk_factors || [],
              status: c.status,
              education: c.education,
              email: cleanEmail,
              phone: c.phone,
              appliedDate: c.applied_date,
              applicationSource: c.application_source,
              assessmentScore: c.assessment_score,
              assessmentStatus: c.assessment_status,
              interviewScheduledDate: c.interview_scheduled_date,
              interviewFeedback: c.interview_feedback,
              kekaStatus: c.keka_status,
              assessmentToken: c.assessment_token,
              assessmentCompletedAt: c.assessment_completed_at,
              finalScore: c.final_score,
              violationCount: c.violation_count,
              activityLogs: c.activityLogs || [],
              jobCode: c.job_code || undefined,
              jobTitle: cleanJobTitle,
              jobLocation: cleanJobLocation
            };
          });
          setCandidates(mapped);
          setFetchError(null);
          setSelectedCandidate(prev => {
            if (!prev) return null;
            const match = mapped.find(c => c.id === prev.id);
            return match || prev;
          });
        }
      } else {
        setFetchError("Failed to load candidates from server.");
      }
    } catch (e) {
      console.error("Failed to fetch candidates from backend:", e);
      setFetchError("Network error loading candidates.");
    } finally {
      setIsLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadCandidates();
    const interval = setInterval(() => {
      loadCandidates();
    }, 10000); // 10s production-safe refresh interval
    return () => clearInterval(interval);
  }, [loadCandidates]);

  const handleAssessmentSubmit = async (id: string, score: number) => {
    setIsAssessmentSubmitting(true);
    const toastId = toast.loading("AI evaluating assessment test results...");

    const previousCandidates = [...candidates];
    const previousSelectedCandidate = selectedCandidate;

    try {
      const resp = await fetch(`${apiBase}/candidates/${id}/submit-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
        credentials: "include"
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              return {
                ...c,
                status: data.status,
                kekaStatus: data.kekaStatus,
                assessmentStatus: data.assessmentStatus,
                assessmentScore: data.assessmentScore,
                interviewScheduledDate: data.interviewScheduledDate,
                activityLogs: data.activityLogs || c.activityLogs
              };
            }
            return c;
          }));
          toast.success(score >= 70 ? "Candidate passed assessment! HR Interview scheduled." : "Candidate failed assessment. Moved to Keka Rejected Pool.", { id: toastId });
          setTimeout(() => {
            setCandidates(prev => {
              const match = prev.find(c => c.id === id);
              if (match) setSelectedCandidate(match);
              return prev;
            });
          }, 100);
          return;
        }
      }
      throw new Error("Assessment submission failed on backend");
    } catch (e) {
      console.error("Backend assessment submit failed:", e);
      setCandidates(previousCandidates);
      setSelectedCandidate(previousSelectedCandidate);
      toast.error("Assessment submission failed. Please try again.", { id: toastId });
    } finally {
      setIsAssessmentSubmitting(false);
    }
  };

  const handleInterviewSubmit = async (id: string, decision: "pass" | "fail", feedback: string) => {
    setIsInterviewSubmitting(true);
    const toastId = toast.loading("Submitting interview evaluation...");

    const previousCandidates = [...candidates];
    const previousSelectedCandidate = selectedCandidate;

    try {
      const resp = await fetch(`${apiBase}/candidates/${id}/submit-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, feedback }),
        credentials: "include"
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              return { ...c, status: data.status, kekaStatus: data.kekaStatus, interviewFeedback: feedback, activityLogs: data.activityLogs || c.activityLogs };
            }
            return c;
          }));
          toast.success(decision === "pass" ? "Candidate approved! Moved to Selection." : "Candidate rejected. Moved to Keka Rejected Pool.", { id: toastId });
          setInterviewFeedbackInput("");
          setTimeout(() => {
            setCandidates(prev => {
              const match = prev.find(c => c.id === id);
              if (match) setSelectedCandidate(match);
              return prev;
            });
          }, 100);
          return;
        }
      }
      throw new Error("Interview submit failed on backend");
    } catch (e) {
      console.error("Backend interview submit failed:", e);
      setCandidates(previousCandidates);
      setSelectedCandidate(previousSelectedCandidate);
      toast.error("Interview evaluation failed to save. Please try again.", { id: toastId });
    } finally {
      setIsInterviewSubmitting(false);
    }
  };

  const handleOnboardSubmit = async (id: string) => {
    setIsOnboardingSubmitting(true);
    const toastId = toast.loading("Initiating onboarding workflow in Keka HRMS...");

    const previousCandidates = [...candidates];
    const previousSelectedCandidate = selectedCandidate;

    try {
      const resp = await fetch(`${apiBase}/candidates/${id}/onboard`, {
        method: "POST",
        credentials: "include"
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              return { ...c, status: data.status, kekaStatus: data.kekaStatus, activityLogs: data.activityLogs || c.activityLogs };
            }
            return c;
          }));
          toast.success("Candidate onboarding initiated successfully in Keka HRMS!", { id: toastId });
          setTimeout(() => {
            setCandidates(prev => {
              const match = prev.find(c => c.id === id);
              if (match) setSelectedCandidate(match);
              return prev;
            });
          }, 100);
          return;
        }
      }
      throw new Error("Onboard failed on backend");
    } catch (e) {
      console.error("Backend onboarding submit failed:", e);
      setCandidates(previousCandidates);
      setSelectedCandidate(previousSelectedCandidate);
      toast.error("Onboarding initiation failed. Please try again.", { id: toastId });
    } finally {
      setIsOnboardingSubmitting(false);
    }
  };

  const handleDeleteCandidate = async (id: string) => {
    const previousCandidates = [...candidates];
    const previousSelectedCandidate = selectedCandidate;

    // Optimistic Update
    setCandidates(prev => prev.filter(c => c.id !== id));
    if (selectedCandidate?.id === id) {
      setSelectedCandidate(prev => {
        const remaining = candidates.filter(c => c.id !== id);
        return remaining.length > 0 ? remaining[0] : null;
      });
    }
    toast.success("Candidate profile removed.");

    try {
      const resp = await fetch(`${apiBase}/candidates/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!resp.ok) {
        throw new Error("Delete failed on server");
      }
    } catch (e) {
      console.warn("Failed to delete candidate from backend database, rolling back:", e);
      setCandidates(previousCandidates);
      setSelectedCandidate(previousSelectedCandidate);
      toast.error("Failed to delete candidate profile from server. Rolled back.");
    }
  };

  const handleDecision = async (id: string, newStatus: string) => {
    // Optimistic update in UI immediately
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
    if (selectedCandidate?.id === id) {
      setSelectedCandidate(prev => prev ? { ...prev, status: newStatus } : null);
    }

    try {
      const resp = await fetch(`${apiBase}/candidates/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: newStatus }),
        credentials: "include"
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          // Update activity logs
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: data.logMessage || `Status changed to ${newStatus}` }];
              return { ...c, status: data.status, activityLogs: updatedLogs };
            }
            return c;
          }));
          if (selectedCandidate?.id === id) {
            setSelectedCandidate(prev => prev ? { ...prev, status: data.status } : null);
          }

          const statusLabel = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
          if (data.emailSent) {
            toast.success(`Candidate ${statusLabel}. Notification email sent.`);
          } else {
            toast.success(`Candidate ${statusLabel}. Updated in database.`);
          }
          return;
        }
      }
      // Non-ok response fallback
      toast.warning(`Candidate status updated locally. Backend sync may have failed.`);
    } catch (e) {
      console.error("Backend decision call failed, rolling back:", e);
      // Rollback optimistic update
      setCandidates(prev => prev.map(c => {
        const original = candidates.find(oc => oc.id === c.id);
        return original || c;
      }));
      toast.error("Failed to update candidate status. Please try again.");
    }
  };

  // Filtered Candidates
  const filteredCandidates = useMemo(() => {
    return candidates.filter(candidate => {
      const nameMatch = candidate.name.toLowerCase().includes(searchQuery.toLowerCase());
      const roleSearchMatch = candidate.role.toLowerCase().includes(searchQuery.toLowerCase());
      const jobTitleMatch = (candidate.jobTitle || "").toLowerCase().includes(searchQuery.toLowerCase());
      const jobLocMatch = (candidate.jobLocation || "").toLowerCase().includes(searchQuery.toLowerCase());
      const searchMatch = nameMatch || roleSearchMatch || jobTitleMatch || jobLocMatch;

      let scoreMatch = true;
      if (scoreFilter === "high") scoreMatch = candidate.score >= 85;
      else if (scoreFilter === "mid") scoreMatch = candidate.score >= 70 && candidate.score < 85;
      else if (scoreFilter === "low") scoreMatch = candidate.score < 70;

      let statusMatch = true;
      if (statusFilter !== "all") {
        const s = (candidate.status || "").toLowerCase();
        const sf = statusFilter.toLowerCase();
        if (sf === "rejected") {
          statusMatch = ["rejected", "keka_rejected"].includes(s);
        } else if (sf === "interviewing") {
          statusMatch = ["interviewing", "interview_scheduled", "interview"].includes(s);
        } else if (sf === "shortlisted") {
          statusMatch = ["shortlisted", "qualified", "assessment"].includes(s);
        } else if (sf === "review" || sf === "hold") {
          statusMatch = ["review", "under_review", "under review", "hold"].includes(s);
        } else if (sf === "talent_pool") {
          statusMatch = ["talent_pool", "talent pool"].includes(s);
        } else {
          statusMatch = s === sf;
        }
      }

      let assessmentMatch = true;
      if (assessmentStatusFilter !== "all") {
        assessmentMatch = candidate.assessmentStatus === assessmentStatusFilter;
      }

      let expMatch = true;
      if (expFilter !== "all") {
        if (expFilter === "senior") expMatch = candidate.experienceYears >= 5;
        else if (expFilter === "mid") expMatch = candidate.experienceYears >= 2 && candidate.experienceYears < 5;
        else if (expFilter === "junior") expMatch = candidate.experienceYears < 2;
      }

      let roleFilterMatch = true;
      if (roleFilter !== "all") {
        roleFilterMatch = (candidate.jobTitle || candidate.role) === roleFilter;
      }

      return searchMatch && scoreMatch && statusMatch && assessmentMatch && expMatch && roleFilterMatch;
    });
  }, [candidates, searchQuery, scoreFilter, statusFilter, assessmentStatusFilter, expFilter, roleFilter]);

  const [isRemapping, setIsRemapping] = useState(false);

  const remapRoles = useCallback(async () => {
    setIsRemapping(true);
    try {
      const resp = await fetch(`${apiBase}/candidates/remap-roles`, {
        method: "POST",
        credentials: "include"
      });
      if (resp.ok) {
        const data = await resp.json();
        toast.success(data.message || "Candidate job roles remapped successfully.");
        await loadCandidates();
      } else {
        toast.error("Failed to remap candidate job roles.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error remapping job roles.");
    } finally {
      setIsRemapping(false);
    }
  }, [apiBase, loadCandidates]);

  return {
    candidates,
    setCandidates,
    stats,
    isLoading,
    fetchError,
    selectedCandidate,
    setSelectedCandidate,
    searchQuery,
    setSearchQuery,
    scoreFilter,
    setScoreFilter,
    statusFilter,
    setStatusFilter,
    assessmentStatusFilter,
    setAssessmentStatusFilter,
    expFilter,
    setExpFilter,
    roleFilter,
    setRoleFilter,
    isAssessmentSubmitting,
    isInterviewSubmitting,
    isOnboardingSubmitting,
    isRemapping,
    remapRoles,
    assessmentScoreInput,
    setAssessmentScoreInput,
    interviewFeedbackInput,
    setInterviewFeedbackInput,
    handleAssessmentSubmit,
    handleInterviewSubmit,
    handleOnboardSubmit,
    handleDeleteCandidate,
    handleDecision,
    filteredCandidates,
    loadCandidates
  };
}
