"use client";
import React, { useState } from "react";
import { MessageSquare, Pin, Plus, Calendar, User } from "lucide-react";

interface NotesTabProps {
  notes: any[];
  onAddNote: (noteText: string, isPinned: boolean) => Promise<void>;
  onTogglePin: (noteId: string, isPinned: boolean) => Promise<void>;
}

export default function NotesTab({ notes, onAddNote, onTogglePin }: NotesTabProps) {
  const [newNote, setNewNote] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setLoading(true);
    try {
      await onAddNote(newNote.trim(), isPinned);
      setNewNote("");
      setIsPinned(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Note form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-xl font-semibold text-slate-100 mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
          <MessageSquare size={20} className="text-violet-400" />
          Add Internal Note / Recruiter Feedback
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            placeholder="Write internal notes about this candidate... (Use @Name to mention)"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            disabled={loading}
            rows={4}
            className="w-full bg-slate-950 text-slate-100 rounded-lg p-3 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder-slate-600 resize-none"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPinned}
                onChange={(e) => setIsPinned(e.target.checked)}
                disabled={loading}
                className="rounded border-slate-800 bg-slate-950 text-violet-600 focus:ring-violet-500 focus:ring-offset-slate-900"
              />
              <Pin size={14} className={isPinned ? "text-amber-400" : "text-slate-500"} />
              Pin note to top of candidate file
            </label>
            <button
              type="submit"
              disabled={loading || !newNote.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-4 py-2 text-sm font-medium border border-violet-500/30 transition-colors flex items-center gap-2"
            >
              <Plus size={16} />
              Add Note
            </button>
          </div>
        </form>
      </div>

      {/* Notes list */}
      <div className="space-y-4">
        {notes.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 italic">
            No notes logged for this candidate.
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={`bg-slate-900 border rounded-xl p-5 shadow-xl transition-all ${
                note.is_pinned ? "border-amber-500/40 bg-amber-950/5" : "border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <User size={14} className="text-slate-500" />
                  <span className="font-semibold text-slate-300">
                    {note.author_name || "System / Recruiter"}
                  </span>
                  <span className="text-slate-600">•</span>
                  <Calendar size={14} className="text-slate-500" />
                  <span>{new Date(note.created_at).toLocaleString()}</span>
                </div>
                <button
                  onClick={() => onTogglePin(note.id, !note.is_pinned)}
                  className={`p-1.5 rounded-lg hover:bg-slate-800 transition-colors ${
                    note.is_pinned ? "text-amber-400" : "text-slate-500"
                  }`}
                  title={note.is_pinned ? "Unpin note" : "Pin note"}
                >
                  <Pin size={16} />
                </button>
              </div>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.note_text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
