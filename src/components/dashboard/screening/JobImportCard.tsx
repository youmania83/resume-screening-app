// src/components/dashboard/screening/JobImportCard.tsx
import React from "react";
import { Briefcase, Link2, FileDown, Sparkles, Check, Edit2, Building2, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../ui/tabs";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { StructuredJD } from "../../../types/index";

interface JobImportCardProps {
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
}

export function JobImportCard({
  importTab,
  setImportTab,
  importUrl,
  setImportUrl,
  jdTextPaste,
  setJdTextPaste,
  jdFile,
  setJdFile,
  isExtracting,
  activeJD,
  setActiveJD,
  isEditingJD,
  setIsEditingJD,
  handleJdImport,
  handleSaveJD,
  jdFileInputRef
}: JobImportCardProps) {
  return (
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
                    className="w-full bg-secondary/40 border border-border rounded pl-8.5 pr-2.5 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring text-foreground"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="file" className="pt-3.5 space-y-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Upload JD Document</label>
                <div
                  onClick={() => jdFileInputRef.current?.click()}
                  className="border border-dashed border-border rounded p-4 text-center cursor-pointer bg-secondary/30 hover:border-slate-400 flex flex-col items-center justify-center gap-1.5"
                >
                  <input
                    type="file"
                    ref={jdFileInputRef}
                    onChange={(e) => e.target.files && setJdFile(e.target.files[0])}
                    accept=".pdf,.docx"
                    className="hidden"
                  />
                  <FileDown className="h-5 w-5 text-slate-400" />
                  <span className="text-[11px] font-semibold text-foreground truncate max-w-full px-2">
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
                  className="w-full bg-secondary/40 border border-border rounded px-2.5 py-2 text-xs outline-none text-foreground resize-none font-mono"
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
              <CardDescription className="text-[9px] text-muted-foreground">Extracted structured vectors.</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] text-muted-foreground hover:text-foreground font-semibold gap-1 border border-border"
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
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Job Title</label>
                  <input
                    type="text"
                    value={activeJD.title || ""}
                    onChange={(e) => setActiveJD({ ...activeJD, title: e.target.value })}
                    className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none font-semibold text-foreground"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Experience</label>
                    <input
                      type="text"
                      value={activeJD.experience || ""}
                      onChange={(e) => setActiveJD({ ...activeJD, experience: e.target.value })}
                      className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Department</label>
                    <input
                      type="text"
                      value={activeJD.department || ""}
                      onChange={(e) => setActiveJD({ ...activeJD, department: e.target.value })}
                      className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Location</label>
                  <input
                    type="text"
                    value={activeJD.location || ""}
                    onChange={(e) => setActiveJD({ ...activeJD, location: e.target.value })}
                    className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Required Skills (Comma-separated)</label>
                  <textarea
                    value={(activeJD.requiredSkills || []).join(", ")}
                    onChange={(e) => setActiveJD({ ...activeJD, requiredSkills: e.target.value.split(",").map(s => s.trim()) })}
                    rows={2}
                    className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground resize-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Preferred Skills</label>
                  <input
                    type="text"
                    value={(activeJD.preferredSkills || []).join(", ")}
                    onChange={(e) => setActiveJD({ ...activeJD, preferredSkills: e.target.value.split(",").map(s => s.trim()) })}
                    className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Education Required</label>
                  <input
                    type="text"
                    value={activeJD.education || ""}
                    onChange={(e) => setActiveJD({ ...activeJD, education: e.target.value })}
                    className="w-full bg-secondary/40 border border-border rounded px-2 py-1 text-xs outline-none text-foreground"
                  />
                </div>

                <Button variant="default" size="sm" className="w-full text-xs font-semibold mt-2" onClick={handleSaveJD}>
                  Save Changes & Sync Pipeline
                </Button>
              </div>
            ) : (
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
                      <Badge key={s} variant="secondary" className="text-[9px] px-2 py-0.5 border border-border bg-secondary/40 text-foreground">
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
                        <Badge key={s} variant="outline" className="text-[9px] px-2 py-0.5 text-muted-foreground border-border select-none">
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
                  <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-muted-foreground leading-relaxed font-medium">
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
  );
}
