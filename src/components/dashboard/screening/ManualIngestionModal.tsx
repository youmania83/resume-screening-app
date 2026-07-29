// src/components/dashboard/screening/ManualIngestionModal.tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, UploadCloud, Briefcase, FileText, Link2, FileDown, Sparkles, Check, RefreshCw } from "lucide-react";
import { JobImportCard } from "./JobImportCard";
import { StructuredJD } from "../../../types/index";
import { Progress } from "../../ui/progress";

interface ManualIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Job Import Props
  importTab: "url" | "file" | "text";
  setImportTab: (tab: "url" | "file" | "text") => void;
  importUrl: string;
  setImportUrl: (url: string) => void;
  jdTextPaste: string;
  setJdTextPaste: (text: string) => void;
  jdFile: File | null;
  setJdFile: (file: File | null) => void;
  isExtracting: boolean;
  activeJD: StructuredJD | null;
  setActiveJD: (jd: StructuredJD | null) => void;
  isEditingJD: boolean;
  setIsEditingJD: (editing: boolean) => void;
  handleJdImport: () => void;
  handleSaveJD: () => void;
  jdFileInputRef: React.RefObject<HTMLInputElement | null>;
  // Bulk Resume Ingestion Props
  isIngesting: boolean;
  dragActive: boolean;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  triggerFileSelect: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  triggerFolderSelect: () => void;
  folderInputRef: React.RefObject<HTMLInputElement | null>;
  handleFolderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadProgress: Record<string, number>;
  handleEmailFetch: () => void;
  isSyncingEmail: boolean;
}

export function ManualIngestionModal(props: ManualIngestionModalProps) {
  const [activeMode, setActiveMode] = React.useState<"resumes" | "jd">("resumes");

  if (!props.isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-secondary/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Manual File & Job Ingestion</h3>
                <p className="text-[11px] text-muted-foreground">Manual backup override for uploading resumes or job descriptions.</p>
              </div>
            </div>
            <button
              onClick={props.onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="px-6 pt-4 border-b border-border flex gap-4 bg-card">
            <button
              onClick={() => setActiveMode("resumes")}
              className={`pb-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeMode === "resumes"
                  ? "border-indigo-500 text-indigo-500"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-4 w-4" />
              Upload Resumes (PDF / DOCX / ZIP)
            </button>
            <button
              onClick={() => setActiveMode("jd")}
              className={`pb-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                activeMode === "jd"
                  ? "border-indigo-500 text-indigo-500"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Briefcase className="h-4 w-4" />
              Import Job Description (URL / File / Text)
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
            {activeMode === "resumes" ? (
              <div className="space-y-4">
                <div
                  onDragEnter={props.handleDrag}
                  onDragOver={props.handleDrag}
                  onDragLeave={props.handleDrag}
                  onDrop={props.handleDrop}
                  onClick={props.triggerFileSelect}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                    props.dragActive
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-border hover:border-slate-400 bg-secondary/30"
                  }`}
                >
                  <input
                    type="file"
                    ref={props.fileInputRef}
                    onChange={props.handleFileChange}
                    accept=".pdf,.docx,.zip"
                    className="hidden"
                    multiple
                  />
                  <input
                    type="file"
                    ref={props.folderInputRef}
                    onChange={props.handleFolderChange}
                    className="hidden"
                    multiple
                  />
                  <div className="h-12 w-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      {Object.keys(props.uploadProgress).length > 0
                        ? `Uploading ${Object.keys(props.uploadProgress).length} file(s)...`
                        : "Drop resumes, folder, or ZIP here"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">Supports PDF, DOCX, folders, and ZIP archives</p>
                    <div className="mt-3 text-xs flex justify-center gap-3 text-indigo-500 font-bold">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.triggerFileSelect();
                        }}
                        className="hover:underline"
                      >
                        Browse Files
                      </button>
                      <span className="text-muted-foreground/30">|</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.triggerFolderSelect();
                        }}
                        className="hover:underline"
                      >
                        Upload Folder
                      </button>
                      <span className="text-muted-foreground/30">|</span>
                      <button
                        type="button"
                        disabled={props.isSyncingEmail}
                        onClick={(e) => {
                          e.stopPropagation();
                          props.handleEmailFetch();
                        }}
                        className="hover:underline disabled:opacity-50"
                      >
                        {props.isSyncingEmail ? "Fetching..." : "Fetch from Email"}
                      </button>
                    </div>
                  </div>
                </div>

                {Object.keys(props.uploadProgress).length > 0 && (
                  <div className="p-4 bg-secondary/40 rounded-lg border border-border space-y-3">
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Ingestion Stream</span>
                    {Object.entries(props.uploadProgress).map(([fileId, progress]) => (
                      <div key={fileId} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-foreground">
                          <span className="truncate max-w-[250px]">{fileId.split("-")[0]}</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} className="h-1.5" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <JobImportCard
                  importTab={props.importTab}
                  setImportTab={props.setImportTab}
                  importUrl={props.importUrl}
                  setImportUrl={props.setImportUrl}
                  jdTextPaste={props.jdTextPaste}
                  setJdTextPaste={props.setJdTextPaste}
                  jdFile={props.jdFile}
                  setJdFile={props.setJdFile}
                  isExtracting={props.isExtracting}
                  activeJD={props.activeJD}
                  setActiveJD={props.setActiveJD}
                  isEditingJD={props.isEditingJD}
                  setIsEditingJD={props.setIsEditingJD}
                  handleJdImport={props.handleJdImport}
                  handleSaveJD={props.handleSaveJD}
                  jdFileInputRef={props.jdFileInputRef}
                />
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-3 border-t border-border bg-secondary/20 flex justify-end">
            <button
              onClick={props.onClose}
              className="px-4 py-1.5 text-xs font-bold bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors"
            >
              Close Window
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
