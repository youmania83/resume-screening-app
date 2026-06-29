// src/components/dashboard/screening/ResumeIngestCard.tsx
import React from "react";
import { Activity, Building2, FileText, Link2, UploadCloud, Clock, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { Progress } from "../../ui/progress";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Candidate, StructuredJD } from "../../../types/index";

interface ResumeIngestCardProps {
  isIngesting: boolean;
  activeJD: StructuredJD | null;
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
}

export function ResumeIngestCard({
  isIngesting,
  activeJD,
  handleSimulatedIngestion,
  dragActive,
  handleDrag,
  handleDrop,
  triggerFileSelect,
  fileInputRef,
  handleFileChange,
  triggerFolderSelect,
  folderInputRef,
  handleFolderChange,
  uploadProgress,
  screeningQueue,
  candidates,
  selectedCandidate,
  setSelectedCandidate
}: ResumeIngestCardProps) {
  return (
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
            {[
              { name: "Keka HRMS", icon: Building2, color: "text-emerald-500" },
              { name: "Careers Email", icon: FileText, color: "text-sky-500" },
              { name: "Careers Page", icon: Link2, color: "text-amber-500" }
            ].map(source => {
              const Icon = source.icon;
              return (
                <Button
                  key={source.name}
                  variant="outline"
                  size="sm"
                  disabled={isIngesting || !activeJD}
                  onClick={() => handleSimulatedIngestion(source.name)}
                  className="text-[10px] font-semibold py-1.5 h-auto flex flex-col items-center gap-1 border-border text-foreground/90 hover:bg-secondary/40"
                >
                  <Icon className={`h-4 w-4 ${source.color}`} />
                  {source.name}
                </Button>
              );
            })}
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
                ? "border-slate-800 bg-secondary/40/80 dark:border-border"
                : "border-border hover:border-slate-400 bg-secondary/40"
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".pdf,.docx,.zip"
              className="hidden"
              multiple
            />
            <input
              type="file"
              ref={folderInputRef}
              onChange={handleFolderChange}
              className="hidden"
              multiple
            />
            <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-slate-400">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div className="w-full">
              <p className="text-xs font-bold text-foreground">
                {Object.keys(uploadProgress).length > 0
                  ? `Uploading ${Object.keys(uploadProgress).length} file(s)...`
                  : "Drop resumes, folder, or ZIP here"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Supports PDF, DOCX, folders, and ZIP archives</p>
              <div className="mt-2.5 text-xs flex justify-center gap-3 text-indigo-500 font-bold select-none">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerFileSelect();
                  }}
                  className="hover:underline cursor-pointer bg-transparent border-0 outline-none p-0 text-indigo-500 font-bold"
                >
                  Browse Files
                </button>
                <span className="text-muted-foreground/30">|</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerFolderSelect();
                  }}
                  className="hover:underline cursor-pointer bg-transparent border-0 outline-none p-0 text-indigo-500 font-bold"
                >
                  Upload Folder
                </button>
              </div>
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
            <CardDescription className="text-[10px] text-muted-foreground">Real-time pipeline parsing updates.</CardDescription>
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
                          <span className="text-[7.5px] px-1 py-0.2 border border-border text-muted-foreground/80 bg-secondary/40 rounded font-semibold select-none">
                            {c.applicationSource}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground font-semibold block mt-0.5">{c.role} • {c.experienceYears} yrs</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs font-bold ${c.score >= 85 ? "text-emerald-600 dark:text-emerald-400" : c.score >= 70 ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>
                      {c.score}/100
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.status === "shortlisted" ? "success" : c.status === "interviewing" ? "purple" : c.status === "hold" ? "warning" : c.status === "rejected" ? "destructive" : "secondary"} className="text-[9px] uppercase tracking-wider px-1.5 py-0">
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
  );
}
