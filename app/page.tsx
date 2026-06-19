"use client"

import React, { useState, useEffect, useRef } from "react"
import { 
  Briefcase, 
  UploadCloud, 
  Users, 
  BarChart3, 
  Settings, 
  Sparkles, 
  Search, 
  FileText, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  TrendingUp, 
  UserCheck, 
  Clock, 
  User, 
  ShieldAlert, 
  Activity,
  ThumbsUp,
  ThumbsDown,
  Layers,
  Link2,
  FileDown,
  FileCheck2,
  Plus,
  Trash2,
  Edit2,
  Check,
  Building2,
  MapPin,
  Award
} from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"

// Import UI components
import { Button } from "@/src/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/src/components/ui/card"
import { Badge } from "@/src/components/ui/badge"
import { Progress } from "@/src/components/ui/progress"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/src/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table"

// Recharts components
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend, PieChart, Pie
} from "recharts"

// --- TYPES & INTERFACES ---
interface Candidate {
  id: string
  name: string
  role: string
  score: number
  matchPercent: number
  experienceYears: number
  experienceMatch: string
  recommendation: string
  confidence: string
  riskLevel: "Low" | "Medium" | "High"
  strengths: string[]
  weaknesses: string[]
  missingSkills: string[]
  matchedSkills: string[]
  skills?: string[]
  certifications?: string[]
  projects?: string[]
  keywords?: string[]
  riskFactors: string[]
  status: "applied" | "shortlisted" | "interviewing" | "hold" | "rejected" | "selected" | "onboarded" | "Qualified" | "Review" | "Rejected" | string
  education: string
  email: string
  phone: string
  appliedDate: string
  applicationSource?: "Keka HRMS" | "Careers Email" | "Careers Page" | string
  assessmentScore?: number
  assessmentStatus?: "pending" | "passed" | "failed" | null | string
  interviewScheduledDate?: string | null
  interviewFeedback?: string | null
  kekaStatus?: string
  assessmentToken?: string
  assessmentCompletedAt?: string
  finalScore?: number
  violationCount?: number
  activityLogs?: Array<{ date: string; message: string }>
}

interface StructuredJD {
  title: string
  experience: string
  department: string
  location: string
  requiredSkills: string[]
  preferredSkills: string[]
  education: string
  responsibilities: string[]
  keywords: string[]
  screeningCriteria: string[]
}

interface JobListItem {
  title: string
  dept: string
  loc: string
  exp: string
  candidates: number
  status: "Active" | "Closed"
  jd: StructuredJD
}

const INITIAL_SCM_JD: StructuredJD = {
  title: "SCM Executive",
  experience: "2-5 Years",
  department: "Operations",
  location: "Bengaluru, India",
  requiredSkills: ["Strategic Procurement", "Vendor Management", "SAP / ERP Systems", "Logistics Planning", "Cost Optimization"],
  preferredSkills: ["GST Compliance Audits", "SAP S/4HANA Module"],
  education: "B.Tech Mechanical Engineering with Supply Chain Certification",
  responsibilities: [
    "Negotiate pricing, terms, and contracts with raw material vendors.",
    "Operate SAP/ERP modules to manage purchase requisitions, orders, and receipts.",
    "Standardize inventory and optimize logistics turnaround times.",
    "Audit vendor performance metrics quarterly."
  ],
  keywords: ["SCM", "Procurement", "Logistics", "SAP", "Vendor Sourcing"],
  screeningCriteria: [
    "Has 2+ years of relevant SCM industrial procurement history.",
    "Demonstrates operational familiarity with SAP ERP purchase modules.",
    "Possesses documented cost optimization negotiation benchmarks."
  ]
}

const INITIAL_FRONTEND_JD: StructuredJD = {
  title: "Senior Frontend Engineer",
  experience: "5-8 Years",
  department: "Engineering",
  location: "San Francisco, CA (Hybrid)",
  requiredSkills: ["React / Next.js", "TypeScript", "Tailwind CSS", "CSS Modules", "Webpack / Turbopack"],
  preferredSkills: ["GraphQL Federation", "React Hook Form", "Node.js (BFF)"],
  education: "B.S. or M.S. in Computer Science or equivalent experience",
  responsibilities: [
    "Architect and build high-performance client-side SaaS applications.",
    "Lead integration of global component designs and styled components.",
    "Collaborate with Product and Design to deliver high-fidelity interfaces.",
    "Improve core web vitals and overall Largest Contentful Paint metrics."
  ],
  keywords: ["Frontend", "React", "Next.js", "TypeScript", "UX Architecture"],
  screeningCriteria: [
    "Has 5+ years building production-scale React SaaS platforms.",
    "Demonstrated expertise with CSS optimization and Tailwind.",
    "Possesses clear understanding of web vital performance bottlenecks."
  ]
}

const INITIAL_DEVOPS_JD: StructuredJD = {
  title: "DevOps Engineer",
  experience: "3-5 Years",
  department: "Engineering",
  location: "Remote, US",
  requiredSkills: ["AWS Infrastructure", "Terraform", "Docker Containers", "Bash Scripting", "GitHub Actions"],
  preferredSkills: ["Kubernetes (EKS)", "Prometheus & Grafana", "Argocd GitOps"],
  education: "B.S. in Computer Engineering or related field",
  responsibilities: [
    "Deploy, monitor, and scale cloud infrastructure on AWS.",
    "Manage infrastructure as code scripts using Terraform.",
    "Automate deployment and release pipelines (CI/CD).",
    "Ensure application logging and monitoring alerts are highly active."
  ],
  keywords: ["DevOps", "AWS", "Terraform", "Kubernetes", "CI/CD"],
  screeningCriteria: [
    "Has 3+ years managing production AWS environments.",
    "Proficient writing and maintaining Terraform codebases.",
    "Experienced with containerization and build pipelines."
  ]
}

const INITIAL_JOBS: JobListItem[] = [
  { title: "SCM Executive", dept: "Operations", loc: "Bengaluru, India", exp: "2-5 Yrs", candidates: 8, status: "Active", jd: INITIAL_SCM_JD },
  { title: "Senior Frontend Engineer", dept: "Engineering", loc: "San Francisco, CA (Hybrid)", exp: "5-8 Yrs", candidates: 14, status: "Active", jd: INITIAL_FRONTEND_JD },
  { title: "DevOps Engineer", dept: "Engineering", loc: "Remote, US", exp: "3-5 Yrs", candidates: 2, status: "Active", jd: INITIAL_DEVOPS_JD },
]

// --- INITIAL MOCK CANDIDATES ---
const INITIAL_CANDIDATES: Candidate[] = [
  {
    id: "cand-1",
    name: "Arjun Mehta",
    role: "SCM Executive",
    score: 88,
    matchPercent: 88,
    experienceYears: 6,
    experienceMatch: "6 years directly relevant experience in engineering/industrial procurement; strong SCM execution.",
    recommendation: "Highly suitable candidate with quantified cost savings and robust vendor negotiation history.",
    confidence: "94% (High)",
    riskLevel: "Low",
    strengths: [
      "6 years relevant experience in engineering/industrial procurement",
      "Quantified cost savings of 11% and 28% reduction in TAT",
      "Managed annual spend of 25 Crore and 150+ vendors"
    ],
    weaknesses: [
      "No explicit mention of GST/compliance documentation audits",
      "No recent certifications in SAP S/4HANA (uses older ERP modules)"
    ],
    missingSkills: ["GST Compliance Audits", "SAP S/4HANA Module"],
    matchedSkills: ["Strategic Procurement", "Vendor Management", "SAP / ERP Systems", "Logistics Planning", "Cost Optimization"],
    riskFactors: ["Familiarity only with legacy ERP systems, may require training for newer cloud modules."],
    status: "shortlisted",
    education: "B.Tech Mechanical Engineering with Supply Chain Certification",
    email: "arjun.mehta@techsol.com",
    phone: "+91 98765 43210",
    appliedDate: "2026-06-12"
  },
  {
    id: "cand-2",
    name: "Sarah Jenkins",
    role: "Senior Frontend Engineer",
    score: 94,
    matchPercent: 94,
    experienceYears: 7,
    experienceMatch: "7 years building complex SaaS dashboards; expert in React, Next.js, and design systems.",
    recommendation: "Exceptional frontend engineer. Very strong alignment with our technical stack and team values.",
    confidence: "98% (High)",
    riskLevel: "Low",
    strengths: [
      "Lead architect for core design system migration used by 40+ devs",
      "Deep expertise in React 19, TypeScript, and webpack/turbopack configs",
      "Proven track record of improving LCP core web vitals by 45%"
    ],
    weaknesses: [
      "No direct production experience with GraphQL federated architectures",
      "Limited exposure to Node.js backend development"
    ],
    missingSkills: ["GraphQL Federation", "Node.js REST APIs"],
    matchedSkills: ["React / Next.js", "TypeScript", "Tailwind CSS", "Web Performance", "Component Design", "Jest / Testing Library"],
    riskFactors: ["Primarily client-side focused; will need ramp-up on backend-for-frontend service layers."],
    status: "interviewing",
    education: "B.S. in Computer Science — Stanford University",
    email: "sarah.jenkins@example.com",
    phone: "+1 (555) 019-2834",
    appliedDate: "2026-06-14"
  },
  {
    id: "cand-3",
    name: "David Chen",
    role: "DevOps Engineer",
    score: 76,
    matchPercent: 78,
    experienceYears: 4,
    experienceMatch: "4 years experience managing AWS structures, cloud automation, and Kubernetes containers.",
    recommendation: "Strong mid-level engineer. Capable of handling standard CI/CD and deployment tasks.",
    confidence: "87% (Medium)",
    riskLevel: "Medium",
    strengths: [
      "Implemented fully automated CI/CD pipelines reducing releases from 2 hours to 6 minutes",
      "Proficient in Terraform scripting and AWS cloud infrastructure"
    ],
    weaknesses: [
      "Limited experience managing multi-region Kubernetes clusters in production",
      "Basic monitoring setup; lacks experience with advanced Prometheus alerts"
    ],
    missingSkills: ["Kubernetes Multi-Region", "Prometheus Metrics", "Grafana Dashboards"],
    matchedSkills: ["AWS Infrastructure", "Terraform", "GitHub Actions", "Docker Containers", "Bash Scripting"],
    riskFactors: ["Lack of enterprise-scale container orchestration experience may slow infrastructure scaling."],
    status: "applied",
    education: "B.S. in Computer Engineering — University of Washington",
    email: "david.chen@example.com",
    phone: "+1 (555) 482-9102",
    appliedDate: "2026-06-15"
  }
]

// --- ANALYTICS MOCK DATA ---
const VOLUME_DATA = [
  { name: "Mon", Volume: 12 },
  { name: "Tue", Volume: 19 },
  { name: "Wed", Volume: 32 },
  { name: "Thu", Volume: 24 },
  { name: "Fri", Volume: 45 },
  { name: "Sat", Volume: 15 },
  { name: "Sun", Volume: 8 },
]

const FUNNEL_DATA = [
  { name: "Resumes Uploaded", value: 185, fill: "#334155" },
  { name: "Passed Parser", value: 168, fill: "#475569" },
  { name: "Scored (Overall >50)", value: 114, fill: "#1e3a8a" },
  { name: "Shortlisted", value: 42, fill: "#047857" },
  { name: "Interview Invited", value: 18, fill: "#4f46e5" },
]

