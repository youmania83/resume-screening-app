"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useAssessmentSession } from "@/src/hooks/useAssessmentSession";
import AssessmentErrorView from "@/src/components/assessment/AssessmentErrorView";
import AssessmentResultView from "@/src/components/assessment/AssessmentResultView";
import AssessmentInstructions from "@/src/components/assessment/AssessmentInstructions";
import ExamInterface from "@/src/components/assessment/ExamInterface";
import ProctoringOverlay from "@/src/components/assessment/ProctoringOverlay";

export default function CandidateAssessmentPage() {
  const params = useParams();
  const token = params.token as string;

  const {
    sessionId,
    loading,
    error,
    fullscreenError,
    candidateName,
    jobTitle,
    questions,
    testStarted,
    testSubmitted,
    remainingSeconds,
    currentIdx,
    setCurrentIdx,
    answers,
    flaggedQuestions,
    violationCount,
    latestViolationMsg,
    result,
    isMobile,
    progressPercent,
    proctoring,
    requestFullscreen,
    handleForceResume,
    submitAssessment,
    handleSelectOption,
    toggleFlag,
    dismissFullscreenError,
    isResuming,
  } = useAssessmentSession(token);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-slate-800" />
          <p className="text-sm text-muted-foreground font-semibold tracking-wide">Initializing secure portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <AssessmentErrorView
        error={error}
        handleForceResume={handleForceResume}
        sessionId={sessionId}
      />
    );
  }

  if (testSubmitted && result) {
    return (
      <AssessmentResultView
        result={result}
        sessionId={sessionId}
      />
    );
  }

  if (!testStarted) {
    return (
      <AssessmentInstructions
        jobTitle={jobTitle}
        candidateName={candidateName}
        isMobile={isMobile}
        token={token}
        requestFullscreen={requestFullscreen}
        isResuming={isResuming}
      />
    );
  }

  return (
    <>
      <ExamInterface
        jobTitle={jobTitle}
        candidateName={candidateName}
        remainingSeconds={remainingSeconds}
        submitAssessment={submitAssessment}
        progressPercent={progressPercent}
        questions={questions}
        currentIdx={currentIdx}
        setCurrentIdx={setCurrentIdx}
        answers={answers}
        flaggedQuestions={flaggedQuestions}
        toggleFlag={toggleFlag}
        handleSelectOption={handleSelectOption}
        violationCount={violationCount}
        latestViolationMsg={latestViolationMsg}
      />
      <ProctoringOverlay
        fullscreenError={fullscreenError}
        requestFullscreen={requestFullscreen}
        isMobile={isMobile}
        webcamStream={proctoring.webcamStream}
        videoRef={proctoring.videoRef}
        faceViolation={proctoring.faceViolation}
        modelLoaded={proctoring.modelLoaded}
        dismissFullscreenError={dismissFullscreenError}
      />
    </>
  );
}
