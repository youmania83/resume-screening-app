"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ShieldAlert, 
  User, 
  Mail, 
  Phone, 
  Lock, 
  Sparkles, 
  BookOpen, 
  Clock,
  ArrowRight
} from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { toast, Toaster } from "sonner";

export default function PublicAssessmentRegistrationPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  
  // Form input states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  // Force light theme for consistency
  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.remove("dark");
  }, []);

  // Fetch job details on load
  useEffect(() => {
    if (!jobId) return;

    const loadJobDetails = async () => {
      try {
        const resp = await fetch(`${apiBase}/assessment/job-info/${jobId}`);
        if (!resp.ok) {
          const errData = await resp.json();
          throw new Error(errData.error || "Failed to load job details.");
        }
        const data = await resp.json();
        setJobTitle(data.title);
        setLoading(false);
      } catch (err: any) {
        setError(err.message || "Invalid or expired assessment link.");
        setLoading(false);
      }
    };

    loadJobDetails();
  }, [jobId, apiBase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim()) {
      toast.error("Please fill in both your Name and Email Address.");
      return;
    }

    setSubmitting(true);
    toast.loading("Generating secure assessment session...", { id: "register-loader" });

    try {
      const resp = await fetch(`${apiBase}/assessment/public-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || undefined
        })
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || "Failed to register candidate.");
      }

      const data = await resp.json();
      
      if (data.token) {
        // Clear any old session storage to prevent mismatch conflicts
        sessionStorage.removeItem("assessment_session_id");
        
        toast.success(data.message || "Registration successful! Loading test...", { id: "register-loader" });
        
        // Redirect directly to the assessment session
        router.push(`/assessment/${data.token}`);
      } else {
        throw new Error("Invalid registration response from server.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to register.", { id: "register-loader" });
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-slate-800" />
          <p className="text-sm text-muted-foreground font-semibold tracking-wide">Initializing registration portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground px-4">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-xl p-8 text-center space-y-6 shadow-xl">
          <div className="h-14 w-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto text-red-600">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-foreground tracking-tight">Access Restricted</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{error}</p>
          </div>
          <div className="text-xs text-slate-400 border-t border-border pt-4">
            If you believe this is a mistake, please contact the recruitment team.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8 select-none">
      <Toaster position="top-right" theme="light" closeButton />
      
      <div className="max-w-lg w-full mx-auto space-y-6">
        {/* Header / Brand */}
        <div className="text-center space-y-2">
          <div className="h-12 w-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Techsole Engineers Screening</h1>
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Candidate Assessment Portal</p>
        </div>

        {/* Main Card */}
        <div className="bg-white border border-border rounded-2xl p-6 sm:p-8 shadow-xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-slate-900 to-slate-700" />
          
          <div className="space-y-2">
            <Badge variant="outline" className="text-[10px] font-extrabold tracking-wider uppercase bg-background border-border text-muted-foreground">
              Technical Assessment Invitation
            </Badge>
            <h2 className="text-xl font-bold text-foreground tracking-tight">
              {jobTitle}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enter your registration details below to start your timed technical assessment.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name Input */}
            <div className="space-y-1.5">
              <label htmlFor="name" className="text-xs font-bold text-slate-750 block">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User className="h-4 w-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  id="name"
                  type="text"
                  required
                  disabled={submitting}
                  placeholder="e.g. John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-lg pl-10 pr-4 py-3 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-medium transition-all"
                />
              </div>
            </div>

            {/* Email Input */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-bold text-slate-750 block">
                Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  id="email"
                  type="email"
                  required
                  disabled={submitting}
                  placeholder="e.g. john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-lg pl-10 pr-4 py-3 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-medium transition-all"
                />
              </div>
            </div>

            {/* Phone Input */}
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-xs font-bold text-slate-750 block">
                Phone Number <span className="text-slate-400 font-medium">(Optional)</span>
              </label>
              <div className="relative">
                <Phone className="h-4 w-4 text-slate-400 absolute left-3 top-3.5" />
                <input
                  id="phone"
                  type="tel"
                  disabled={submitting}
                  placeholder="e.g. +1 (555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-background/50 border border-border rounded-lg pl-10 pr-4 py-3 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-medium transition-all"
                />
              </div>
            </div>

            {/* Details Grid info */}
            <div className="grid grid-cols-2 gap-3 bg-background border border-border rounded-xl p-4 text-xs select-none">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="font-bold text-foreground block leading-none">15 Minutes</span>
                  <span className="text-[10px] text-muted-foreground font-semibold block mt-0.5">Test duration</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="font-bold text-foreground block leading-none">10 MCQs</span>
                  <span className="text-[10px] text-muted-foreground font-semibold block mt-0.5">Multiple Choice</span>
                </div>
              </div>
            </div>

            {/* Action button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              Start Assessment <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Security / System status footer */}
        <div className="text-center text-[10px] text-slate-400 flex items-center justify-center gap-1">
          <Sparkles className="h-3 w-3 text-amber-500" />
          Mobile, desktop and tablet support active. Bounded to one active session at a time.
        </div>
      </div>
    </div>
  );
}
