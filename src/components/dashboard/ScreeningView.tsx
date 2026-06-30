// src/components/dashboard/ScreeningView.tsx
import React from "react";
import { motion } from "framer-motion";
import { JobImportCard } from "./screening/JobImportCard";
import { ResumeIngestCard } from "./screening/ResumeIngestCard";
import { AiScreeningConsole } from "./screening/AiScreeningConsole";
import { Candidate, StructuredJD } from "../../types/index";

interface ScreeningViewProps {
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

  isIngesting: boolean;
  handleSimulatedIngestion: (source: string) => void;
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
  screeningQueue: any[];
  candidates: Candidate[];
  selectedCandidate: Candidate | null;
  setSelectedCandidate: (candidate: Candidate | null) => void;
  dismissQueueItem: (id: string) => void;

  handleDeleteCandidate: (id: string) => void;
  assessmentScoreInput: number;
  setAssessmentScoreInput: (score: number) => void;
  handleAssessmentSubmit: (id: string, score: number) => void;
  isAssessmentSubmitting: boolean;
  interviewFeedbackInput: string;
  setInterviewFeedbackInput: (text: string) => void;
  handleInterviewSubmit: (id: string, decision: "pass" | "fail", feedback: string) => void;
  isInterviewSubmitting: boolean;
  isOnboardingSubmitting: boolean;
  handleOnboardSubmit: (id: string) => void;
  handleDecision: (id: string, status: any) => void;
}

export function ScreeningView(props: ScreeningViewProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="h-full flex flex-col gap-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
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

        <ResumeIngestCard
          isIngesting={props.isIngesting}
          activeJD={props.activeJD}
          handleSimulatedIngestion={props.handleSimulatedIngestion}
          dragActive={props.dragActive}
          handleDrag={props.handleDrag}
          handleDrop={props.handleDrop}
          triggerFileSelect={props.triggerFileSelect}
          fileInputRef={props.fileInputRef}
          handleFileChange={props.handleFileChange}
          triggerFolderSelect={props.triggerFolderSelect}
          folderInputRef={props.folderInputRef}
          handleFolderChange={props.handleFolderChange}
          uploadProgress={props.uploadProgress}
          screeningQueue={props.screeningQueue}
          candidates={props.candidates}
          selectedCandidate={props.selectedCandidate}
          setSelectedCandidate={props.setSelectedCandidate}
          dismissQueueItem={props.dismissQueueItem}
        />

        <AiScreeningConsole
          selectedCandidate={props.selectedCandidate}
          handleDeleteCandidate={props.handleDeleteCandidate}
          assessmentScoreInput={props.assessmentScoreInput}
          setAssessmentScoreInput={props.setAssessmentScoreInput}
          handleAssessmentSubmit={props.handleAssessmentSubmit}
          isAssessmentSubmitting={props.isAssessmentSubmitting}
          interviewFeedbackInput={props.interviewFeedbackInput}
          setInterviewFeedbackInput={props.setInterviewFeedbackInput}
          handleInterviewSubmit={props.handleInterviewSubmit}
          isInterviewSubmitting={props.isInterviewSubmitting}
          isOnboardingSubmitting={props.isOnboardingSubmitting}
          handleOnboardSubmit={props.handleOnboardSubmit}
          handleDecision={props.handleDecision}
        />
      </div>
    </motion.div>
  );
}
