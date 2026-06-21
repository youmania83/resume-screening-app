"use client";
import React, { useState } from "react";
import { FileText, Upload, Calendar, User, Download } from "lucide-react";

interface DocumentsTabProps {
  documents: any[];
  onUploadDocument: (title: string, fileUrl: string, documentType: string) => Promise<void>;
}

export default function DocumentsTab({ documents, onUploadDocument }: DocumentsTabProps) {
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("Resume");
  const [fileUrl, setFileUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !fileUrl.trim()) return;
    setLoading(true);
    try {
      await onUploadDocument(title.trim(), fileUrl.trim(), docType);
      setTitle("");
      setFileUrl("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Upload document form */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl height-fit">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
          <Upload size={18} className="text-violet-400" />
          Upload Attachment
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Document Title</label>
            <input
              type="text"
              placeholder="e.g. John Doe Resume 2026"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
              className="w-full bg-slate-950 text-slate-100 rounded-lg px-3 py-2 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              required
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Attachment Type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              disabled={loading}
              className="w-full bg-slate-950 text-slate-100 rounded-lg p-2 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
            >
              <option value="Resume">Resume</option>
              <option value="Cover Letter">Cover Letter</option>
              <option value="Portfolio">Portfolio</option>
              <option value="Certifications">Certifications</option>
              <option value="Interview Attachments">Interview Attachments</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Simulated Cloud URL</label>
            <input
              type="text"
              placeholder="s3://bucket/key.pdf"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              disabled={loading}
              className="w-full bg-slate-950 text-slate-100 rounded-lg px-3 py-2 border border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading || !title.trim() || !fileUrl.trim()}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 text-sm font-medium border border-violet-500/30 transition-colors flex items-center justify-center gap-2"
          >
            <Upload size={16} />
            Attach Document
          </button>
        </form>
      </div>

      {/* Attachments history list */}
      <div className="md:col-span-2 space-y-4">
        <h2 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <FileText size={18} className="text-slate-400" />
          Version History & Documents
        </h2>
        {documents.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500 italic">
            No files attached yet.
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between shadow-md hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-violet-400">
                    <FileText size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200 text-sm">{doc.title}</span>
                      <span className="bg-violet-950 text-violet-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-violet-800/40">
                        v{doc.version}
                      </span>
                      <span className="bg-slate-850 text-slate-400 text-[10px] font-medium px-1.5 py-0.5 rounded uppercase border border-slate-850">
                        {doc.document_type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <User size={12} />
                      <span>{doc.uploader_name || "System"}</span>
                      <span>•</span>
                      <Calendar size={12} />
                      <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center"
                    title="Download / Open file"
                  >
                    <Download size={16} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
