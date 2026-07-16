// src/hooks/useCandidates.ts
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { Candidate } from "../types/index";
import { INITIAL_CANDIDATES } from "../lib/mockData";

export function useCandidates(isLoggedIn?: boolean) {
  const [candidates, setCandidates] = useState<Candidate[]>(INITIAL_CANDIDATES);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(INITIAL_CANDIDATES[0]);
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

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  const loadCandidates = useCallback(async () => {
    try {
      const resp = await fetch(`${apiBase}/candidates`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success && Array.isArray(data.candidates)) {
          // Normalize backend mapping
          const mapped: Candidate[] = data.candidates.map((c: any) => ({
            id: c.id,
            name: c.name,
            role: c.role,
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
            matchedSkills: c.matched_skills || [],
            skills: c.skills || [],
            certifications: c.certifications || [],
            projects: c.projects || [],
            keywords: c.keywords || [],
            riskFactors: c.risk_factors || [],
            status: c.status,
            education: c.education,
            email: c.email,
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
            jobTitle: c.job_title || undefined,
            jobLocation: c.job_location || undefined
          }));
          setCandidates(mapped);
          if (mapped.length > 0) {
            setSelectedCandidate(mapped[0]);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to fetch candidates from backend, using mocks:", e);
    }
  }, [apiBase]);

  useEffect(() => {
    if (isLoggedIn) {
      loadCandidates();
    }
  }, [loadCandidates, isLoggedIn]);

  const handleAssessmentSubmit = async (id: string, score: number) => {
    setIsAssessmentSubmitting(true);
    const toastId = toast.loading("AI evaluating assessment test results...");

    const previousCandidates = [...candidates];
    const previousSelectedCandidate = selectedCandidate;

    // Local Fallback Simulation values for optimistic update
    const status = score >= 70 ? "interviewing" : "rejected";
    const kekaStatus = score >= 70 ? "active" : "rejected_pool";
    const assessmentStatus = score >= 70 ? "passed" : "failed";
    const date = new Date();
    date.setDate(date.getDate() + 2);
    const interviewScheduledDate = score >= 70 ? date.toISOString() : null;
    const logMessage = score >= 70 
      ? `Candidate passed assessment with score ${score}/100. HR Interview scheduled.` 
      : `Candidate failed assessment with score ${score}/100. Moved to Rejected Pool in Keka HRMS.`;

    // Optimistically update candidate in UI
    setCandidates(prev => prev.map(c => {
      if (c.id === id) {
        const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: logMessage }];
        return {
          ...c,
          status,
          kekaStatus,
          assessmentStatus,
          assessmentScore: score,
          interviewScheduledDate,
          activityLogs: updatedLogs
        };
      }
      return c;
    }));

    setTimeout(() => {
      setCandidates(prev => {
        const match = prev.find(c => c.id === id);
        if (match) setSelectedCandidate(match);
        return prev;
      });
    }, 100);

    try {
      const resp = await fetch(`${apiBase}/candidates/${id}/submit-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: data.logMessage }];
              return {
                ...c,
                status: data.status,
                kekaStatus: data.kekaStatus,
                assessmentStatus: data.assessmentStatus,
                assessmentScore: data.assessmentScore,
                interviewScheduledDate: data.interviewScheduledDate,
                activityLogs: updatedLogs
              };
            }
            return c;
          }));
          toast.success(score >= 70 ? "Candidate passed assessment! HR Interview scheduled." : "Candidate failed assessment. Moved to Keka Rejected Pool.", { id: toastId });
          setIsAssessmentSubmitting(false);
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
      console.warn("Backend assessment submit failed, keeping local simulation:", e);
      toast.success(score >= 70 ? "Candidate passed! Scheduled interview (local fallback)." : "Candidate failed (local fallback).", { id: toastId });
      setIsAssessmentSubmitting(false);
    }
  };

  const handleInterviewSubmit = async (id: string, decision: "pass" | "fail", feedback: string) => {
    setIsInterviewSubmitting(true);
    const toastId = toast.loading("Submitting interview evaluation...");

    const previousCandidates = [...candidates];
    const previousSelectedCandidate = selectedCandidate;

    const status = decision === "pass" ? "selected" : "rejected";
    const kekaStatus = decision === "pass" ? "active" : "rejected_pool";
    const logMessage = decision === "pass" 
      ? `HR Interview passed. Feedback: "${feedback}". Moved to Final Selection.` 
      : `Candidate rejected in HR Interview. Feedback: "${feedback}". Moved to Keka Rejected Pool.`;

    // Optimistically update candidate in UI
    setCandidates(prev => prev.map(c => {
      if (c.id === id) {
        const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: logMessage }];
        return { ...c, status, kekaStatus, interviewFeedback: feedback, activityLogs: updatedLogs };
      }
      return c;
    }));

    setTimeout(() => {
      setCandidates(prev => {
        const match = prev.find(c => c.id === id);
        if (match) setSelectedCandidate(match);
        return prev;
      });
    }, 100);

    try {
      const resp = await fetch(`${apiBase}/candidates/${id}/submit-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, feedback })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: data.logMessage }];
              return { ...c, status: data.status, kekaStatus: data.kekaStatus, interviewFeedback: feedback, activityLogs: updatedLogs };
            }
            return c;
          }));
          toast.success(decision === "pass" ? "Candidate approved! Moved to Selection." : "Candidate rejected. Moved to Keka Rejected Pool.", { id: toastId });
          setIsInterviewSubmitting(false);
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
      console.warn("Backend interview submit failed, keeping local simulation:", e);
      toast.success(decision === "pass" ? "Interview passed (local fallback)!" : "Interview failed (local fallback).", { id: toastId });
      setIsInterviewSubmitting(false);
      setInterviewFeedbackInput("");
    }
  };

  const handleOnboardSubmit = async (id: string) => {
    setIsOnboardingSubmitting(true);
    const toastId = toast.loading("Initiating onboarding workflow in Keka HRMS...");

    const previousCandidates = [...candidates];
    const previousSelectedCandidate = selectedCandidate;

    // Optimistically update candidate in UI
    setCandidates(prev => prev.map(c => {
      if (c.id === id) {
        const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: "Initiating onboarding in Keka HRMS..." }];
        return { ...c, status: "onboarded", kekaStatus: "active", activityLogs: updatedLogs };
      }
      return c;
    }));

    setTimeout(() => {
      setCandidates(prev => {
        const match = prev.find(c => c.id === id);
        if (match) setSelectedCandidate(match);
        return prev;
      });
    }, 100);

    try {
      const resp = await fetch(`${apiBase}/candidates/${id}/onboard`, { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.success) {
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: data.logMessage }];
              return { ...c, status: data.status, kekaStatus: data.kekaStatus, activityLogs: updatedLogs };
            }
            return c;
          }));
          toast.success("Candidate onboarding initiated successfully in Keka HRMS!", { id: toastId });
          setIsOnboardingSubmitting(false);
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
      console.warn("Backend onboarding submit failed, keeping local simulation:", e);
      toast.success("Onboarding initiated (local fallback)!", { id: toastId });
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
      const resp = await fetch(`${apiBase}/candidates/${id}`, { method: "DELETE" });
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
        body: JSON.stringify({ decision: newStatus })
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
      console.warn("Backend decision call failed, keeping optimistic update:", e);
      toast.warning(`Candidate status updated locally. Backend sync failed.`);
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
        statusMatch = candidate.status.toLowerCase() === statusFilter.toLowerCase();
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

  return {
    candidates,
    setCandidates,
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