const PIE_DATA = [
  { name: "Shortlisted (>80)", value: 42, color: "#10b981" },
  { name: "Moderate Match (50-80)", value: 58, color: "#f59e0b" },
  { name: "Low Match (<50)", value: 14, color: "#ef4444" },
]

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"screening" | "dashboard" | "candidates" | "jobs" | "pipeline" | "analytics" | "settings" | "assessments">("screening")
  const [candidates, setCandidates] = useState<Candidate[]>(INITIAL_CANDIDATES)
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(INITIAL_CANDIDATES[0])
  const [isDark, setIsDark] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [credits, setCredits] = useState(480)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [scoreFilter, setScoreFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [assessmentStatusFilter, setAssessmentStatusFilter] = useState("all")
  const [expFilter, setExpFilter] = useState("all")
  const [roleFilter, setRoleFilter] = useState("all")

  // --- JOB DESCRIPTION IMPORT MODULE STATES ---
  const [importTab, setImportTab] = useState<"url" | "file" | "text">("url")
  const [importUrl, setImportUrl] = useState("")
  const [isExtracting, setIsExtracting] = useState(false)
  const [isIngesting, setIsIngesting] = useState(false)
  const [assessmentScoreInput, setAssessmentScoreInput] = useState(85)
  const [interviewFeedbackInput, setInterviewFeedbackInput] = useState("")
  const [isAssessmentSubmitting, setIsAssessmentSubmitting] = useState(false)
  const [isInterviewSubmitting, setIsInterviewSubmitting] = useState(false)
  const [isOnboardingSubmitting, setIsOnboardingSubmitting] = useState(false)
  const [jdFile, setJdFile] = useState<File | null>(null)
  const [jdTextPaste, setJdTextPaste] = useState("")

  // Active Structured JD State
  const [activeJD, setActiveJD] = useState<StructuredJD | null>(INITIAL_SCM_JD)
  const [jobs, setJobs] = useState<JobListItem[]>(INITIAL_JOBS)
  
  const [isEditingJD, setIsEditingJD] = useState(false)

  const saveOrUpdateJob = (jd: StructuredJD) => {
    setJobs(prev => {
      const existsIndex = prev.findIndex(j => j.title.toLowerCase() === jd.title.toLowerCase())
      if (existsIndex >= 0) {
        const updated = [...prev]
        updated[existsIndex] = {
          ...updated[existsIndex],
          title: jd.title,
          dept: jd.department || "Operations",
          loc: jd.location || "Remote",
          exp: jd.experience || "Not Specified",
          jd: jd
        }
        return updated
      } else {
        return [
          ...prev,
          {
            title: jd.title,
            dept: jd.department || "Operations",
            loc: jd.location || "Remote",
            exp: jd.experience || "Not Specified",
            candidates: 0,
            status: "Active",
            jd: jd
          }
        ]
      }
    })
  }

  // --- BULK RESUME UPLOAD STATES ---
  const [dragActive, setDragActive] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [screeningQueue, setScreeningQueue] = useState<any[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const jdFileInputRef = useRef<HTMLInputElement>(null)
  const [mounted, setMounted] = useState(false)

  const getConfidenceAndRisk = (score: number) => {
    let confidence = "90% (High)"
    let riskLevel: "Low" | "Medium" | "High" = "Low"
    let riskFactors: string[] = []
    let weaknesses: string[] = []
    let strengths: string[] = []
    let recommendation = ""

    if (score >= 85) {
      // Very High Match, High Confidence
      confidence = `${Math.floor(90 + (score - 85) * 0.5 + Math.random() * 3)}% (High)`
      riskLevel = "Low"
      riskFactors = ["Minimal risk. Candidate exceeds top requirements."]
      strengths = [
        "Exceeds core experience qualifications",
        "Aligned perfectly with the required tech stack",
        "Strong progression path and tenure history"
      ]
      weaknesses = ["No obvious matching deficiencies identified."]
      recommendation = "Strong candidate. Highly recommended for immediate shortlist and technical panel review."
    } else if (score >= 70) {
      // Good Match, Medium Confidence
      confidence = `${Math.floor(75 + (score - 70) * 0.8 + Math.random() * 4)}% (Medium)`
      riskLevel = "Medium"
      riskFactors = ["Some minor gaps in preferred tech modules or tools."]
      strengths = [
        "Meets all baseline experience benchmarks",
        "Demonstrated project delivery success"
      ]
      weaknesses = ["Missing some secondary skill credentials", "Lacks certifications for cloud modules"]
      recommendation = "Solid mid-level candidate. Recommended for initial recruiter screen to check domain depth."
    } else if (score >= 45) {
      // Borderline Match, Low/Medium Confidence
      confidence = `${Math.floor(55 + (score - 45) * 0.7 + Math.random() * 4)}% (Low)`
      riskLevel = "Medium"
      riskFactors = ["Borderline match. Candidate has partial overlap but lacks core hands-on domain experience."]
      strengths = ["Possesses some transferable skills or related educational background."]
      weaknesses = ["Significant gaps in primary technology stack", "Tenure contains multiple short-term contracts"]
      recommendation = "Borderline candidate. Recommend screening call only if other candidates are unavailable."
    } else {
      // Weak Match, High Confidence (High confidence that they are NOT a fit)
      confidence = `${Math.floor(88 + (45 - score) * 0.2 + Math.random() * 3)}% (High)`
      riskLevel = "High"
      riskFactors = ["High risk. Candidate does not meet core experience or tech requirements."]
      strengths = ["Has basic relevant exposure in related positions."]
      weaknesses = [
        "Significant gaps in required skills",
        "Years of experience below target threshold"
      ]
      recommendation = "Weak candidate. Consider holding or rejecting unless supplementary portfolio is provided."
    }

    return { confidence, riskLevel, riskFactors, weaknesses, strengths, recommendation }
  }


  // Sync Dark Mode class, data-theme, credits, and local candidates database
  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("rison_ai_credits")
    if (saved !== null) {
      setCredits(Number(saved))
    }
    const savedWebhook = localStorage.getItem("rison_webhook_url")
    if (savedWebhook !== null) {
      setWebhookUrl(savedWebhook)
    }
    const savedDark = localStorage.getItem("rison_is_dark")
    if (savedDark !== null) {
      setIsDark(savedDark === "true")
    }

    // Fetch candidates from database
    const loadCandidates = async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
        const resp = await fetch(`${apiBase}/candidates`)
        if (resp.ok) {
          const data = await resp.json()
          if (data && data.success && Array.isArray(data.candidates) && data.candidates.length > 0) {
            // Add fallback arrays if missing
            const cleanedCandidates = data.candidates.map((c: any) => ({
              ...c,
              activityLogs: c.activityLogs || [],
              riskFactors: c.riskFactors || [],
              strengths: c.strengths || [],
              weaknesses: c.weaknesses || [],
              missingSkills: c.missingSkills || [],
              matchedSkills: c.matchedSkills || [],
              skills: c.skills || [],
              certifications: c.certifications || [],
              projects: c.projects || [],
              keywords: c.keywords || []
            }))
            setCandidates(cleanedCandidates)
            setSelectedCandidate(cleanedCandidates[0])
            return
          }
        }
      } catch (err) {
        console.warn("Backend candidate load failed, using local storage fallback:", err)
      }

      const savedCandidates = localStorage.getItem("rison_ai_candidates")
      if (savedCandidates !== null) {
        try {
          const parsed = JSON.parse(savedCandidates)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCandidates(parsed)
            setSelectedCandidate(parsed[0])
          }
        } catch (e) {
          console.error("Failed to parse saved candidates:", e)
        }
      }
    };
    loadCandidates();
  }, [])

  useEffect(() => {
    localStorage.setItem("rison_ai_credits", String(credits))
  }, [credits])

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("rison_ai_candidates", JSON.stringify(candidates))
    }
  }, [candidates, mounted])

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("rison_webhook_url", webhookUrl)
    }
  }, [webhookUrl, mounted])

  useEffect(() => {
    const theme = isDark ? "dark" : "light"
    document.documentElement.dataset.theme = theme
    if (isDark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
    if (mounted) {
      localStorage.setItem("rison_is_dark", String(isDark))
    }
  }, [isDark, mounted])

  const renderRecruitmentTimeline = (c: Candidate) => {
    const isRejected = c.status === "rejected";
    const sourceName = c.applicationSource || "Careers Page";
    
    return (
      <div className="bg-secondary/40 p-3 rounded-lg border border-border/50 space-y-3">
        <div className="flex items-center justify-between border-b border-border/40 pb-1.5 mb-1">
          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Recruitment Funnel Progress</span>
          <Badge variant="outline" className={`text-[8.5px] font-bold uppercase tracking-wider px-2 py-0 border ${
            c.status === "rejected" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-950/20 dark:bg-red-950/10 dark:text-red-400" :
            c.status === "onboarded" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-950/20 dark:bg-emerald-950/10 dark:text-emerald-450" :
            "border-indigo-200 bg-indigo-50 text-indigo-650 dark:border-indigo-950/20 dark:bg-indigo-950/10 dark:text-indigo-400"
          }`}>
            {c.status === "shortlisted" ? "Assessment Invited" : c.status}
          </Badge>
        </div>
        
        <div className="relative border-l border-border pl-4.5 space-y-3.5 text-[11px] leading-tight select-none">
          
          {/* Step 1: Application Ingested */}
          <div className="relative">
            <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
            <div>
              <span className="font-bold text-foreground block">1. Ingested from {sourceName}</span>
              <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">Resume collected automatically via Ingestion Engine.</span>
            </div>
          </div>

          {/* Step 2: AI Parsing & Scoring */}
          <div className="relative">
            {isRejected && c.score < 70 ? (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 flex items-center justify-center text-[7px] text-white">✗</span>
            ) : (
              <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
            )}
            <div>
              <span className="font-bold text-foreground block">
                2. AI Parsing & JD Match Score: {c.score}/100
              </span>
              <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">
                {isRejected && c.score < 70 
                  ? "Rejected: Score below threshold (70%). Moved to Keka Rejected Pool."
                  : `Passed screening (Score >= 70%). Assessment invite sent.`
                }
              </span>
            </div>
          </div>

          {/* Step 3: Assessment Test */}
          {(!isRejected || c.score >= 70) && (
            <div className="relative">
              {c.status === "applied" ? (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-secondary border border-border dark:border-slate-700 flex items-center justify-center text-[7px] text-slate-400">•</span>
              ) : c.status === "shortlisted" ? (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-amber-500 flex items-center justify-center text-[7px] text-white animate-pulse">⌁</span>
              ) : isRejected && c.assessmentStatus === "failed" ? (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 flex items-center justify-center text-[7px] text-white">✗</span>
              ) : (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
              )}
              <div>
                <span className="font-bold text-foreground block">
                  3. Candidate Technical Assessment
                </span>
                <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">
                  {c.status === "shortlisted" 
                    ? "Pending candidate response. Invite email sent."
                    : c.assessmentStatus === "failed" 
                    ? `Failed: Score ${c.assessmentScore}/100 is < 70. Moved to Keka Rejected Pool.`
                    : c.assessmentStatus === "passed"
                    ? `Passed: Score ${c.assessmentScore}/100. Moved to Interview Scheduling.`
                    : "Pending."
                  }
                </span>
              </div>
            </div>
          )}

          {/* Step 4: HR Interview Round */}
          {(!isRejected || (c.score >= 70 && c.assessmentStatus === "passed")) && (
            <div className="relative">
              {c.status === "interviewing" ? (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-amber-500 flex items-center justify-center text-[7px] text-white animate-pulse">⌁</span>
              ) : isRejected && c.interviewFeedback ? (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-rose-500 flex items-center justify-center text-[7px] text-white">✗</span>
              ) : (c.status === "selected" || c.status === "onboarded") ? (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
              ) : (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-secondary border border-border dark:border-slate-700 flex items-center justify-center text-[7px] text-slate-400">•</span>
              )}
              <div>
                <span className="font-bold text-foreground block">
                  4. HR Interview Round (Manager Evaluation)
                </span>
                <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">
                  {c.status === "interviewing"
                    ? `Scheduled with HR Manager Yogesh Wadhwa on ${c.interviewScheduledDate ? new Date(c.interviewScheduledDate).toLocaleDateString() : 'TBD'}.`
                    : isRejected && c.interviewFeedback
                    ? `Rejected: ${c.interviewFeedback}. Moved to Keka Rejected Pool.`
                    : (c.status === "selected" || c.status === "onboarded")
                    ? `Passed. Interview notes logged.`
                    : "Pending."
                  }
                </span>
              </div>
            </div>
          )}

          {/* Step 5: Selection & Keka HRMS Onboarding */}
          {(!isRejected || (c.score >= 70 && c.assessmentStatus === "passed" && !c.interviewFeedback)) && (
            <div className="relative">
              {c.status === "onboarded" ? (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-emerald-500 flex items-center justify-center text-[7px] text-white">✓</span>
              ) : c.status === "selected" ? (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-amber-500 flex items-center justify-center text-[7px] text-white animate-pulse">⌁</span>
              ) : (
                <span className="absolute -left-[24.5px] top-0.5 h-3.5 w-3.5 rounded-full bg-secondary border border-border dark:border-slate-700 flex items-center justify-center text-[7px] text-slate-400">•</span>
              )}
              <div>
                <span className="font-bold text-foreground block">
                  5. Selection & Keka HRMS Onboarding
                </span>
                <span className="text-[9.5px] text-muted-foreground font-semibold block mt-0.5">
                  {c.status === "onboarded"
                    ? "Onboarded. Sync complete with Keka HRMS onboarding workflow."
                    : c.status === "selected"
                    ? "Selected. Waiting to trigger Keka HRMS Onboarding."
                    : "Pending."
                  }
                </span>
              </div>
            </div>
          )}

        </div>
      </div>
    )
  }

  const handleAssessmentSubmit = async (id: string, score: number) => {
    setIsAssessmentSubmitting(true)
    toast.loading("AI evaluating assessment test results...", { id: "assessment-loader" })

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
      const resp = await fetch(`${apiBase}/candidates/${id}/submit-assessment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score })
      })

      if (resp.ok) {
        const data = await resp.json()
        if (data && data.success) {
          // Update local state
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: data.logMessage }]
              return {
                ...c,
                status: data.status,
                kekaStatus: data.kekaStatus,
                assessmentStatus: data.assessmentStatus,
                assessmentScore: data.assessmentScore,
                interviewScheduledDate: data.interviewScheduledDate,
                activityLogs: updatedLogs
              }
            }
            return c
          }))
          
          toast.success(score >= 70 ? "Candidate passed assessment! HR Interview scheduled." : "Candidate failed assessment. Moved to Keka Rejected Pool.", { id: "assessment-loader" })
          setIsAssessmentSubmitting(false)
          
          // Sync selected candidate
          setTimeout(() => {
            setCandidates(prev => {
              const match = prev.find(c => c.id === id)
              if (match) setSelectedCandidate(match)
              return prev
            })
          }, 100)
          return
        }
      }
    } catch (e) {
      console.warn("Backend assessment submit failed, falling back to local simulation:", e)
    }

    // Fallback Local Simulation
    let status: "applied" | "shortlisted" | "interviewing" | "hold" | "rejected" = "rejected"
    let kekaStatus = "rejected_pool"
    let assessmentStatus: "passed" | "failed" = "failed"
    let interviewScheduledDate: string | null = null
    let logMessage = `Candidate failed assessment with score ${score}/100. Moved to Rejected Pool in Keka HRMS.`

    if (score >= 70) {
      status = "interviewing"
      kekaStatus = "active"
      assessmentStatus = "passed"
      const date = new Date()
      date.setDate(date.getDate() + 2)
      date.setHours(10, 0, 0, 0)
      interviewScheduledDate = date.toISOString()
      logMessage = `Candidate passed assessment with score ${score}/100. HR Interview scheduled with HR Manager.`
    }

    setCandidates(prev => prev.map(c => {
      if (c.id === id) {
        const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: logMessage }]
        return {
          ...c,
          status,
          kekaStatus,
          assessmentStatus,
          assessmentScore: score,
          interviewScheduledDate,
          activityLogs: updatedLogs
        }
      }
      return c
    }))

    toast.success(score >= 70 ? "Candidate passed! Scheduled interview." : "Candidate failed. Keka pool updated.", { id: "assessment-loader" })
    setIsAssessmentSubmitting(false)
    
    setTimeout(() => {
      setCandidates(prev => {
        const match = prev.find(c => c.id === id)
        if (match) setSelectedCandidate(match)
        return prev
      })
    }, 100)
  }

  const handleInterviewSubmit = async (id: string, decision: "pass" | "fail", feedback: string) => {
    setIsInterviewSubmitting(true)
    toast.loading("Submitting interview evaluation...", { id: "interview-loader" })

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1200))

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
      const resp = await fetch(`${apiBase}/candidates/${id}/submit-interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, feedback })
      })

      if (resp.ok) {
        const data = await resp.json()
        if (data && data.success) {
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: data.logMessage }]
              return {
                ...c,
                status: data.status,
                kekaStatus: data.kekaStatus,
                interviewFeedback: feedback,
                activityLogs: updatedLogs
              }
            }
            return c
          }))
          
          toast.success(decision === "pass" ? "Candidate approved! Moved to Selection." : "Candidate rejected. Moved to Keka Rejected Pool.", { id: "interview-loader" })
          setIsInterviewSubmitting(false)
          setInterviewFeedbackInput("")
          
          setTimeout(() => {
            setCandidates(prev => {
              const match = prev.find(c => c.id === id)
              if (match) setSelectedCandidate(match)
              return prev
            })
          }, 100)
          return
        }
      }
    } catch (e) {
      console.warn("Backend interview submit failed, falling back to local simulation:", e)
    }

    // Fallback Local Simulation
    let status: "applied" | "shortlisted" | "interviewing" | "hold" | "rejected" | "selected" = "rejected"
    let kekaStatus = "rejected_pool"
    let logMessage = `Candidate rejected in HR Interview. Feedback: "${feedback}". Moved to Rejected Pool in Keka HRMS.`

    if (decision === "pass") {
      status = "selected"
      kekaStatus = "active"
      logMessage = `HR Interview passed. Feedback: "${feedback}". Moved to Final Selection stage.`
    }

    setCandidates(prev => prev.map(c => {
      if (c.id === id) {
        const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: logMessage }]
        return {
          ...c,
          status,
          kekaStatus,
          interviewFeedback: feedback,
          activityLogs: updatedLogs
        }
      }
      return c
    }))

    toast.success(decision === "pass" ? "Interview passed!" : "Interview failed. Keka pool updated.", { id: "interview-loader" })
    setIsInterviewSubmitting(false)
    setInterviewFeedbackInput("")

    setTimeout(() => {
      setCandidates(prev => {
        const match = prev.find(c => c.id === id)
        if (match) setSelectedCandidate(match)
        return prev
      })
    }, 100)
  }

  const handleOnboardSubmit = async (id: string) => {
    setIsOnboardingSubmitting(true)
    toast.loading("Initiating onboarding workflow in Keka HRMS...", { id: "onboard-loader" })

    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
      const resp = await fetch(`${apiBase}/candidates/${id}/onboard`, {
        method: "POST"
      })

      if (resp.ok) {
        const data = await resp.json()
        if (data && data.success) {
          setCandidates(prev => prev.map(c => {
            if (c.id === id) {
              const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: data.logMessage }]
              return {
                ...c,
                status: data.status,
                kekaStatus: data.kekaStatus,
                activityLogs: updatedLogs
              }
            }
            return c
          }))
          
          toast.success("Candidate onboarding initiated successfully in Keka HRMS!", { id: "onboard-loader" })
          setIsOnboardingSubmitting(false)
          
          setTimeout(() => {
            setCandidates(prev => {
              const match = prev.find(c => c.id === id)
              if (match) setSelectedCandidate(match)
              return prev
            })
          }, 100)
          return
        }
      }
    } catch (e) {
      console.warn("Backend onboarding submit failed, falling back to local simulation:", e)
    }

    // Fallback Local Simulation
    const logMessage = "Initiated Keka HRMS onboarding workflow. Candidate record migrated successfully."
    setCandidates(prev => prev.map(c => {
      if (c.id === id) {
        const updatedLogs = [...(c.activityLogs || []), { date: new Date().toISOString(), message: logMessage }]
        return {
          ...c,
          status: "onboarded",
          kekaStatus: "onboarding",
          activityLogs: updatedLogs
        }
      }
      return c
    }))

    toast.success("Candidate onboarding initiated in Keka HRMS!", { id: "onboard-loader" })
    setIsOnboardingSubmitting(false)

    setTimeout(() => {
      setCandidates(prev => {
        const match = prev.find(c => c.id === id)
        if (match) setSelectedCandidate(match)
        return prev
      })
    }, 100)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("Assessment invite link copied to clipboard!")
  }

  const [isSendingInvite, setIsSendingInvite] = useState<Record<string, boolean>>({})

  const handleSendAssessmentInvite = async (id: string) => {
    setIsSendingInvite(prev => ({ ...prev, [id]: true }))
    toast.loading("Sending AI assessment invitation...", { id: "invite-loader" })

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
      const resp = await fetch(`${apiBase}/assessment/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: id })
      })

      if (resp.ok) {
        const data = await resp.json()
        if (data && data.success) {
          toast.success("Assessment invitation sent successfully!", { id: "invite-loader" })
          
          // Reload candidates to sync state
          const refreshCandidates = async () => {
            try {
              const r = await fetch(`${apiBase}/candidates`)
              if (r.ok) {
                const cData = await r.json()
                if (cData && cData.success && Array.isArray(cData.candidates)) {
                  setCandidates(cData.candidates)
                  // Keep selection synced
                  const match = cData.candidates.find((c: any) => c.id === id)
                  if (match) setSelectedCandidate(match)
                }
              }
            } catch (err) {
              console.warn("Failed to reload candidates:", err)
            }
          }
          await refreshCandidates()
          return
        }
      }
      throw new Error("Failed to send assessment invite.")
    } catch (e: any) {
      console.warn("Backend send invite failed:", e)
      toast.error(e.message || "Failed to send assessment invitation.", { id: "invite-loader" })
    } finally {
      setIsSendingInvite(prev => ({ ...prev, [id]: false }))
    }
  }

  // --- HANDLERS ---
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(Array.from(e.dataTransfer.files))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFiles(Array.from(e.target.files))
    }
  }

  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  // Handle Bulk Uploads
  const processUploadedFiles = (files: File[]) => {
    if (!activeJD) {
      toast.error("Please import or save a Job Description profile before screening candidates.")
      return
    }

    files.forEach(file => {
      const ext = file.name.split(".").pop()?.toLowerCase()
      if (ext !== "pdf" && ext !== "docx") {
        toast.error(`"${file.name}" ignored. Only PDF/DOCX are supported.`)
        return
      }
      
      const fileId = `${file.name}-${Date.now()}`
      setUploadProgress(prev => ({ ...prev, [fileId]: 0 }))

      // 1. Simulate Upload Progress
      let prog = 0
      const interval = setInterval(() => {
        prog += 20
        setUploadProgress(prev => ({ ...prev, [fileId]: prog }))
        if (prog >= 100) {
          clearInterval(interval)
          
          // Remove from upload indicator
          setUploadProgress(prev => {
            const updated = { ...prev }
            delete updated[fileId]
            return updated
          })

          // Add to Active screening queue
          const queueItemId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
          const newQueueItem = {
            id: queueItemId,
            name: file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
            fileName: file.name,
            progress: 25,
            status: "parsing"
          }
          setScreeningQueue(prev => [newQueueItem, ...prev])

          // Run evaluation simulation
          runEvaluationPipeline(newQueueItem, file)
        }
      }, 150)
    })
  }

  const runEvaluationPipeline = async (queueItem: any, file: File) => {
    runEvaluationPipelineWithSource(queueItem, file, "Careers Page")
  }

  const runEvaluationPipelineWithSource = async (queueItem: any, file: File, source: string) => {
    // Stage 1: Parsing
    await new Promise(resolve => setTimeout(resolve, 1200))
    setScreeningQueue(prev => prev.map(item => 
      item.id === queueItem.id ? { ...item, progress: 60, status: "scoring" } : item
    ))

    // Stage 2: Scoring
    await new Promise(resolve => setTimeout(resolve, 1800))

    let candidateData: Candidate
    const normalizedName = file.name.toLowerCase()

    const activeJDTitle = activeJD?.title?.toLowerCase() || ""
    const isScmJob = activeJDTitle.includes("scm") || activeJDTitle.includes("operations") || activeJDTitle.includes("procurement")
    const isFrontendJob = activeJDTitle.includes("frontend") || activeJDTitle.includes("web") || activeJDTitle.includes("react") || activeJDTitle.includes("engineering")
    const isDevOpsJob = activeJDTitle.includes("devops") || activeJDTitle.includes("cloud") || activeJDTitle.includes("infrastructure")

    // Call API (purely stateless evaluate endpoint!)
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
      const clientId = localStorage.getItem("rison_client_id") || "client_youmania83"

      const formData = new FormData()
      formData.append("file", file)
      formData.append("jobDescription", JSON.stringify(activeJD))
      formData.append("applicationSource", source)

      const evalResp = await fetch(`${apiBase}/evaluate`, {
        method: "POST",
        headers: {
          "X-Client-ID": clientId
        },
        body: formData
      })
      
      if (evalResp.ok) {
        const evalData = await evalResp.json()
        if (evalData.success && evalData.candidate) {
          candidateData = {
            ...evalData.candidate,
            // Ensure status and appliedDate are set
            status: evalData.candidate.status || "applied",
            appliedDate: evalData.candidate.appliedDate || new Date().toISOString().split('T')[0]
          }
          
          if (candidateData.score < 70) {
            toast.error(`Auto-Rejected: ${candidateData.name} scored ${candidateData.score}% (Threshold: 70%)`)
          } else {
            toast.success(`Assessment Invitation Sent: ${candidateData.name} scored ${candidateData.score}%!`)
          }

          // Add to Candidates
          setCandidates(prev => [candidateData, ...prev])
          setSelectedCandidate(candidateData)
          setScreeningQueue(prev => prev.filter(item => item.id !== queueItem.id))
          setCredits(prev => Math.max(0, prev - 3))
          return
        }
      }
    } catch (e) {
      console.log("Offline Fallback: Scoring computed locally.")
    }

    // Heuristic Fallback
    const score = Math.floor(Math.random() * 40) + 50 // 50 to 90
    const generatedName = queueItem.name
    const appliedDate = new Date().toISOString().split('T')[0]
    
    let status: "applied" | "rejected" | "shortlisted" = "applied"
    let kekaStatus = "active"
    let logMessage = ""
    
    if (score < 70) {
      status = "rejected"
      kekaStatus = "rejected_pool"
      logMessage = `Candidate automatically rejected (Score ${score}/100 < 70). Moved to Rejected Pool in Keka HRMS.`
    } else {
      status = "shortlisted"
      kekaStatus = "active"
      logMessage = `Candidate details logged (Score ${score}/100 >= 70). Assessment invitation automatically sent via email.`
    }
    
    candidateData = {
      id: `cand-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: generatedName,
      role: activeJD?.title || "Staff Evaluated Candidate",
      score: score,
      matchPercent: score,
      experienceYears: Math.floor(Math.random() * 5) + 2,
      experienceMatch: `Candidate has solid background matching the active JD.`,
      recommendation: `Recommended for ${score >= 70 ? 'assessment' : 'review later'}.`,
      confidence: "88% (Medium)",
      riskLevel: score >= 85 ? "Low" : "Medium",
      strengths: ["Strong domain familiarity", "Clear communication skill"],
      weaknesses: ["Missing specific enterprise module certificates"],
      missingSkills: [activeJD?.requiredSkills[3] || "Advanced Tool"],
      matchedSkills: [activeJD?.requiredSkills[0] || "Basics", activeJD?.requiredSkills[1] || "Process"],
      skills: activeJD?.requiredSkills || [],
      certifications: ["Standard Training Certificate"],
      projects: ["Enterprise Integration Project"],
      keywords: activeJD?.keywords || [],
      riskFactors: [],
      status: status,
      applicationSource: source as any,
      kekaStatus: kekaStatus,
      appliedDate: appliedDate,
      education: activeJD?.education || "Bachelor's Degree",
      email: `${generatedName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      phone: "+91 99887 76655",
      activityLogs: [
        { date: new Date().toISOString(), message: `Application received through ${source}` },
        { date: new Date().toISOString(), message: `AI resume parsing complete. Skills, Experience, Education, Certifications, Projects, and Keywords extracted.` },
        { date: new Date().toISOString(), message: `JD Matching & AI Scoring: Overall score is ${score}/100.` },
        { date: new Date().toISOString(), message: logMessage }
      ]
    }
    
    setCandidates(prev => [candidateData, ...prev])
    setSelectedCandidate(candidateData)
    setScreeningQueue(prev => prev.filter(item => item.id !== queueItem.id))
    setCredits(prev => Math.max(0, prev - 3))
    toast.success(`Screening complete: ${candidateData.name} (${candidateData.score}%)`)
  }

  const handleSimulatedIngestion = async (source: "Keka HRMS" | "Careers Email" | "Careers Page") => {
    if (!activeJD) {
      toast.error("Please import or save a Job Description profile before screening candidates.")
      return
    }

    setIsIngesting(true)
    toast.loading(`Simulating collection from ${source}...`, { id: "ingestion-loader" })

    // Simulate downloading from source delay
    await new Promise(resolve => setTimeout(resolve, 1500))

    let name = "Rohan Sharma"
    let filename = "rohan_sharma_scm.pdf"
    let mockText = ""

    const activeJDTitle = activeJD.title.toLowerCase()
    
    if (activeJDTitle.includes("frontend") || activeJDTitle.includes("react") || activeJDTitle.includes("web")) {
      if (Math.random() > 0.4) {
        name = "Neha Gupta"
        filename = "neha_gupta_frontend.pdf"
        mockText = `
NEHA GUPTA
Email: neha.gupta@devmail.com
Phone: +91 99100 22334
Education: B.Tech in Computer Science, IIT Bombay, 2019
Experience: 5 Years as Senior Frontend Engineer at Tech Unicorn
Skills: React, Next.js, TypeScript, Tailwind CSS, Redux, Jest, Webpack, Core Web Vitals, Responsive Design
Projects: Led migration of legacy portal to Next.js, improving load speeds by 50% and increasing conversions by 15%.
Certifications: Certified Scrum Master, Meta Frontend Developer Certificate
Keywords: React, Next.js, TypeScript, Tailwind, Core Web Vitals, Frontend Architect
        `;
      } else {
        name = "Rohan Sharma"
        filename = "rohan_sharma_operations.pdf"
        mockText = `
Rohan Sharma
Email: rohan.sharma@example.com
Phone: +91 98123 45678
Education: Bachelor of Commerce, Delhi University, 2024
Experience: 1 Year as Operations Intern at Local Logistics Hub
Skills: Microsoft Excel, Data Entry, Billing, Local Dispatching, Warehouse Assistant
Projects: Assisted in manual stock audit of 500 items.
Certifications: Basic MS Office Course
Keywords: Logistics, Excel, Dispatch, Warehouse, Data Entry
        `;
      }
    } else if (activeJDTitle.includes("devops") || activeJDTitle.includes("cloud") || activeJDTitle.includes("infrastructure")) {
      if (Math.random() > 0.4) {
        name = "Alex Mercer"
        filename = "alex_mercer_devops.pdf"
        mockText = `
ALEX MERCER
Email: alex.mercer@cloudtech.io
Phone: +1 (555) 765-4321
Education: B.S. in Software Engineering, UT Austin, 2021
Experience: 4 Years as DevOps Engineer at CloudScale Inc
Skills: AWS, Terraform, Docker, Kubernetes, CI/CD, GitHub Actions, Linux Shell Scripting, Prometheus, Grafana
Projects: Automated multi-region infrastructure provisioning using Terraform and configured CI/CD pipelines reducing build times by 40%.
Certifications: AWS Solutions Architect Associate, Certified Kubernetes Administrator (CKA)
Keywords: DevOps, AWS, Terraform, Kubernetes, CI/CD, GitHub Actions, Docker
        `;
      } else {
        name = "Rohan Sharma"
        filename = "rohan_sharma_operations.pdf"
        mockText = `
Rohan Sharma
Email: rohan.sharma@example.com
Phone: +91 98123 45678
Education: Bachelor of Commerce, Delhi University, 2024
Experience: 1 Year as Operations Intern at Local Logistics Hub
Skills: Microsoft Excel, Data Entry, Billing, Local Dispatching, Warehouse Assistant
Projects: Assisted in manual stock audit of 500 items.
Certifications: Basic MS Office Course
Keywords: Logistics, Excel, Dispatch, Warehouse, Data Entry
        `;
      }
    } else {
      if (Math.random() > 0.4) {
        name = "Rohan Sharma"
        filename = "rohan_sharma_scm.pdf"
        mockText = `
ROHAN SHARMA
Email: rohan.sharma@example.com
Phone: +91 98123 45678
Education: B.Tech Mechanical Engineering, NIT Trichy, 2021
Experience: 3 Years as SCM Executive at Manufacturing Plant
Skills: Strategic Procurement, Vendor Management, SAP ERP Systems, Logistics Planning, Cost Optimization, Excel
Projects: Led raw material sourcing audit saving 12% annual procurement cost and reduced supplier lead time by 20%.
Certifications: Supply Chain Management Professional (CSCP)
Keywords: Procurement, SAP ERP, SCM, Logistics, Sourcing, Inventory Control
        `;
      } else {
        name = "Neha Gupta"
        filename = "neha_gupta_frontend.pdf"
        mockText = `
Neha Gupta
Email: neha.gupta@devmail.com
Phone: +91 99100 22334
Education: B.Tech in Computer Science, IIT Bombay, 2019
Experience: 5 Years as Senior Frontend Engineer at Tech Unicorn
Skills: React, Next.js, TypeScript, Tailwind CSS, Redux, Jest, Webpack, Core Web Vitals, Responsive Design
Projects: Led migration of legacy portal to Next.js, improving load speeds by 50% and increasing conversions by 15%.
Certifications: Certified Scrum Master, Meta Frontend Developer Certificate
Keywords: React, Next.js, TypeScript, Tailwind, Core Web Vitals, Frontend Architect
        `;
      }
    }

    const file = new File([mockText], filename, { type: "text/plain" })
    
    // Add to Active screening queue
    const queueItemId = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    const newQueueItem = {
      id: queueItemId,
      name: name,
      fileName: filename,
      progress: 10,
      status: "parsing"
    }
    setScreeningQueue(prev => [newQueueItem, ...prev])
    toast.success(`Resume retrieved from ${source}! Added to live screening queue.`, { id: "ingestion-loader" })
    setIsIngesting(false)

    runEvaluationPipelineWithSource(newQueueItem, file, source)
  }

  // --- JOB DESCRIPTION IMPORT ACTIONS ---
  const handleJdImport = async () => {
    let sourceText = ""
    
    if (importTab === "url") {
      if (!importUrl || !importUrl.trim()) {
        toast.error("Please enter a job description URL.")
        return
      }
      sourceText = `Importing from Link: ${importUrl}`
    } else if (importTab === "file") {
      if (!jdFile) {
        toast.error("Please upload a job description document.")
        return
      }
      sourceText = `Importing from File: ${jdFile.name}`
    } else {
      if (!jdTextPaste || !jdTextPaste.trim()) {
        toast.error("Please paste your job description text.")
        return
      }
      sourceText = jdTextPaste
    }

    setIsExtracting(true)
    toast.loading("Analyzing JD via AI, extracting requirements...", { id: "jd-import" })

    // Simulate AI Extraction or call backend endpoint `/api/jobs/extract`
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
      const resp = await fetch(`${apiBase}/jobs/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: importTab === "text" ? jdTextPaste : undefined, url: importTab === "url" ? importUrl : undefined })
      })

      if (resp.ok) {
        const data = await resp.json()
        if (data && data.title) {
          const importedJD = {
            title: data.title,
            experience: data.experience || "2-5 Years",
            department: activeJD?.department || "Operations",
            location: activeJD?.location || "Bengaluru, India",
            requiredSkills: data.requiredSkills || [],
            preferredSkills: data.preferredSkills || [],
            education: data.education || "Bachelor's Degree",
            responsibilities: data.responsibilities || [],
            keywords: data.keywords || [],
            screeningCriteria: data.screeningCriteria || []
          }
          setActiveJD(importedJD)
          saveOrUpdateJob(importedJD)
          toast.success("Job description parsed successfully!", { id: "jd-import" })
          setIsEditingJD(true) // Open immediately in edit view to review
          setIsExtracting(false)
          return
        }
      }
    } catch (e) {
      console.log("Offline Extraction: running fallback simulation.")
    }

    // Fallback Mock Extraction Simulator
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    let mockResult: StructuredJD
    if (importUrl.toLowerCase().includes("frontend") || jdTextPaste.toLowerCase().includes("frontend") || (jdFile && jdFile.name.toLowerCase().includes("frontend"))) {
      mockResult = {
        title: "Senior Frontend Engineer",
        experience: "5-8 Years",
        department: "Engineering",
        location: "San Francisco, CA (Hybrid)",
        requiredSkills: ["React / Next.js", "TypeScript", "Tailwind CSS", "CSS Modules", "Webpack / Turbopack"],
        preferredSkills: ["GraphQL Federation", "React Hook Form", "Node.js (BFF)"],
        education: "B.S. or M.S. in Computer Science or equivalent experience",
        responsibilities: [
          "Architect and build high-performance client-side SaaS applications.",
          "Lead integration of global component designs and styled components.",
          "Collaborate with Product and Design to deliver high-fidelity interfaces.",
          "Improve core web vitals and overall Largest Contentful Paint metrics."
        ],
        keywords: ["Frontend", "React", "Next.js", "TypeScript", "UX Architecture"],
        screeningCriteria: [
          "Has 5+ years building production-scale React SaaS platforms.",
          "Demonstrated expertise with CSS optimization and Tailwind.",
          "Possesses clear understanding of web vital performance bottlenecks."
        ]
      }
    } else if (importUrl.toLowerCase().includes("devops") || jdTextPaste.toLowerCase().includes("devops") || (jdFile && jdFile.name.toLowerCase().includes("devops"))) {
      mockResult = {
        title: "DevOps Engineer",
        experience: "3-5 Years",
        department: "Engineering",
        location: "Remote, US",
        requiredSkills: ["AWS Infrastructure", "Terraform", "Docker Containers", "Bash Scripting", "GitHub Actions"],
        preferredSkills: ["Kubernetes (EKS)", "Prometheus & Grafana", "Argocd GitOps"],
        education: "B.S. in Computer Engineering or related field",
        responsibilities: [
          "Deploy, monitor, and scale cloud infrastructure on AWS.",
          "Manage infrastructure as code scripts using Terraform.",
          "Automate deployment and release pipelines (CI/CD).",
          "Ensure application logging and monitoring alerts are highly active."
        ],
        keywords: ["DevOps", "AWS", "Terraform", "Kubernetes", "CI/CD"],
        screeningCriteria: [
          "Has 3+ years managing production AWS environments.",
          "Proficient writing and maintaining Terraform codebases.",
          "Experienced with containerization and build pipelines."
        ]
      }
    } else {
      // Default to SCM Executive
      mockResult = {
        title: "SCM Executive",
        experience: "2-5 Years",
        department: "Operations",
        location: "Bengaluru, India",
        requiredSkills: ["Strategic Procurement", "Vendor Management", "SAP / ERP Systems", "Logistics Planning", "Cost Optimization"],
        preferredSkills: ["GST Compliance Audits", "SAP S/4HANA Module"],
        education: "B.Tech Mechanical Engineering with Supply Chain Certification",
        responsibilities: [
          "Negotiate pricing, terms, and contracts with raw material vendors.",
          "Operate SAP/ERP modules to manage purchase requisitions, orders, and logistics.",
          "Standardize inventory and optimize logistics turnaround times.",
          "Audit vendor performance metrics quarterly."
        ],
        keywords: ["SCM", "Procurement", "Logistics", "SAP", "Vendor Sourcing"],
        screeningCriteria: [
          "Has 2+ years of relevant SCM industrial procurement history.",
          "Demonstrates operational familiarity with SAP ERP purchase modules.",
          "Possesses documented cost optimization negotiation benchmarks."
        ]
      }
    }

    setActiveJD(mockResult)
    saveOrUpdateJob(mockResult)
    setImportUrl("")
    setJdFile(null)
    setJdTextPaste("")
    setIsEditingJD(true) // Open editable panel so the user can verify
    setIsExtracting(false)
    toast.success("Job description parsed successfully!", { id: "jd-import" })
  }

  const handleSaveJD = () => {
    if (!activeJD?.title) {
      toast.error("Job title is required.")
      return
    }
    saveOrUpdateJob(activeJD)
    setIsEditingJD(false)
    toast.success("Job description profile saved & synced.", {
      description: "AI evaluation vectors updated for scoring incoming resumes."
    })
  }

  // Update Status
  const handleDecision = (id: string, newStatus: "shortlisted" | "interviewing" | "hold" | "rejected") => {
    setCandidates(prev => prev.map(c => 
      c.id === id ? { ...c, status: newStatus } : c
    ))
    if (selectedCandidate?.id === id) {
      setSelectedCandidate(prev => prev ? { ...prev, status: newStatus } : null)
    }

    const actionText = {
      shortlisted: "Shortlisted",
      interviewing: "Moved to Interview",
      hold: "Placed on Hold",
      rejected: "Rejected"
    }[newStatus]

    toast.message(`Candidate status updated`, {
      description: `${selectedCandidate?.name} has been ${actionText.toLowerCase()}.`
    })

    // Webhook Sync trigger
    if (webhookUrl && webhookUrl.trim() !== "") {
      const candidate = candidates.find(c => c.id === id)
      if (candidate) {
        try {
          fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "candidate_status_updated",
              timestamp: new Date().toISOString(),
              candidate: {
                ...candidate,
                status: newStatus
              }
            }),
            mode: "no-cors"
          })
          toast.info("Syncing candidate data to Google Sheets / Webhook...")
        } catch (e) {
          console.error("Webhook sync failed:", e)
        }
      }
    }
  }

  const handleDeleteCandidate = async (id: string) => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api"
      await fetch(`${apiBase}/candidates/${id}`, {
        method: "DELETE"
      })
    } catch (e) {
      console.warn("Failed to delete candidate from backend database, performing local delete:", e)
    }

    setCandidates(prev => {
      const updated = prev.filter(c => c.id !== id)
      if (selectedCandidate?.id === id) {
        setSelectedCandidate(updated.length > 0 ? updated[0] : null)
      }
      return updated
    })
    toast.success("Candidate profile removed.")
  }

  const exportToCSV = () => {
    if (filteredCandidates.length === 0) {
      toast.error("No candidate data available to export.")
      return
    }

    // Define CSV Headers
    const headers = [
      "Name",
      "Target Role",
      "Match Score (%)",
      "Confidence",
      "Experience (Years)",
      "Recommendation",
      "Strengths",
      "Weaknesses",
      "Missing Skills",
      "Matched Skills",
      "Risk Level",
      "Education",
      "Email",
      "Phone",
      "Applied Date",
      "Pipeline Status"
    ]

    // Formulate rows
    const rows = filteredCandidates.map(c => [
      c.name,
      c.role,
      c.score,
      c.confidence,
      c.experienceYears,
      c.recommendation,
      c.strengths.join(" | "),
      c.weaknesses.join(" | "),
      c.missingSkills.join(" | "),
      c.matchedSkills.join(" | "),
      c.riskLevel,
      c.education,
      c.email,
      c.phone,
      c.appliedDate,
      c.status
    ])

    // Convert to CSV string format
    const csvContent = [
      headers.join(","),
      ...rows.map(row => 
        row.map(val => {
          const stringVal = String(val === null || val === undefined ? "" : val)
          // Escape quotes in string values
          const escaped = stringVal.replace(/"/g, '""')
          // Wrap in quotes if it contains commas, quotes, or newlines
          if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n") || escaped.includes("\r")) {
            return `"${escaped}"`
          }
          return escaped
        }).join(",")
      )
    ].join("\n")

    // Create a download link and trigger click
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `rison_candidates_export_${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("Database exported successfully as CSV (Excel compatible)!")
  }

  // Get all unique roles dynamically for the dropdown
  const uniqueRoles = Array.from(new Set(candidates.map(c => c.role)))

  // Search and filter candidates
  const filteredCandidates = candidates.filter(c => {
    // 1. Text Search query
    const matchesSearch = searchQuery.trim() === "" || 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.matchedSkills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()))

    // 2. Score filter
    let matchesScore = true
    if (scoreFilter === "high") matchesScore = c.score >= 85
    else if (scoreFilter === "moderate") matchesScore = c.score >= 50 && c.score < 85
    else if (scoreFilter === "low") matchesScore = c.score < 50

    // 3. Status filter
    const matchesStatus = statusFilter === "all" || c.status === statusFilter

    // 4. Experience filter
    let matchesExp = true
    if (expFilter === "entry") matchesExp = c.experienceYears <= 2
    else if (expFilter === "mid") matchesExp = c.experienceYears > 2 && c.experienceYears <= 5
    else if (expFilter === "senior") matchesExp = c.experienceYears > 5

    // 5. Role filter
    const matchesRole = roleFilter === "all" || c.role === roleFilter

    return matchesSearch && matchesScore && matchesStatus && matchesExp && matchesRole
  })

  const activeProcessingCount = Object.keys(uploadProgress).length + screeningQueue.length
  const totalScreenedCount = candidates.length

  // --- DYNAMIC DASHBOARD DATA FROM DATABASE CANDIDATES ---
  const avgScore = totalScreenedCount > 0 
    ? (candidates.reduce((sum, c) => sum + (c.score || 0), 0) / totalScreenedCount).toFixed(1) 
    : "0";

  const passedCandidates = candidates.filter(c => c.score >= 70);
  const passRate = totalScreenedCount > 0 
    ? Math.round((passedCandidates.length / totalScreenedCount) * 100) + "%" 
    : "0%";

  const timeToScreen = totalScreenedCount > 0 ? "3.8s" : "0.0s";

  const parsedCount = candidates.length;
  const scoredCount = candidates.filter(c => (c.score || 0) >= 50).length;
  const shortlistedCount = candidates.filter(c => c.status === "shortlisted" || c.status === "interviewing" || c.status === "selected" || c.status === "onboarded").length;
  const interviewCount = candidates.filter(c => c.status === "interviewing" || c.status === "selected" || c.status === "onboarded").length;

  const dynamicFunnelData = [
    { name: "Resumes Uploaded", value: totalScreenedCount > 0 ? totalScreenedCount : 185, fill: "#334155" },
    { name: "Passed Parser", value: totalScreenedCount > 0 ? parsedCount : 168, fill: "#475569" },
    { name: "Scored (Overall >50)", value: totalScreenedCount > 0 ? scoredCount : 114, fill: "#1e3a8a" },
    { name: "Shortlisted", value: totalScreenedCount > 0 ? shortlistedCount : 42, fill: "#047857" },
    { name: "Interview Invited", value: totalScreenedCount > 0 ? interviewCount : 18, fill: "#4f46e5" },
  ];

  const highMatchCount = candidates.filter(c => (c.score || 0) >= 80).length;
  const moderateMatchCount = candidates.filter(c => (c.score || 0) >= 50 && (c.score || 0) < 80).length;
  const lowMatchCount = candidates.filter(c => (c.score || 0) < 50).length;

  const dynamicPieData = [
    { name: "Shortlisted (>80)", value: totalScreenedCount > 0 ? highMatchCount : 42, color: "#10b981" },
    { name: "Moderate Match (50-80)", value: totalScreenedCount > 0 ? moderateMatchCount : 58, color: "#f59e0b" },
    { name: "Low Match (<50)", value: totalScreenedCount > 0 ? lowMatchCount : 14, color: "#ef4444" },
  ];

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const volumeCounts: Record<string, number> = { Sun: 0, Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
  
  candidates.forEach(c => {
    if (c.appliedDate) {
      try {
        const date = new Date(c.appliedDate);
        const dayName = daysOfWeek[date.getDay()];
        if (volumeCounts[dayName] !== undefined) {
          volumeCounts[dayName]++;
        }
      } catch (e) {}
    }
  });

  const hasVolume = Object.values(volumeCounts).some(v => v > 0);
  const dynamicVolumeData = hasVolume ? daysOfWeek.map(day => ({
    name: day,
    Volume: volumeCounts[day]
  })) : [
    { name: "Mon", Volume: 12 },
    { name: "Tue", Volume: 19 },
    { name: "Wed", Volume: 32 },
    { name: "Thu", Volume: 24 },
    { name: "Fri", Volume: 45 },
    { name: "Sat", Volume: 15 },
    { name: "Sun", Volume: 8 },
  ];

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
          <p className="text-xs text-muted-foreground font-semibold tracking-wide">Loading workstation...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans antialiased text-foreground">
      
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-[220px] flex-shrink-0 bg-card border-r border-border flex flex-col justify-between z-20 select-none">
        <div>
          {/* Logo */}
          <div className="h-14 flex items-center px-4.5 border-b border-border gap-2.5">
            <div className="h-6.5 w-6.5 bg-foreground text-background rounded flex items-center justify-center shadow-xs">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-foreground">Rison AI Tech</span>
              <span className="block text-[9px] text-muted-foreground font-bold tracking-wider leading-none">RECRUIT SUITE</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {[
              { id: "screening", label: "Resume Screening", icon: FileCheck2 },
              { id: "dashboard", label: "Dashboard", icon: Layers },
              { id: "jobs", label: "Active Jobs", icon: Briefcase },
              { id: "candidates", label: "Candidates DB", icon: Users },
              { id: "assessments", label: "AI Assessments", icon: Award },
              { id: "pipeline", label: "ATS Pipeline", icon: UserCheck },
              { id: "analytics", label: "Analytics", icon: BarChart3 },
            ].map(item => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
                    isActive 
                      ? "bg-secondary text-foreground shadow-xs border border-border/50" 
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground border border-transparent"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-foreground" : "text-muted-foreground/80"}`} />
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-border">
          <button 
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
              activeTab === "settings"
                ? "bg-secondary text-foreground shadow-xs border border-border/50"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground border border-transparent"
            }`}
          >
            <Settings className="h-4 w-4 text-muted-foreground/80" />
            Workspace Settings
          </button>
          
          <div className="mt-3 p-2.5 bg-secondary/40 rounded-lg border border-border flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-foreground border border-border shadow-xs">
              YK
            </div>
            <div className="min-w-0 flex-1">
              <span className="block text-[10px] font-bold text-foreground truncate leading-tight">Yogesh Wadhwa</span>
              <span className="block text-[9px] text-muted-foreground truncate font-medium">Techsol Admin</span>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* 2. STICKY TOP NAVIGATION */}
        <header className="h-14 bg-card border-b border-border flex items-center justify-between px-6 z-10 select-none">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Enterprise Console</span>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-semibold px-2.5 py-0.5 text-foreground bg-secondary/50 border-border">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                DeepSeek-Coder v1.5 API Connected
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Status Badges */}
            <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground/80" />
                <span>Screened: <strong className="text-foreground font-bold">{totalScreenedCount}</strong></span>
              </div>
              
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground/80" />
                <span>Processing: 
                  <strong className="text-foreground font-bold ml-1">
                    {activeProcessingCount > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 animate-pulse">{activeProcessingCount} active</span>
                    ) : (
                      "0 Idle"
                    )}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-muted-foreground/80" />
                <span>API Credits: <strong className="text-foreground font-bold">{credits} Remaining</strong></span>
              </div>
            </div>

            <div className="h-4 w-px bg-border" />

            {/* Dark Mode toggle */}
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsDark(!isDark)} 
                className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              >
                {isDark ? "☀️" : "🌙"}
              </button>
            </div>
          </div>
        </header>

        {/* 3. WORKSPACE CONTAINER */}
        <main className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-background">
          
          <AnimatePresence mode="wait">
            
            {/* VIEW A: RESUME SCREENING (THE 3-COLUMN WORKSTATION) */}
            {activeTab === "screening" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="h-full flex flex-col gap-6"
              >
                
                {/* Upper Section: 3 Columns Workstation */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* COLUMN 1: IMPORT JOB DESCRIPTION WORKSPACE (lg:col-span-4) */}
                  <div className="lg:col-span-4 space-y-4">
                    
                    {/* Job Import Module */}
                    <Card className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
                          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                          Import Job Description
                        </CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground">Import from URL, file, or paste raw text to configure AI evaluation vectors.</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        
                        <Tabs value={importTab} onValueChange={(v) => setImportTab(v as any)} className="w-full">
                          <TabsList className="grid grid-cols-3 w-full bg-secondary p-0.5 rounded text-[11px] h-8">
                            <TabsTrigger value="url" className="text-[11px] py-1 rounded">URL Link</TabsTrigger>
                            <TabsTrigger value="file" className="text-[11px] py-1 rounded">Document</TabsTrigger>
                            <TabsTrigger value="text" className="text-[11px] py-1 rounded">Raw Text</TabsTrigger>
                          </TabsList>

                          <TabsContent value="url" className="pt-3.5 space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">LinkedIn or Career Page Link</label>
                              <div className="relative">
                                <Link2 className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                                <input 
                                  type="url" 
                                  placeholder="e.g. linkedin.com/jobs/view/12345..."
                                  value={importUrl}
                                  onChange={(e) => setImportUrl(e.target.value)}
                                  className="w-full bg-secondary/40 border border-border rounded pl-8.5 pr-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground dark:text-slate-200"
                                />
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="file" className="pt-3.5 space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Upload JD Document</label>
                              <div 
                                onClick={() => jdFileInputRef.current?.click()}
                                className="border border-dashed border-border rounded p-4 text-center cursor-pointer bg-secondary/30 dark:bg-slate-900/10 hover:border-slate-400 dark:hover:border-slate-700 flex flex-col items-center justify-center gap-1.5"
                              >
                                <input 
                                  type="file" 
                                  ref={jdFileInputRef}
                                  onChange={(e) => e.target.files && setJdFile(e.target.files[0])}
                                  accept=".pdf,.docx"
                                  className="hidden"
                                />
                                <FileDown className="h-5 w-5 text-slate-400" />
                                <span className="text-[11px] font-semibold text-foreground dark:text-slate-255 truncate max-w-full px-2">
                                  {jdFile ? jdFile.name : "Select JD PDF or DOCX file"}
                                </span>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="text" className="pt-3.5 space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Paste raw JD text</label>
                              <textarea 
                                placeholder="Paste job title, experience, responsibilities, and skills requirements..."
                                value={jdTextPaste}
                                onChange={(e) => setJdTextPaste(e.target.value)}
                                rows={4}
                                className="w-full bg-secondary/40 border border-border rounded px-2.5 py-2 text-xs outline-none text-foreground dark:text-slate-200 resize-none font-mono"
                              />
                            </div>
                          </TabsContent>
                        </Tabs>

                        <Button 
                          onClick={handleJdImport}
                          disabled={isExtracting}
                          className="w-full text-xs font-semibold gap-2 h-8.5"
                        >
                          {isExtracting ? (
                            <>
                              <div className="h-3 w-3 animate-spin rounded-full border border-slate-400 border-t-white" />
                              AI Extracting Requirements...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3.5 w-3.5" />
                              Import & AI-Extract JD
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Active Structured Job Profile View/Editor */}
                    {activeJD && (
                      <Card className="shadow-sm border-border bg-card">
                        <CardHeader className="pb-2.5 border-b border-border flex flex-row items-center justify-between space-y-0">
                          <div>
                            <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Active Job Profile</CardTitle>
                            <CardDescription className="text-[9px] text-muted-foreground"> Extracted structured vectors.</CardDescription>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground dark:text-slate-400 dark:hover:text-slate-200 font-semibold gap-1 border border-border"
                            onClick={() => setIsEditingJD(!isEditingJD)}
                          >
                            {isEditingJD ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                                Finish Edit
                              </>
                            ) : (
                              <>
                                <Edit2 className="h-3 w-3" />
                                Edit Fields
                              </>
                            )}
                          </Button>
                        </CardHeader>
                        
                        <CardContent className="pt-3.5 space-y-3.5 text-xs max-h-[480px] overflow-y-auto custom-scrollbar">
                          {isEditingJD ? (
                            // --- EDITABLE VIEW ---
                            <div className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Job Title</label>
                                <input 
                                  type="text" 
                                  value={activeJD.title}
                                  onChange={(e) => setActiveJD({ ...activeJD, title: e.target.value })}
                                  className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none font-semibold text-foreground"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Experience</label>
                                  <input 
                                    type="text" 
                                    value={activeJD.experience}
                                    onChange={(e) => setActiveJD({ ...activeJD, experience: e.target.value })}
                                    className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground dark:text-slate-205"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Department</label>
                                  <input 
                                    type="text" 
                                    value={activeJD.department}
                                    onChange={(e) => setActiveJD({ ...activeJD, department: e.target.value })}
                                    className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground dark:text-slate-205"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Location</label>
                                <input 
                                  type="text" 
                                  value={activeJD.location}
                                  onChange={(e) => setActiveJD({ ...activeJD, location: e.target.value })}
                                  className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground dark:text-slate-205"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Required Skills (Comma-separated)</label>
                                <textarea 
                                  value={activeJD.requiredSkills.join(", ")}
                                  onChange={(e) => setActiveJD({ ...activeJD, requiredSkills: e.target.value.split(",").map(s => s.trim()) })}
                                  rows={2}
                                  className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground dark:text-slate-205 resize-none font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Preferred Skills</label>
                                <input 
                                  type="text" 
                                  value={activeJD.preferredSkills.join(", ")}
                                  onChange={(e) => setActiveJD({ ...activeJD, preferredSkills: e.target.value.split(",").map(s => s.trim()) })}
                                  className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground dark:text-slate-205"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Education Required</label>
                                <input 
                                  type="text" 
                                  value={activeJD.education}
                                  onChange={(e) => setActiveJD({ ...activeJD, education: e.target.value })}
                                  className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground dark:text-slate-205"
                                />
                              </div>

                              <Button 
                                variant="default" 
                                size="sm" 
                                className="w-full text-xs font-semibold mt-2"
                                onClick={handleSaveJD}
                              >
                                Save Changes & Sync Pipeline
                              </Button>
                            </div>
                          ) : (
                            // --- STRUCTURED READ-ONLY DISPLAY ---
                            <div className="space-y-3.5">
                              <div>
                                <h3 className="text-sm font-bold text-foreground">{activeJD.title}</h3>
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[10px] text-muted-foreground font-semibold select-none">
                                  <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {activeJD.department}</span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {activeJD.location}</span>
                                  <span>•</span>
                                  <span>Exp: {activeJD.experience}</span>
                                </div>
                              </div>

                              <div>
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1">Required Skills</span>
                                <div className="flex flex-wrap gap-1">
                                  {activeJD.requiredSkills.map(s => (
                                    <Badge key={s} variant="secondary" className="text-[9px] px-2 py-0.5 border border-border bg-secondary/40 text-foreground dark:bg-slate-900 border-border dark:text-slate-250">
                                      {s}
                                    </Badge>
                                  ))}
                                </div>
                              </div>

                              {activeJD.preferredSkills.length > 0 && (
                                <div>
                                  <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1">Preferred Skills</span>
                                  <div className="flex flex-wrap gap-1">
                                    {activeJD.preferredSkills.map(s => (
                                      <Badge key={s} variant="outline" className="text-[9px] px-2 py-0.5 text-muted-foreground border-border dark:text-slate-400 dark:border-slate-850 select-none">
                                        {s}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div>
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-0.5">Education Requirements</span>
                                <p className="text-[10px] text-foreground/90 font-medium">{activeJD.education}</p>
                              </div>

                              <div>
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1">Key Responsibilities</span>
                                <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-muted-foreground dark:text-slate-350 leading-relaxed font-medium">
                                  {activeJD.responsibilities.slice(0, 3).map((r, i) => (
                                    <li key={i}>{r}</li>
                                  ))}
                                </ul>
                              </div>

                              <div>
                                <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80 mb-1">AI Screening Criteria Matrix</span>
                                <ul className="space-y-1">
                                  {activeJD.screeningCriteria.map((c, i) => (
                                    <li key={i} className="flex gap-2 text-[10px] leading-normal text-muted-foreground font-medium">
                                      <span className="h-3.5 w-3.5 rounded-full bg-secondary flex-shrink-0 flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                                        {i + 1}
                                      </span>
                                      <span>{c}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                  </div>

                  {/* COLUMN 2: RESUME UPLOAD & LIVE QUEUE (lg:col-span-5) */}
                  <div className="lg:col-span-5 space-y-6">
                    
                    {/* Resume Ingestion Source Simulator */}
                    <Card className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground flex items-center gap-1.5">
                          <Activity className="h-3.5 w-3.5 text-indigo-500" />
                          Resume Collection Engine (Simulator)
                        </CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground">
                          Automatically pulls resumes from candidate application streams.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={isIngesting || !activeJD}
                            onClick={() => handleSimulatedIngestion("Keka HRMS")}
                            className="text-[10px] font-semibold py-1.5 h-auto flex flex-col items-center gap-1 border-border text-foreground/90 hover:bg-secondary/40 dark:hover:bg-slate-900/50"
                          >
                            <Building2 className="h-4 w-4 text-emerald-500" />
                            Keka HRMS
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={isIngesting || !activeJD}
                            onClick={() => handleSimulatedIngestion("Careers Email")}
                            className="text-[10px] font-semibold py-1.5 h-auto flex flex-col items-center gap-1 border-border text-foreground/90 hover:bg-secondary/40 dark:hover:bg-slate-900/50"
                          >
                            <FileText className="h-4 w-4 text-sky-500" />
                            Careers Email
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled={isIngesting || !activeJD}
                            onClick={() => handleSimulatedIngestion("Careers Page")}
                            className="text-[10px] font-semibold py-1.5 h-auto flex flex-col items-center gap-1 border-border text-foreground/90 hover:bg-secondary/40 dark:hover:bg-slate-900/50"
                          >
                            <Link2 className="h-4 w-4 text-amber-500" />
                            Careers Page
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Resume Upload Area */}
                    <Card className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Bulk Resume Ingestion</CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground">Drag & drop multiple resume files to evaluate simultaneously.</CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div
                          onDragEnter={handleDrag}
                          onDragOver={handleDrag}
                          onDragLeave={handleDrag}
                          onDrop={handleDrop}
                          onClick={triggerFileSelect}
                          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 ${
                            dragActive 
                              ? "border-slate-800 bg-secondary/40/80 dark:border-border dark:bg-slate-900/60" 
                              : "border-border hover:border-slate-400 border-border dark:hover:border-slate-600 bg-secondary/40"
                          }`}
                        >
                          <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileChange} 
                            accept=".pdf,.docx" 
                            className="hidden" 
                            multiple
                          />
                          <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-slate-400">
                            <UploadCloud className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-foreground dark:text-slate-100">
                              {Object.keys(uploadProgress).length > 0 
                                ? `Uploading ${Object.keys(uploadProgress).length} file(s)...` 
                                : "Drop PDF / DOCX resumes here"}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">Supports multiple documents evaluated in parallel</p>
                          </div>
                        </div>

                        {/* File Uploading Progress Bars */}
                        {Object.keys(uploadProgress).length > 0 && (
                          <div className="mt-4 p-3 bg-secondary/40 rounded border border-border space-y-2.5">
                            <span className="block text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Ingesting Streams</span>
                            {Object.entries(uploadProgress).map(([fileId, progress]) => (
                              <div key={fileId} className="space-y-1">
                                <div className="flex justify-between text-[9px] font-semibold text-muted-foreground">
                                  <span className="truncate max-w-[200px]">{fileId.split("-")[0]}</span>
                                  <span>{progress}%</span>
                                </div>
                                <Progress value={progress} className="h-1" />
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Live Screening Queue */}
                    <Card className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between space-y-0">
                        <div>
                          <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Live Screening Queue</CardTitle>
                          <CardDescription className="text-[10px] text-muted-foreground dark:text-slate-455">Real-time pipeline parsing updates.</CardDescription>
                        </div>
                        {screeningQueue.length > 0 && (
                          <Badge variant="warning" className="text-[9px] px-1.5 py-0.5">
                            Processing {screeningQueue.length}
                          </Badge>
                        )}
                      </CardHeader>
                      <CardContent className="p-0">
                        {screeningQueue.length === 0 ? (
                          <div className="py-8 px-4 text-center text-xs text-muted-foreground/80 font-semibold flex flex-col items-center gap-1.5">
                            <Clock className="h-4 w-4 text-slate-400" />
                            <span>No active screening pipelines running.</span>
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 dark:divide-slate-900">
                            {screeningQueue.map((item) => (
                              <div key={item.id} className="p-3.5 flex items-center justify-between gap-4">
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold truncate text-foreground">{item.name}</span>
                                    <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-border text-muted-foreground font-mono select-none">
                                      {item.fileName}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 flex-1 bg-secondary rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-slate-900 dark:bg-secondary transition-all duration-500" 
                                        style={{ width: `${item.progress}%` }} 
                                      />
                                    </div>
                                    <span className="text-[9px] font-bold text-muted-foreground w-8 text-right">{item.progress}%</span>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                  {item.status === "parsing" ? (
                                    <Badge variant="secondary" className="text-[9px] px-2 py-0.5 flex items-center gap-1">
                                      <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
                                      Parsing text
                                    </Badge>
                                  ) : (
                                    <Badge variant="warning" className="text-[9px] px-2 py-0.5 flex items-center gap-1">
                                      <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                                      AI Scoring
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Candidate Ranking List */}
                    <Card className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Screened Candidates</CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground">Leaderboard of evaluated resumes ranked by AI score.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[60px] pl-4">Rank</TableHead>
                              <TableHead>Candidate</TableHead>
                              <TableHead className="w-[80px]">Score</TableHead>
                              <TableHead className="w-[100px]">Decision</TableHead>
                              <TableHead className="w-[50px] pr-4"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {candidates.map((c, idx) => (
                              <TableRow 
                                key={c.id}
                                onClick={() => setSelectedCandidate(c)}
                                className={`cursor-pointer transition-colors ${
                                  selectedCandidate?.id === c.id 
                                    ? "bg-secondary/70 dark:bg-slate-800/60 font-semibold" 
                                    : ""
                                }`}
                              >
                                <TableCell className="pl-4 text-xs font-bold text-muted-foreground/80">#{idx + 1}</TableCell>
                                <TableCell>
                                   <div>
                                     <div className="flex items-center gap-1.5 flex-wrap">
                                       <span className="text-xs font-bold text-foreground">{c.name}</span>
                                       {c.applicationSource && (
                                         <span className="text-[7.5px] px-1 py-0.2 border border-slate-205 border-border text-muted-foreground/80 dark:text-slate-400 bg-secondary/40 rounded font-semibold select-none">
                                           {c.applicationSource}
                                         </span>
                                       )}
                                     </div>
                                     <span className="text-[9px] text-muted-foreground font-semibold block mt-0.5">{c.role} • {c.experienceYears} yrs</span>
                                   </div>
                                 </TableCell>
                                <TableCell>
                                  <span className={`text-xs font-bold ${
                                    c.score >= 85 
                                      ? "text-emerald-600 dark:text-emerald-400" 
                                      : c.score >= 70 
                                      ? "text-amber-600 dark:text-amber-400" 
                                      : "text-red-500"
                                  }`}>
                                    {c.score}/100
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <Badge 
                                    variant={
                                      c.status === "shortlisted" ? "success" : 
                                      c.status === "interviewing" ? "purple" : 
                                      c.status === "hold" ? "warning" : 
                                      c.status === "rejected" ? "destructive" : "secondary"
                                    }
                                    className="text-[9px] uppercase tracking-wider px-1.5 py-0"
                                  >
                                    {c.status}
                                  </Badge>
                                </TableCell>
                                <TableCell className="pr-4 text-right">
                                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 inline" />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>

                  </div>

                  {/* COLUMN 3: CANDIDATE DETAIL WORKSTATION (lg:col-span-4) */}
                  <div className="lg:col-span-4">
                    {selectedCandidate ? (
                      <Card className="shadow-sm border-border bg-card sticky top-6">
                        <CardHeader className="pb-3 border-b border-border">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <Badge variant="outline" className="text-[8px] uppercase tracking-wider text-muted-foreground font-bold px-2 py-0 border-border select-none">
                                  Screened Profile
                                </Badge>
                                <button
                                  onClick={() => handleDeleteCandidate(selectedCandidate.id)}
                                  className="text-slate-400 hover:text-red-500 p-0.5 rounded transition-colors cursor-pointer"
                                  title="Delete profile"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                              <CardTitle className="text-sm font-bold text-foreground dark:text-slate-50">{selectedCandidate.name}</CardTitle>
                              <CardDescription className="text-[10px] text-muted-foreground mt-0.5">{selectedCandidate.role} • {selectedCandidate.experienceYears} Years Exp</CardDescription>
                            </div>
                            
                            {/* Overall Fit Score Circle */}
                            <div className="flex flex-col items-center">
                              <div className="relative h-12 w-12 rounded-full border-3 border-border flex items-center justify-center select-none shadow-sm bg-secondary/30 dark:bg-slate-900/50">
                                <span className={`text-xs font-bold ${
                                  selectedCandidate.score >= 85 
                                    ? "text-emerald-600 dark:text-emerald-400" 
                                    : selectedCandidate.score >= 70 
                                    ? "text-amber-600 dark:text-amber-400" 
                                    : "text-red-500"
                                }`}>
                                  {selectedCandidate.score}
                                </span>
                              </div>
                              <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/80 mt-1.5 text-center leading-none">Fit Score</span>
                            </div>
                          </div>
                        </CardHeader>
                        
                        <CardContent className="pt-4 space-y-4 text-xs">
                          
                          {/* Stepper Timeline */}
                          {renderRecruitmentTimeline(selectedCandidate)}
                          
                          {/* Details Row */}
                          <div className="grid grid-cols-2 gap-3.5 bg-secondary/30 dark:bg-slate-900/30 p-2.5 rounded border border-border/40 dark:border-slate-850/40">
                            <div>
                              <span className="block text-[9px] uppercase font-bold text-muted-foreground">Confidence Level</span>
                              <span className="font-semibold text-[11px] text-foreground">{selectedCandidate.confidence}</span>
                            </div>
                            <div>
                              <span className="block text-[9px] uppercase font-bold text-muted-foreground">Risk Profile</span>
                              <Badge 
                                variant={selectedCandidate.riskLevel === "Low" ? "success" : selectedCandidate.riskLevel === "Medium" ? "warning" : "destructive"} 
                                className="text-[8px] px-1 py-0 font-bold"
                              >
                                {selectedCandidate.riskLevel} Risk
                              </Badge>
                            </div>
                          </div>

                          {/* Recommendation Statement */}
                          <div>
                            <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1">AI Recommendation Summary</span>
                            <p className="text-foreground/90 leading-relaxed font-semibold bg-secondary/40 p-2.5 rounded border border-border text-[11px]">
                              {selectedCandidate.recommendation}
                            </p>
                          </div>

                          {/* Experience Match */}
                          <div>
                            <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1">Experience Alignment</span>
                            <p className="text-muted-foreground dark:text-slate-350 leading-relaxed text-[11px] font-medium">{selectedCandidate.experienceMatch}</p>
                          </div>

                          {/* Skill Gap Analysis (visual checklist) */}
                          <div className="space-y-1.5">
                            <span className="block text-[9px] uppercase font-bold text-muted-foreground">Skills Alignment Matrix</span>
                            
                            <div className="flex flex-wrap gap-1">
                              {selectedCandidate.matchedSkills.map(skill => (
                                <Badge key={skill} variant="outline" className="text-[9px] font-semibold bg-emerald-50/30 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border-emerald-250/20 px-2 py-0.5 select-none">
                                  ✓ {skill}
                                </Badge>
                              ))}
                              {selectedCandidate.missingSkills.map(skill => (
                                <Badge key={skill} variant="outline" className="text-[9px] font-semibold bg-red-50/30 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400 border-rose-250/20 px-2 py-0.5 select-none">
                                  × {skill}
                                </Badge>
                              ))}
                            </div>
                            
                            {selectedCandidate.keywords && selectedCandidate.keywords.length > 0 && (
                              <div className="pt-1.5 flex flex-wrap gap-1 items-center">
                                <span className="text-[8.5px] uppercase font-bold text-slate-400 dark:text-muted-foreground mr-1 select-none">Keywords:</span>
                                {selectedCandidate.keywords.map((kw) => (
                                  <span key={kw} className="text-[9px] font-semibold text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded select-none border border-border/40">
                                    {kw}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Strengths & Weaknesses (bullet columns) */}
                          <div className="space-y-3">
                            <div>
                              <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1 flex items-center gap-1 text-emerald-600 dark:text-emerald-450">
                                <ThumbsUp className="h-2.5 w-2.5 inline" /> Core Strengths
                              </span>
                              <ul className="space-y-1 pl-3.5 list-disc text-muted-foreground dark:text-slate-300 text-[11px] leading-relaxed font-medium">
                                {selectedCandidate.strengths.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                            
                            {selectedCandidate.weaknesses.length > 0 && (
                              <div>
                                <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1 flex items-center gap-1 text-amber-600 dark:text-amber-450">
                                  <ThumbsDown className="h-2.5 w-2.5 inline" /> Attention Areas
                                </span>
                                <ul className="space-y-1 pl-3.5 list-disc text-muted-foreground dark:text-slate-300 text-[11px] leading-relaxed font-medium">
                                  {selectedCandidate.weaknesses.map((w, i) => (
                                    <li key={i}>{w}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {selectedCandidate.riskFactors.length > 0 && (
                              <div className="p-2 bg-rose-50/50 dark:bg-rose-950/10 rounded border border-rose-100 dark:border-rose-950/30">
                                <span className="block text-[9px] uppercase font-bold text-rose-700 dark:text-rose-450 mb-1 flex items-center gap-1">
                                  <ShieldAlert className="h-3 w-3 inline" /> Primary Risk Factor
                                </span>
                                <p className="text-rose-700 dark:text-rose-350 text-[10px] leading-relaxed font-semibold">
                                  {selectedCandidate.riskFactors[0]}
                                </p>
                              </div>
                            )}

                            {/* Certifications and Projects */}
                            {((selectedCandidate.certifications && selectedCandidate.certifications.length > 0) || 
                              (selectedCandidate.projects && selectedCandidate.projects.length > 0)) && (
                              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                                {selectedCandidate.certifications && selectedCandidate.certifications.length > 0 && (
                                  <div>
                                    <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1">
                                      🎖 Certifications
                                    </span>
                                    <ul className="space-y-0.5 list-disc pl-3 text-[10px] text-muted-foreground dark:text-slate-300 leading-relaxed font-medium">
                                      {selectedCandidate.certifications.map((cert, idx) => (
                                        <li key={idx} className="truncate max-w-full" title={cert}>{cert}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {selectedCandidate.projects && selectedCandidate.projects.length > 0 && (
                                  <div>
                                    <span className="block text-[9px] uppercase font-bold text-muted-foreground mb-1">
                                      📁 Key Projects
                                    </span>
                                    <ul className="space-y-0.5 list-disc pl-3 text-[10px] text-muted-foreground dark:text-slate-300 leading-relaxed font-medium">
                                      {selectedCandidate.projects.map((proj, idx) => (
                                        <li key={idx} className="truncate max-w-full" title={proj}>{proj}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Contact details */}
                          <div className="pt-2 border-t border-border/50 grid grid-cols-1 gap-1 text-[10px] text-muted-foreground font-semibold">
                            <span>Education: <strong className="text-foreground dark:text-slate-250 font-bold">{selectedCandidate.education}</strong></span>
                            <span>Contact: <strong className="text-foreground dark:text-slate-250 font-bold">{selectedCandidate.email} • {selectedCandidate.phone}</strong></span>
                          </div>

                          {/* Recruitment Stage Interactive Panels */}
                          <div className="pt-2.5 border-t border-border/50 space-y-3">
                            
                            {/* Shortlisted / Assessment Pending Stage */}
                            {selectedCandidate.status === "shortlisted" && (
                              <div className="p-3 bg-indigo-50/40 dark:bg-indigo-950/10 rounded-lg border border-indigo-100 dark:border-indigo-950/30 space-y-2.5">
                                <span className="block text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400">
                                  ✉ Assessment Invited
                                </span>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                  The candidate has been automatically emailed a link to complete the technical assessment test.
                                </p>
                                <div className="space-y-1.5 pt-1.5 border-t border-indigo-100/55 dark:border-indigo-950/40">
                                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    Simulated Test Score (0-100)
                                  </label>
                                  <div className="flex gap-2">
                                    <input 
                                      type="number" 
                                      min="0" 
                                      max="100"
                                      value={assessmentScoreInput}
                                      onChange={(e) => setAssessmentScoreInput(Math.min(100, Math.max(0, Number(e.target.value))))}
                                      className="w-16 bg-white dark:bg-slate-900 border border-border rounded px-2 py-1 text-xs outline-none text-foreground font-semibold"
                                    />
                                    <Button 
                                      size="sm" 
                                      disabled={isAssessmentSubmitting}
                                      onClick={() => handleAssessmentSubmit(selectedCandidate.id, assessmentScoreInput)}
                                      className="flex-1 text-[10px] font-bold"
                                    >
                                      {isAssessmentSubmitting ? "Evaluating..." : "Submit Test Results"}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Interviewing Stage */}
                            {selectedCandidate.status === "interviewing" && (
                              <div className="p-3 bg-indigo-50/40 dark:bg-indigo-950/10 rounded-lg border border-indigo-100 dark:border-indigo-950/30 space-y-2.5">
                                <div className="flex items-center justify-between border-b border-indigo-100/55 dark:border-indigo-950/40 pb-1.5">
                                  <span className="block text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400">
                                    📅 HR Interview Round
                                  </span>
                                  <Badge variant="secondary" className="text-[8.5px] px-1 bg-white dark:bg-slate-900">
                                    Scheduled
                                  </Badge>
                                </div>
                                <div className="text-[10px] text-muted-foreground leading-normal space-y-1 select-text">
                                  <p><strong>Interviewer:</strong> Yogesh Wadhwa (HR Manager)</p>
                                  <p><strong>Date/Time:</strong> {selectedCandidate.interviewScheduledDate ? new Date(selectedCandidate.interviewScheduledDate).toLocaleString() : "TBD"}</p>
                                </div>
                                <div className="space-y-1.5 pt-2 border-t border-indigo-100/55 dark:border-indigo-950/40">
                                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    HR Interview Evaluation Notes
                                  </label>
                                  <textarea 
                                    placeholder="Enter communication skills, domain fit, and salary expectation feedback..."
                                    value={interviewFeedbackInput}
                                    onChange={(e) => setInterviewFeedbackInput(e.target.value)}
                                    rows={2}
                                    className="w-full bg-white dark:bg-slate-900 border border-border rounded px-2 py-1.5 text-xs outline-none text-foreground resize-none"
                                  />
                                  <div className="grid grid-cols-2 gap-2 pt-1">
                                    <Button 
                                      variant="success" 
                                      size="sm" 
                                      disabled={isInterviewSubmitting || !interviewFeedbackInput.trim()}
                                      onClick={() => handleInterviewSubmit(selectedCandidate.id, "pass", interviewFeedbackInput)}
                                      className="text-[10px] font-bold"
                                    >
                                      {isInterviewSubmitting ? "Updating..." : "✓ Approve Candidate"}
                                    </Button>
                                    <Button 
                                      variant="destructive" 
                                      size="sm" 
                                      disabled={isInterviewSubmitting || !interviewFeedbackInput.trim()}
                                      onClick={() => handleInterviewSubmit(selectedCandidate.id, "fail", interviewFeedbackInput)}
                                      className="text-[10px] font-bold"
                                    >
                                      {isInterviewSubmitting ? "Updating..." : "✗ Reject Candidate"}
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Selected Stage */}
                            {selectedCandidate.status === "selected" && (
                              <div className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 rounded-lg border border-emerald-100/60 dark:border-emerald-950/30 space-y-2.5">
                                <span className="block text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-450">
                                  🎉 Candidate Selected
                                </span>
                                <p className="text-[10px] text-muted-foreground dark:text-slate-350 leading-normal">
                                  The candidate has successfully cleared all selection rounds! You can now migrate their file and initiate the employee onboarding workflow in Keka HRMS.
                                </p>
                                <Button 
                                  variant="success" 
                                  size="sm" 
                                  disabled={isOnboardingSubmitting}
                                  onClick={() => handleOnboardSubmit(selectedCandidate.id)}
                                  className="w-full text-[10px] font-bold mt-1.5"
                                >
                                  {isOnboardingSubmitting ? "Migrating..." : "🚚 Initiate Keka HRMS Onboarding"}
                                </Button>
                              </div>
                            )}

                            {/* Onboarded Stage */}
                            {selectedCandidate.status === "onboarded" && (
                              <div className="p-3 bg-emerald-50/30 dark:bg-emerald-950/10 rounded-lg border border-emerald-100/60 dark:border-emerald-950/30 space-y-2 text-center">
                                <span className="text-emerald-500 text-lg block font-bold">✓</span>
                                <span className="block text-[11px] font-bold text-emerald-800 dark:text-emerald-450">
                                  Moved to Keka Onboarding Workflow
                                </span>
                                <p className="text-[9.5px] text-muted-foreground">
                                  Candidate data successfully synced with HRMS. The onboarding checklist is now active in Keka.
                                </p>
                              </div>
                            )}

                            {/* Auto Rejected Stage */}
                            {selectedCandidate.status === "rejected" && (
                              <div className="p-3 bg-red-50/50 dark:bg-red-950/10 rounded-lg border border-red-150 dark:border-red-950/30 space-y-1.5 select-text">
                                <span className="block text-[10px] uppercase font-bold text-rose-700 dark:text-rose-450">
                                  ✗ Candidate Rejected
                                </span>
                                <div className="text-[9.5px] text-muted-foreground font-semibold space-y-1">
                                  <p><strong>HRMS Status:</strong> Moved to Keka Rejected Pool</p>
                                  {selectedCandidate.assessmentScore !== undefined && (
                                    <p><strong>Test Result:</strong> Failed ({selectedCandidate.assessmentScore}/100)</p>
                                  )}
                                  {selectedCandidate.interviewFeedback && (
                                    <p><strong>Interview Feedback:</strong> "{selectedCandidate.interviewFeedback}"</p>
                                  )}
                                  <p><strong>Logged details:</strong> Historical archive complete.</p>
                                </div>
                              </div>
                            )}

                            {/* Activity Logs Panel */}
                            {selectedCandidate.activityLogs && selectedCandidate.activityLogs.length > 0 && (
                              <div className="p-2.5 bg-secondary/40/10 rounded border border-border/50 space-y-1.5 select-text">
                                <span className="block text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                                  Pipeline Activity Audit Logs
                                </span>
                                <div className="max-h-[100px] overflow-y-auto custom-scrollbar space-y-1 text-[9px] font-medium text-muted-foreground leading-normal">
                                  {selectedCandidate.activityLogs.map((log, idx) => (
                                    <div key={idx} className="flex gap-1.5 items-start">
                                      <span className="text-slate-400 font-mono flex-shrink-0">
                                        [{new Date(log.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]
                                      </span>
                                      <span>{log.message}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                          </div>

                        </CardContent>
                        
                        {/* 5. HIRING DECISION ACTIONS */}
                        <CardFooter className="pb-5 pt-0 grid grid-cols-2 gap-2 mt-4">
                          <Button 
                            variant="success" 
                            size="sm"
                            onClick={() => handleDecision(selectedCandidate.id, "shortlisted")}
                            className="text-xs font-bold"
                          >
                            ✓ Shortlist
                          </Button>
                          <Button 
                            variant="info" 
                            size="sm"
                            onClick={() => handleDecision(selectedCandidate.id, "interviewing")}
                            className="text-xs font-bold"
                          >
                            ✉ Invite Interview
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDecision(selectedCandidate.id, "hold")}
                            className="text-xs font-semibold border-border text-foreground/90 dark:text-slate-250 border-border"
                          >
                            Hold
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleDecision(selectedCandidate.id, "rejected")}
                            className="text-xs font-bold"
                          >
                            Reject
                          </Button>
                        </CardFooter>
                      </Card>
                    ) : (
                      <Card className="shadow-sm border-border bg-card h-[400px] flex items-center justify-center p-6 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <User className="h-10 w-10 text-slate-300" />
                          <p className="text-xs font-bold">No Candidate Selected</p>
                          <p className="text-[10px] max-w-xs leading-normal text-muted-foreground mt-0.5">Select an analyzed candidate from the list on the left to review match details, risk levels, and issue decision updates.</p>
                        </div>
                      </Card>
                    )}
                  </div>

                </div>

              </motion.div>
            )}

            {/* VIEW B: GENERAL DASHBOARD OVERVIEW */}
            {activeTab === "dashboard" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                
                {/* Stats row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { title: "Total Screened", value: totalScreenedCount, desc: "Evaluated this month", change: "+14.2%" },
                    { title: "Pass Rate", value: passRate, desc: "Match Score >= 70%", change: "+4.1%" },
                    { title: "Average AI Score", value: avgScore, desc: "Across all candidates", change: "+1.3%" },
                    { title: "Time to Screen", value: timeToScreen, desc: "Average system duration", change: "-0.5s" },
                  ].map((stat, i) => (
                    <Card key={i} className="shadow-sm border-border bg-card">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">{stat.title}</span>
                          <span className="block text-2xl font-bold text-foreground dark:text-slate-50 tracking-tight">{stat.value}</span>
                          <span className="block text-[10px] text-muted-foreground font-semibold">{stat.desc}</span>
                        </div>
                        <div className="text-right">
                          <Badge variant="success" className="text-[9px] px-1.5 font-bold">
                            {stat.change}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Dashboard Analytics & ranked list split */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Left block (charts) lg:col-span-8 */}
                  <div className="lg:col-span-8 space-y-6">
                    <Card className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Evaluation Funnel</CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground">Pass through metrics across candidates pipelines.</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dynamicFunnelData} layout="vertical" barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis type="number" stroke="#94a3b8" fontSize={9} />
                            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={9} width={120} />
                            <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '4px' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                              {dynamicFunnelData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    {/* Table View of Rankings */}
                    <Card className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Enterprise Candidate Rankings</CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground">Consolidated evaluation leaderboard for active departments.</CardDescription>
                      </CardHeader>
                      <CardContent className="p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[50px] pl-4">Rank</TableHead>
                              <TableHead>Candidate Name</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead>Experience</TableHead>
                              <TableHead>Match %</TableHead>
                              <TableHead>AI Score</TableHead>
                              <TableHead className="pr-4">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {candidates.map((c, idx) => (
                              <TableRow key={c.id}>
                                <TableCell className="pl-4 text-xs font-semibold text-muted-foreground/80">#{idx + 1}</TableCell>
                                <TableCell className="font-bold text-xs text-foreground dark:text-slate-100">{c.name}</TableCell>
                                <TableCell className="text-xs text-muted-foreground font-semibold">{c.role}</TableCell>
                                <TableCell className="text-xs text-muted-foreground font-semibold">{c.experienceYears} Years</TableCell>
                                <TableCell className="text-xs font-bold text-muted-foreground">{c.matchPercent}%</TableCell>
                                <TableCell>
                                  <span className={`text-xs font-bold ${
                                    c.score >= 85 ? "text-emerald-600" : c.score >= 70 ? "text-amber-600" : "text-red-500"
                                  }`}>
                                    {c.score}/100
                                  </span>
                                </TableCell>
                                <TableCell className="pr-4">
                                  <Badge 
                                    variant={
                                      c.status === "shortlisted" ? "success" : 
                                      c.status === "interviewing" ? "purple" : 
                                      c.status === "hold" ? "warning" : 
                                      c.status === "rejected" ? "destructive" : "secondary"
                                    }
                                    className="text-[9px] uppercase tracking-wider py-0"
                                  >
                                    {c.status}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right block lg:col-span-4 */}
                  <div className="lg:col-span-4 space-y-6">
                    <Card className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Match Distribution</CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground">Percentage ratio of screening scores.</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[200px] flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dynamicPieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {dynamicPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: '10px' }} />
                            <Legend verticalAlign="bottom" height={36} iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '9px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <Card className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-border">
                        <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Recent Audit Logs</CardTitle>
                        <CardDescription className="text-[10px] text-muted-foreground">AI screening pipeline activities.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3.5">
                        {[
                          { time: "10 mins ago", candidate: "David Chen", action: "Resume parsed & matched (76%)" },
                          { time: "2 hrs ago", candidate: "Sarah Jenkins", action: "Shortlist status update & HR notified" },
                          { time: "1 day ago", candidate: "Arjun Mehta", action: "Matched & added to Keka ATS" },
                        ].map((log, i) => (
                          <div key={i} className="flex gap-3 text-xs leading-normal">
                            <span className="text-[9px] text-muted-foreground font-mono w-20 flex-shrink-0 pt-0.5">{log.time}</span>
                            <div>
                              <strong className="text-foreground block font-bold">{log.candidate}</strong>
                              <span className="text-muted-foreground text-[10px] block mt-0.5 font-semibold">{log.action}</span>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>

                </div>

              </motion.div>
            )}

            {/* VIEW C: CANDIDATES DATABASE */}
            {activeTab === "candidates" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                <Card className="shadow-sm border-border bg-card">
                  <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Candidate Pipeline Database</CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground">Search, filter and access evaluations logs.</CardDescription>
                    </div>
                    <div className="relative w-72">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input 
                        type="text"
                        placeholder="Search name, skills or role..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-secondary/40 border border-border rounded-md pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-semibold"
                      />
                    </div>
                  </CardHeader>

                  {/* Filter Toolbar */}
                  <div className="px-6 py-2.5 border-b border-border bg-secondary/40 flex flex-wrap items-center gap-4 text-xs select-none">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase font-bold text-slate-455 dark:text-muted-foreground">Match Rating:</span>
                      <select 
                        value={scoreFilter} 
                        onChange={(e) => setScoreFilter(e.target.value)}
                        className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer focus:border-slate-400 dark:focus:border-slate-700"
                      >
                        <option value="all">All Match Ratings</option>
                        <option value="high">High Match (≥85%)</option>
                        <option value="moderate">Moderate Match (50-80%)</option>
                        <option value="low">{"Low Match (<50%)"}</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase font-bold text-slate-455 dark:text-muted-foreground">Pipeline Status:</span>
                      <select 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer focus:border-slate-400 dark:focus:border-slate-700"
                      >
                        <option value="all">All Statuses</option>
                        <option value="applied">Applied</option>
                        <option value="shortlisted">Shortlisted</option>
                        <option value="interviewing">Interviewing</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase font-bold text-slate-455 dark:text-muted-foreground">Experience:</span>
                      <select 
                        value={expFilter} 
                        onChange={(e) => setExpFilter(e.target.value)}
                        className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer focus:border-slate-400 dark:focus:border-slate-700"
                      >
                        <option value="all">All Experience Levels</option>
                        <option value="entry">Entry (0-2 Yrs)</option>
                        <option value="mid">Mid (3-5 Yrs)</option>
                        <option value="senior">Senior (6+ Yrs)</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase font-bold text-slate-455 dark:text-muted-foreground">Target Role:</span>
                      <select 
                        value={roleFilter} 
                        onChange={(e) => setRoleFilter(e.target.value)}
                        className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer focus:border-slate-400 dark:focus:border-slate-700"
                      >
                        <option value="all">All Roles</option>
                        {uniqueRoles.map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </div>

                    {(scoreFilter !== "all" || statusFilter !== "all" || expFilter !== "all" || roleFilter !== "all" || searchQuery !== "") && (
                      <button 
                        onClick={() => {
                          setScoreFilter("all")
                          setStatusFilter("all")
                          setExpFilter("all")
                          setRoleFilter("all")
                          setSearchQuery("")
                        }}
                        className="text-[9px] font-bold text-muted-foreground hover:text-foreground dark:hover:text-slate-200 uppercase transition-colors mr-2"
                      >
                        Clear All Filters
                      </button>
                    )}

                    <button 
                      onClick={exportToCSV}
                      className="flex items-center gap-1.5 text-[9px] font-bold text-slate-100 hover:text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md px-3 py-1 uppercase transition-colors shadow-sm ml-auto cursor-pointer"
                    >
                      <FileDown className="h-3 w-3" />
                      Export CSV / Excel
                    </button>
                  </div>

                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-6">Candidate Name</TableHead>
                          <TableHead>Target Role</TableHead>
                          <TableHead>Experience</TableHead>
                          <TableHead>Date Parsed</TableHead>
                          <TableHead>Top Skills Matched</TableHead>
                          <TableHead>Match Rating</TableHead>
                          <TableHead>Pipeline Status</TableHead>
                          <TableHead className="pr-6 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCandidates.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-12 text-muted-foreground/80 dark:text-muted-foreground font-semibold text-xs bg-secondary/40/10 dark:bg-transparent">
                              No candidates found matching the selected search and filter criteria.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredCandidates.map(c => (
                            <TableRow 
                              key={c.id}
                              onClick={() => {
                                setSelectedCandidate(c)
                                setActiveTab("screening")
                              }}
                              className="cursor-pointer"
                            >
                              <TableCell className="pl-6">
                                <div>
                                  <span className="text-xs font-bold block text-foreground">{c.name}</span>
                                  <span className="text-[10px] text-muted-foreground font-semibold block mt-0.5">{c.email}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-foreground font-semibold">{c.role}</TableCell>
                              <TableCell className="text-xs text-muted-foreground font-semibold">{c.experienceYears} Years</TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono font-semibold">{c.appliedDate}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-[280px]">
                                  {c.matchedSkills.map(s => (
                                    <Badge key={s} variant="outline" className="text-[8px] bg-secondary/40 px-1 border border-border text-foreground/90 font-semibold select-none">
                                      {s}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-bold ${
                                    c.score >= 85 ? "text-emerald-600" : c.score >= 70 ? "text-amber-600" : "text-red-500"
                                  }`}>
                                    {c.score}%
                                  </span>
                                  <div className="w-16 h-1 bg-secondary rounded-full overflow-hidden select-none">
                                    <div 
                                      className={`h-full ${
                                        c.score >= 85 ? "bg-emerald-500" : c.score >= 70 ? "bg-amber-500" : "bg-red-500"
                                      }`} 
                                      style={{ width: `${c.score}%` }} 
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={
                                    c.status === "shortlisted" ? "success" : 
                                    c.status === "interviewing" ? "purple" : 
                                    c.status === "hold" ? "warning" : 
                                    c.status === "rejected" ? "destructive" : "secondary"
                                  }
                                  className="text-[9px] uppercase tracking-wider py-0"
                                >
                                  {c.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleDeleteCandidate(c.id)}
                                  className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                                  title="Delete candidate"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* VIEW D: ACTIVE JOBS LIST */}
            {activeTab === "jobs" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Enterprise Job Listings</h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">Manage positions and respective AI search vectors.</p>
                  </div>
                  <Button 
                    variant="default" 
                    size="sm" 
                    className="text-xs font-semibold gap-1.5"
                    onClick={() => {
                      setActiveTab("screening")
                      setImportTab("url")
                      toast.info("Import a new Job Description workspace.")
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Import New Position
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {jobs.map((job, i) => (
                    <Card key={i} className="shadow-sm border-border bg-card">
                      <CardHeader className="pb-3 border-b border-slate-105 dark:border-slate-900/60">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-sm font-bold text-foreground">{job.title}</CardTitle>
                            <CardDescription className="text-[10px] mt-0.5 font-semibold">{job.dept} • {job.loc}</CardDescription>
                          </div>
                          <Badge variant={job.status === "Active" ? "success" : "secondary"} className="text-[8px] uppercase tracking-wider">
                            {job.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 text-xs space-y-2">
                        <div className="flex justify-between text-[11px] text-muted-foreground font-semibold">
                          <span>Experience Vector:</span>
                          <span className="font-bold text-foreground">{job.exp}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-muted-foreground font-semibold">
                          <span>Candidates Evaluated:</span>
                          <span className="font-bold text-foreground">{job.candidates}</span>
                        </div>
                      </CardContent>
                      <CardFooter className="pb-4 pt-0 flex justify-between gap-2 border-t border-border/60 mt-3">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-xs mt-3 border-border text-foreground/90 border-border font-semibold"
                          onClick={() => {
                            setActiveJD(job.jd)
                            setActiveTab("screening")
                            toast.info(`Swapped active workspace context to "${job.title}"`)
                          }}
                        >
                          Select Position
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}

            {/* VIEW assessments: AI ASSESSMENTS DASHBOARD */}
            {activeTab === "assessments" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {/* Metrics Summary Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 select-none">
                  {[
                    { 
                      title: "Total Invited", 
                      value: candidates.filter(c => c.assessmentToken).length, 
                      desc: "Sent assessment link",
                      icon: FileText,
                      color: "text-blue-500"
                    },
                    { 
                      title: "Tests Completed", 
                      value: candidates.filter(c => c.assessmentStatus === "passed" || c.assessmentStatus === "failed").length, 
                      desc: "Completed submissions",
                      icon: CheckCircle2,
                      color: "text-emerald-500"
                    },
                    { 
                      title: "Pending Attempts", 
                      value: candidates.filter(c => c.assessmentStatus === "pending").length, 
                      desc: "Link active / in-progress",
                      icon: Clock,
                      color: "text-amber-500"
                    },
                    { 
                      title: "Test Pass Rate", 
                      value: `${Math.round((candidates.filter(c => c.assessmentStatus === "passed").length / Math.max(1, candidates.filter(c => c.assessmentStatus === "passed" || c.assessmentStatus === "failed").length)) * 100)}%`, 
                      desc: "Score >= 70% threshold",
                      icon: Award,
                      color: "text-indigo-500"
                    }
                  ].map((stat, i) => {
                    const Icon = stat.icon;
                    return (
                      <Card key={i} className="shadow-sm border-border bg-card">
                        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{stat.title}</span>
                          <Icon className={`h-4.5 w-4.5 ${stat.color}`} />
                        </CardHeader>
                        <CardContent className="pb-4">
                          <div className="text-2xl font-bold tracking-tight text-foreground">{stat.value}</div>
                          <span className="text-[9px] text-muted-foreground/80 dark:text-muted-foreground mt-1 block font-semibold">{stat.desc}</span>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Main Dashboard Card */}
                <Card className="shadow-sm border-border bg-card">
                  <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">AI Assessment Dashboard</CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground">Track candidate test results, final score weights, and cheating violations.</CardDescription>
                    </div>
                    
                    {/* Search Field */}
                    <div className="relative w-72">
                      <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input 
                        type="text"
                        placeholder="Search name or role..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-secondary/40 border border-border rounded-md pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground font-semibold"
                      />
                    </div>
                  </CardHeader>

                  {/* Filter Toolbar */}
                  <div className="px-6 py-2.5 border-b border-border bg-secondary/40 flex flex-wrap items-center gap-4 text-xs select-none">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase font-bold text-slate-455 dark:text-muted-foreground">Test Status:</span>
                      <select 
                        value={assessmentStatusFilter} 
                        onChange={(e) => setAssessmentStatusFilter(e.target.value)}
                        className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer focus:border-slate-400 dark:focus:border-slate-700"
                      >
                        <option value="all">All Test Statuses</option>
                        <option value="pending">Pending Attempt</option>
                        <option value="passed">Passed Assessment</option>
                        <option value="failed">Failed Assessment</option>
                        <option value="not_invited">Not Yet Invited</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] uppercase font-bold text-slate-455 dark:text-muted-foreground">HR Rank:</span>
                      <select 
                        value={statusFilter} 
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-white dark:bg-[#090d16] border border-border rounded px-2 py-0.5 outline-none text-[11px] font-semibold text-foreground/90 cursor-pointer focus:border-slate-400 dark:focus:border-slate-700"
                      >
                        <option value="all">All Ranks</option>
                        <option value="Qualified">Qualified (≥80%)</option>
                        <option value="Review">Review (60-79%)</option>
                        <option value="Rejected">Rejected (&lt;60%)</option>
                        <option value="shortlisted">Shortlisted (Resume Passed)</option>
                      </select>
                    </div>
                  </div>

                  {/* Table Component */}
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-b border-slate-150 dark:border-slate-900 bg-secondary/30 dark:bg-slate-950/20 hover:bg-transparent text-[9.5px] uppercase font-bold text-muted-foreground tracking-wider">
                            <TableHead className="py-3 pl-6">Candidate Name</TableHead>
                            <TableHead className="py-3">Job Role</TableHead>
                            <TableHead className="py-3 text-center">Resume Score</TableHead>
                            <TableHead className="py-3 text-center">Test Score</TableHead>
                            <TableHead className="py-3 text-center font-bold">Final Score</TableHead>
                            <TableHead className="py-3 text-center">Violations</TableHead>
                            <TableHead className="py-3 text-center">Test Status</TableHead>
                            <TableHead className="py-3 text-center">HR Ranking</TableHead>
                            <TableHead className="py-3 text-center">Submit Date</TableHead>
                            <TableHead className="py-3 pr-6 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          {(() => {
                            const filtered = candidates.filter(c => {
                              // Search
                              const q = searchQuery.toLowerCase();
                              const nameMatch = c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q);
                              if (!nameMatch) return false;

                              // HR Rank filter
                              if (statusFilter !== "all" && c.status !== statusFilter) return false;

                              // Test Status Filter
                              if (assessmentStatusFilter !== "all") {
                                if (assessmentStatusFilter === "not_invited" && c.assessmentToken) return false;
                                if (assessmentStatusFilter === "pending" && c.assessmentStatus !== "pending") return false;
                                if (assessmentStatusFilter === "passed" && c.assessmentStatus !== "passed") return false;
                                if (assessmentStatusFilter === "failed" && c.assessmentStatus !== "failed") return false;
                                if (["pending", "passed", "failed"].includes(assessmentStatusFilter) && !c.assessmentToken) return false;
                              }

                              return true;
                            });

                            if (filtered.length === 0) {
                              return (
                                <TableRow>
                                  <TableCell colSpan={10} className="py-12 text-center text-slate-400 font-medium">
                                    No candidates matching the selected filters were found.
                                  </TableCell>
                                </TableRow>
                              );
                            }

                            return filtered.map(c => {
                              const resumeScore = c.score || 0;
                              const testScore = c.assessmentScore;
                              const finalScore = c.finalScore;
                              const violations = c.violationCount || 0;
                              const isInvited = !!c.assessmentToken;
                              const testStatus = c.assessmentStatus;
                              const submissionDate = c.assessmentCompletedAt 
                                ? new Date(c.assessmentCompletedAt).toLocaleDateString()
                                : null;

                              return (
                                <TableRow key={c.id} className="border-b border-border/50 hover:bg-secondary/40/30 dark:hover:bg-slate-900/10">
                                  {/* Name & Email */}
                                  <TableCell className="py-3.5 pl-6 font-semibold text-foreground">
                                    <div className="flex flex-col">
                                      <span>{c.name}</span>
                                      <span className="text-[10px] text-muted-foreground font-medium">{c.email}</span>
                                    </div>
                                  </TableCell>

                                  {/* Role */}
                                  <TableCell className="py-3.5 text-muted-foreground dark:text-slate-350 font-medium">
                                    {c.role}
                                  </TableCell>

                                  {/* Resume Score */}
                                  <TableCell className="py-3.5 text-center">
                                    <Badge variant="outline" className="text-[10px] font-mono font-bold bg-secondary/30 border-border text-foreground/90 dark:bg-slate-900/20 border-border dark:text-slate-300">
                                      {resumeScore}%
                                    </Badge>
                                  </TableCell>

                                  {/* Test Score */}
                                  <TableCell className="py-3.5 text-center">
                                    {testScore !== undefined && testScore !== null ? (
                                      <Badge variant="outline" className={`text-[10px] font-mono font-bold ${
                                        testScore >= 70 
                                          ? "bg-emerald-950/10 border-emerald-500/20 text-emerald-500" 
                                          : "bg-rose-950/10 border-rose-500/20 text-rose-500"
                                      }`}>
                                        {testScore}%
                                      </Badge>
                                    ) : isInvited ? (
                                      <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider flex items-center justify-center gap-1 select-none">
                                        <Clock className="h-3 w-3" /> Sent
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider select-none">—</span>
                                    )}
                                  </TableCell>

                                  {/* Final Integrated Score */}
                                  <TableCell className="py-3.5 text-center font-bold">
                                    {finalScore !== undefined && finalScore !== null ? (
                                      <Badge className={`text-[10px] font-mono font-extrabold px-2 ${
                                        finalScore >= 80 
                                          ? "bg-emerald-500 text-foreground" 
                                          : finalScore >= 60 
                                          ? "bg-amber-500 text-foreground" 
                                          : "bg-rose-500 text-white"
                                      }`}>
                                        {Number(finalScore).toFixed(1)}%
                                      </Badge>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider select-none">—</span>
                                    )}
                                  </TableCell>

                                  {/* Violations */}
                                  <TableCell className="py-3.5 text-center">
                                    {isInvited && testStatus ? (
                                      <Badge variant="outline" className={`text-[10px] font-mono font-bold px-2 py-0.5 border ${
                                        violations > 0 
                                          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-950/20 dark:bg-rose-950/10 dark:text-rose-400" 
                                          : "border-border bg-secondary/40 text-muted-foreground border-border dark:bg-slate-900/20"
                                      }`}>
                                        {violations} {violations === 1 ? "violation" : "violations"}
                                      </Badge>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider select-none">—</span>
                                    )}
                                  </TableCell>

                                  {/* Test Status */}
                                  <TableCell className="py-3.5 text-center">
                                    {testStatus ? (
                                      <Badge variant="outline" className={`text-[9.5px] font-bold uppercase px-2 py-0 border ${
                                        testStatus === "passed"
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-950/20 dark:bg-emerald-950/10 dark:text-emerald-450"
                                          : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-950/20 dark:bg-rose-950/10 dark:text-rose-450"
                                      }`}>
                                        {testStatus}
                                      </Badge>
                                    ) : isInvited ? (
                                      <Badge variant="outline" className="text-[9.5px] font-bold uppercase px-2 py-0 border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-950/20 dark:bg-amber-950/10 dark:text-amber-450">
                                        Pending
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[9.5px] font-bold uppercase px-2 py-0 border-border bg-secondary/40 text-slate-400 dark:border-slate-850 dark:bg-transparent">
                                        Not Invited
                                      </Badge>
                                    )}
                                  </TableCell>

                                  {/* HR Ranking Status */}
                                  <TableCell className="py-3.5 text-center">
                                    <Badge variant="outline" className={`text-[9.5px] font-bold uppercase tracking-wider px-2 py-0 border ${
                                      c.status === "Qualified" || c.status === "interviewing" || c.status === "selected" || c.status === "onboarded"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-950/20 dark:bg-emerald-950/10 dark:text-emerald-450" :
                                      c.status === "Review"
                                        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-950/20 dark:bg-amber-950/10 dark:text-amber-450" :
                                      c.status === "Rejected" || c.status === "rejected"
                                        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-950/20 dark:bg-rose-950/10 dark:text-rose-400" :
                                      "border-border bg-secondary/40 text-muted-foreground border-border dark:bg-slate-900/20 dark:text-slate-400"
                                    }`}>
                                      {c.status}
                                    </Badge>
                                  </TableCell>

                                  {/* Submit Date */}
                                  <TableCell className="py-3.5 text-center font-mono font-medium text-muted-foreground select-none">
                                    {submissionDate || "—"}
                                  </TableCell>

                                  {/* Actions */}
                                  <TableCell className="py-3.5 pr-6 text-right space-x-2">
                                    {!isInvited && resumeScore >= 70 && (
                                      <Button 
                                        size="sm"
                                        className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-secondary dark:hover:bg-white dark:text-foreground text-[10px] px-2 py-1 font-bold rounded"
                                        onClick={() => handleSendAssessmentInvite(c.id)}
                                        disabled={isSendingInvite[c.id]}
                                      >
                                        Send Invite
                                      </Button>
                                    )}
                                    {isInvited && testStatus === "pending" && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="text-[10px] px-2 py-1 font-bold rounded border-border text-foreground/90 border-border dark:text-slate-350 cursor-pointer"
                                          onClick={() => {
                                            const inviteUrl = `${window.location.origin.includes("localhost") ? "https://resume-screening-app-sage.vercel.app" : window.location.origin}/assessment/${c.assessmentToken}`;
                                            copyToClipboard(inviteUrl);
                                          }}
                                        >
                                          Copy Link
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-secondary dark:hover:bg-white dark:text-foreground text-[10px] px-2 py-1 font-bold rounded cursor-pointer"
                                          onClick={() => handleSendAssessmentInvite(c.id)}
                                          disabled={isSendingInvite[c.id]}
                                        >
                                          Resend
                                        </Button>
                                      </>
                                    )}
                                    {isInvited && testStatus && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="text-[10px] px-2 py-1 font-bold rounded border-border text-muted-foreground border-border dark:text-muted-foreground/80 cursor-pointer"
                                        onClick={() => {
                                          setSelectedCandidate(c);
                                          setActiveTab("candidates");
                                          toast.info(`Swapped candidate view to audit logs for ${c.name}`);
                                        }}
                                      >
                                        Audit Logs
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })()}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* VIEW E: ATS PIPELINE BOARD */}
            {activeTab === "pipeline" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-6 h-full flex flex-col"
              >
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">ATS Pipeline Stages</h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">Drag-and-drop simulated board mapping candidate workflows.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 overflow-x-auto custom-scrollbar pb-4 items-start">
                  
                  {/* Applied Column */}
                  <div className="bg-secondary/40 dark:bg-slate-900/40 border border-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-bold uppercase text-muted-foreground">Applied ({candidates.filter(c => c.status === "applied").length})</span>
                    </div>
                    {candidates.filter(c => c.status === "applied").map(c => (
                      <Card 
                        key={c.id} 
                        className="shadow-sm border-border cursor-pointer hover:border-slate-400 dark:hover:border-slate-700 bg-card"
                        onClick={() => {
                          setSelectedCandidate(c)
                          setActiveTab("screening")
                        }}
                      >
                        <CardContent className="p-3 space-y-2 text-xs">
                          <span className="font-bold text-xs block truncate text-foreground">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground block truncate">{c.role}</span>
                          <div className="flex items-center justify-between mt-2.5">
                            <Badge variant="outline" className="text-[8px] font-mono px-1 bg-secondary/40">{c.experienceYears} yrs exp</Badge>
                            <span className="text-xs font-bold text-amber-600">{c.score}%</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Shortlisted Column */}
                  <div className="bg-secondary/40 dark:bg-slate-900/40 border border-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-bold uppercase text-emerald-600">Shortlisted ({candidates.filter(c => c.status === "shortlisted").length})</span>
                    </div>
                    {candidates.filter(c => c.status === "shortlisted").map(c => (
                      <Card 
                        key={c.id} 
                        className="shadow-sm border-border cursor-pointer hover:border-slate-400 dark:hover:border-slate-700 bg-card"
                        onClick={() => {
                          setSelectedCandidate(c)
                          setActiveTab("screening")
                        }}
                      >
                        <CardContent className="p-3 space-y-2 text-xs">
                          <span className="font-bold text-xs block truncate text-foreground">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground block truncate">{c.role}</span>
                          <div className="flex items-center justify-between mt-2.5">
                            <Badge variant="outline" className="text-[8px] font-mono px-1 bg-secondary/40">{c.experienceYears} yrs exp</Badge>
                            <span className="text-xs font-bold text-emerald-650">{c.score}%</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Interview Column */}
                  <div className="bg-secondary/40 dark:bg-slate-900/40 border border-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-bold uppercase text-indigo-600">Interviewing ({candidates.filter(c => c.status === "interviewing").length})</span>
                    </div>
                    {candidates.filter(c => c.status === "interviewing").map(c => (
                      <Card 
                        key={c.id} 
                        className="shadow-sm border-border cursor-pointer hover:border-slate-400 dark:hover:border-slate-700 bg-card"
                        onClick={() => {
                          setSelectedCandidate(c)
                          setActiveTab("screening")
                        }}
                      >
                        <CardContent className="p-3 space-y-2 text-xs">
                          <span className="font-bold text-xs block truncate text-foreground">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground block truncate">{c.role}</span>
                          <div className="flex items-center justify-between mt-2.5">
                            <Badge variant="outline" className="text-[8px] font-mono px-1 bg-secondary/40">{c.experienceYears} yrs exp</Badge>
                            <span className="text-xs font-bold text-indigo-600">{c.score}%</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Hold / Rejected Column */}
                  <div className="bg-secondary/40 dark:bg-slate-900/40 border border-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-bold uppercase text-rose-600">Hold / Rejected ({candidates.filter(c => c.status === "hold" || c.status === "rejected").length})</span>
                    </div>
                    {candidates.filter(c => c.status === "hold" || c.status === "rejected").map(c => (
                      <Card 
                        key={c.id} 
                        className="shadow-sm border-border cursor-pointer hover:border-slate-400 dark:hover:border-slate-700 bg-card opacity-70"
                        onClick={() => {
                          setSelectedCandidate(c)
                          setActiveTab("screening")
                        }}
                      >
                        <CardContent className="p-3 space-y-2 text-xs">
                          <span className="font-bold text-xs block truncate text-foreground">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground block truncate">{c.role}</span>
                          <div className="flex items-center justify-between mt-2.5">
                            <Badge 
                              variant={c.status === "hold" ? "warning" : "destructive"}
                              className="text-[8px] px-1 py-0 uppercase"
                            >
                              {c.status}
                            </Badge>
                            <span className="text-xs font-bold text-slate-400">{c.score}%</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                </div>
              </motion.div>
            )}

            {/* VIEW F: ANALYTICS OVERVIEW */}
            {activeTab === "analytics" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Recruitment Performance Metrics</h2>
                  <p className="text-[10px] text-slate-505 mt-0.5 font-semibold">Advanced charts monitoring conversion volumes and candidate distribution.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Daily Volume */}
                  <Card className="shadow-sm border-border bg-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-805 dark:text-slate-200">Daily Upload Volume</CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground">Evaluations triggered per week-day cycle.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={dynamicVolumeData}>
                          <defs>
                            <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#475569" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="#475569" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                          <YAxis stroke="#94a3b8" fontSize={10} />
                          <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '4px' }} />
                          <Area type="monotone" dataKey="Volume" stroke="#475569" strokeWidth={1.5} fillOpacity={1} fill="url(#colorVolume)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Pie distribution */}
                  <Card className="shadow-sm border-border bg-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xs uppercase tracking-wider font-bold text-slate-805 dark:text-slate-200">Candidate Score Split</CardTitle>
                      <CardDescription className="text-[10px] text-muted-foreground">Division ratio of compatibility brackets.</CardDescription>
                    </CardHeader>
                    <CardContent className="h-[250px] flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dynamicPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={95}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {dynamicPieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ fontSize: '10px' }} />
                          <Legend verticalAlign="bottom" height={36} iconSize={8} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                </div>
              </motion.div>
            )}

            {/* VIEW G: SYSTEM SETTINGS */}
            {activeTab === "settings" && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15 }}
                className="max-w-2xl space-y-6"
              >
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Workspace Integrations</h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold">Manage ATS endpoints, credits, and evaluation weights.</p>
                </div>

                <Card className="shadow-sm border-border bg-card">
                  <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">DeepSeek API Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3 text-xs">
                    <div className="space-y-1">
                      <span className="block text-[10px] uppercase font-bold text-muted-foreground">API Gateway Key</span>
                      <input 
                        type="password" 
                        value="••••••••••••••••••••••••••••••••••••••••" 
                        disabled 
                        className="w-full bg-secondary border border-border rounded px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground outline-none select-all"
                      />
                      <span className="text-[9px] text-muted-foreground/80 block mt-1">Configured securely in environment variables (`DEEPSEEK_API_KEY`)</span>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <span className="block text-[10px] uppercase font-bold text-muted-foreground">Model Temperature</span>
                      <div className="flex items-center gap-3">
                        <input type="range" min="0" max="1" step="0.1" defaultValue="0.3" disabled className="w-1/3 accent-slate-850" />
                        <span className="text-xs font-bold text-muted-foreground">0.3 (Deterministic default)</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm border-border bg-card">
                  <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">ATS & Google Sheets Synchronizations</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4 text-xs">
                    <div className="space-y-1 pb-3 border-b border-border">
                      <span className="block text-[10px] uppercase font-bold text-muted-foreground">Google Sheets / Webhook Sync URL</span>
                      <input 
                        type="url" 
                        placeholder="e.g. https://script.google.com/macros/s/... or https://hooks.zapier.com/..." 
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        className="w-full bg-secondary/40 border border-border rounded px-2.5 py-1.5 font-sans text-[11px] text-foreground outline-none focus:ring-1 focus:ring-ring font-semibold"
                      />
                      <span className="text-[9px] text-slate-400 block mt-1 leading-normal">
                        Input a Google App Script, Zapier, or Make Webhook. When a candidate's pipeline status is updated, the profile is posted instantly.
                      </span>
                    </div>

                    {[
                      { name: "Keka HR Integration", desc: "Auto-sync shortlisted candidates to hiring stages.", status: "Enabled" },
                      { name: "Slack Notifications", desc: "Notify team channels on new high-match (score >85%) parses.", status: "Enabled" },
                      { name: "Google Sheets Sync", desc: "Sync candidate updates to your sheet using the webhook URL.", status: webhookUrl.trim() !== "" ? "Enabled" : "Disabled" },
                    ].map((integration, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <strong className="text-foreground font-bold block">{integration.name}</strong>
                          <span className="text-slate-455 text-[10px] block mt-0.5 font-semibold">{integration.desc}</span>
                        </div>
                        <Badge variant={integration.status === "Enabled" ? "success" : "secondary"} className="text-[9px] font-bold">
                          {integration.status}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            )}

          </AnimatePresence>

        </main>
      </div>

    </div>
  )
}
