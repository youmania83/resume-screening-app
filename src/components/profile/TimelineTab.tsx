"use client";
import React from "react";
import { Clock, UserPlus, Upload, Award, FileText, Send, MessageSquare, CheckCircle, XCircle, UserCheck, Calendar } from "lucide-react";

interface TimelineEvent {
  id: string;
  candidate_id: string;
  event_type: string;
  title: string;
  description?: string;
  created_by?: string;
  creator_name?: string;
  created_at: string;
}

interface TimelineTabProps {
  timeline: TimelineEvent[];
}

export default function TimelineTab({ timeline }: TimelineTabProps) {
  const getEventStyles = (type: string) => {
    switch (type) {
      case "created":
        return {
          icon: <UserPlus size={16} />,
          iconBg: "bg-violet-950 text-violet-400 border-violet-800/40",
          barColor: "bg-violet-800/20",
        };
      case "resume_uploaded":
        return {
          icon: <Upload size={16} />,
          iconBg: "bg-indigo-950 text-indigo-400 border-indigo-800/40",
          barColor: "bg-indigo-800/20",
        };
      case "resume_parsed":
        return {
          icon: <FileText size={16} />,
          iconBg: "bg-cyan-950 text-cyan-400 border-cyan-800/40",
          barColor: "bg-cyan-800/20",
        };
      case "ai_screened":
        return {
          icon: <Award size={16} />,
          iconBg: "bg-pink-950 text-pink-400 border-pink-800/40",
          barColor: "bg-pink-800/20",
        };
      case "candidate_assigned":
        return {
          icon: <UserCheck size={16} />,
          iconBg: "bg-amber-950 text-amber-400 border-amber-800/40",
          barColor: "bg-amber-800/20",
        };
      case "candidate_submitted_to_client":
        return {
          icon: <Send size={16} />,
          iconBg: "bg-emerald-950 text-emerald-400 border-emerald-800/40",
          barColor: "bg-emerald-800/20",
        };
      case "interview_scheduled":
        return {
          icon: <Calendar size={16} />,
          iconBg: "bg-fuchsia-950 text-fuchsia-400 border-fuchsia-800/40",
          barColor: "bg-fuchsia-800/20",
        };
      case "interview_feedback_added":
        return {
          icon: <MessageSquare size={16} />,
          iconBg: "bg-teal-950 text-teal-400 border-teal-800/40",
          barColor: "bg-teal-800/20",
        };
      case "hired":
      case "Selected":
        return {
          icon: <CheckCircle size={16} />,
          iconBg: "bg-emerald-950 text-emerald-400 border-emerald-800/40",
          barColor: "bg-emerald-800/20",
        };
      case "rejected":
      case "Rejected":
        return {
          icon: <XCircle size={16} />,
          iconBg: "bg-rose-950 text-rose-400 border-rose-800/40",
          barColor: "bg-rose-800/20",
        };
      default:
        return {
          icon: <Clock size={16} />,
          iconBg: "bg-slate-950 text-slate-400 border-slate-800/40",
          barColor: "bg-slate-800/20",
        };
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold text-slate-100 mb-6 flex items-center gap-2 border-b border-slate-800 pb-3">
        <Clock size={20} className="text-violet-400" />
        Candidate Activity Timeline
      </h2>
      {timeline.length === 0 ? (
        <div className="text-center text-slate-500 italic py-8">
          No activities recorded.
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-800">
          {timeline.map((event) => {
            const styles = getEventStyles(event.event_type);
            return (
              <div key={event.id} className="relative group">
                {/* Timeline node */}
                <div
                  className={`absolute -left-[27px] top-1.5 flex items-center justify-center w-6 h-6 rounded-full border shadow-sm ${styles.iconBg}`}
                >
                  {styles.icon}
                </div>

                {/* Content card */}
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 transition-all group-hover:border-slate-700">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <h3 className="text-sm font-semibold text-slate-200">{event.title}</h3>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-xs text-slate-400 leading-relaxed mb-2">{event.description}</p>
                  )}
                  {event.creator_name && (
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      <span>By:</span>
                      <span className="font-semibold text-slate-400">{event.creator_name}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
