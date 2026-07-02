// src/components/dashboard/SettingsView.tsx
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { toast } from "sonner";
import { Key, Mail, Palette, FileText, Save, Info, AlertTriangle, Inbox, Plus, Trash2, CheckCircle2 } from "lucide-react";

interface SettingsViewProps {
  webhookUrl: string;
  setWebhookUrl: (url: string) => void;
}

export function SettingsView({ webhookUrl, setWebhookUrl }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<"general" | "inbox-sync" | "smtp" | "templates">("general");

  // SMTP Settings State
  const [smtpProvider, setSmtpProvider] = useState("gmail");
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpReplyTo, setSmtpReplyTo] = useState("");

  // Incoming Email Sync State
  const [incomingSyncEnabled, setIncomingSyncEnabled] = useState(false);
  const [incomingProvider, setIncomingProvider] = useState("mock");
  const [incomingFolder, setIncomingFolder] = useState("INBOX");
  const [hrManagerEmail, setHrManagerEmail] = useState("");
  const [rules, setRules] = useState<any[]>([
    {
      type: "resume",
      name: "Default Resume Application",
      subjectRegex: "(?i)applying\\s*for|job\\s*application|resume\\s*for|cv\\s*for",
      titleRegex: "(?i)(?:applying\\s*for|job\\s*application|resume\\s*for|cv\\s*for)\\s*[:-]?\\s*(.+)"
    },
    {
      type: "jd",
      name: "Default Job Description Ingest",
      subjectRegex: "(?i)job\\s*description|new\\s*jd|post\\s*job|hiring\\s*for",
      titleRegex: "(?i)(?:job\\s*description|new\\s*jd|post\\s*job|hiring\\s*for)\\s*[:-]?\\s*(.+)"
    }
  ]);

  // Sandbox / Testing State
  const [testSubject, setTestSubject] = useState("");
  const [testBody, setTestBody] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [testingRoute, setTestingRoute] = useState(false);
  const [syncingInbox, setSyncingInbox] = useState(false);

  // Branding State
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0f172a");
  const [emailFooter, setEmailFooter] = useState("");

  // Templates State
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateName, setSelectedTemplateName] = useState("Interview Invite");
  const [templateSubject, setTemplateSubject] = useState("");
  const [templateBody, setTemplateBody] = useState("");

  // Loading States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  // Fetch Settings & Templates
  const loadSettingsData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Email and Branding Settings
      const settingsResp = await fetch(`${apiBase}/email/settings`);
      if (settingsResp.ok) {
        const data = await settingsResp.json();
        if (data.success) {
          const cfg = data.settings || {};
          setSmtpProvider(cfg.provider || "gmail");
          setSmtpHost(cfg.host || "smtp.gmail.com");
          setSmtpPort(cfg.port || 587);
          setSmtpUser(cfg.username || cfg.user || "");
          setSmtpPassword(cfg.password || cfg.pass || "");
          setSmtpFromName(cfg.fromName || "");
          setSmtpReplyTo(cfg.replyTo || "");

          // Ingestion config fields
          setIncomingSyncEnabled(cfg.incomingSyncEnabled ?? false);
          setIncomingProvider(cfg.incomingProvider || "mock");
          setIncomingFolder(cfg.incomingFolder || "INBOX");
          setHrManagerEmail(cfg.hrManagerEmail || "");
          if (Array.isArray(cfg.rules)) {
            setRules(cfg.rules);
          }

          const brand = data.branding || {};
          setLogoUrl(brand.logoUrl || "");
          setPrimaryColor(brand.primaryColor || "#0f172a");
          setEmailFooter(brand.emailFooter || "");
        }
      }

      // 2. Fetch Email Templates
      const templatesResp = await fetch(`${apiBase}/email/templates`);
      if (templatesResp.ok) {
        const data = await templatesResp.json();
        if (data.success && Array.isArray(data.templates)) {
          setTemplates(data.templates);
          // Set initial fields for default selected template
          const activeT = data.templates.find((t: any) => t.name === "Interview Invite") || data.templates[0];
          if (activeT) {
            setSelectedTemplateName(activeT.name);
            setTemplateSubject(activeT.subject || "");
            setTemplateBody(activeT.html_body || activeT.body || "");
          }
        }
      }
    } catch (err) {
      console.error("Failed to load settings data", err);
      toast.error("Failed to retrieve workspace configuration data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, []);

  // Update form fields when template changes
  const handleTemplateChange = (name: string) => {
    setSelectedTemplateName(name);
    const matched = templates.find((t: any) => t.name === name);
    if (matched) {
      setTemplateSubject(matched.subject || "");
      setTemplateBody(matched.html_body || matched.body || "");
    } else {
      setTemplateSubject("");
      setTemplateBody("");
    }
  };

  // Provider changes auto-fills standard hosts & ports
  const handleProviderChange = (prov: string) => {
    setSmtpProvider(prov);
    if (prov === "gmail") {
      setSmtpHost("smtp.gmail.com");
      setSmtpPort(465);
    } else if (prov === "outlook") {
      setSmtpHost("smtp.office365.com");
      setSmtpPort(465);
    } else if (prov === "zoho") {
      setSmtpHost("smtp.zoho.com");
      setSmtpPort(465);
    } else if (prov === "resend") {
      setSmtpHost("api.resend.com (HTTPS)");
      setSmtpPort(443);
    } else if (prov === "sendgrid") {
      setSmtpHost("api.sendgrid.com (HTTPS)");
      setSmtpPort(443);
    }
  };

  // Save SMTP settings & white-label branding
  const saveSmtpAndBranding = async () => {
    if (!smtpUser.trim()) {
      toast.error("SMTP Username (email address) is required.");
      return;
    }
    setSaving(true);
    toast.loading("Saving configuration settings...", { id: "save-settings-toast" });
    try {
      const resp = await fetch(`${apiBase}/email/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: smtpProvider,
          username: smtpUser,
          password: smtpPassword,
          host: smtpHost,
          port: Number(smtpPort),
          fromName: smtpFromName,
          replyTo: smtpReplyTo,
          logoUrl,
          primaryColor,
          emailFooter,
          // Incoming configurations to persist in email_config JSONB
          rules,
          incomingSyncEnabled,
          incomingProvider,
          incomingFolder,
          hrManagerEmail
        })
      });
      if (resp.ok) {
        toast.success("SMTP and branding configurations updated successfully!", { id: "save-settings-toast" });
      } else {
        const errorText = await resp.text();
        toast.error(`Error saving configurations: ${errorText}`, { id: "save-settings-toast" });
      }
    } catch (err) {
      console.error("Error saving settings", err);
      toast.error("Could not save configuration details.", { id: "save-settings-toast" });
    } finally {
      setSaving(false);
    }
  };

  // Save selected Email Template
  const saveEmailTemplate = async () => {
    if (!templateSubject.trim() || !templateBody.trim()) {
      toast.error("Subject and template body cannot be empty.");
      return;
    }
    setSaving(true);
    toast.loading(`Saving ${selectedTemplateName} template...`, { id: "save-template-toast" });
    try {
      const resp = await fetch(`${apiBase}/email/templates/${encodeURIComponent(selectedTemplateName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: templateSubject,
          html_body: templateBody
        })
      });
      if (resp.ok) {
        toast.success(`Template '${selectedTemplateName}' saved successfully!`, { id: "save-template-toast" });
        // Update local state list
        setTemplates(prev => prev.map(t => 
          t.name === selectedTemplateName ? { ...t, subject: templateSubject, html_body: templateBody, body: templateBody } : t
        ));
      } else {
        const errorText = await resp.text();
        toast.error(`Error saving template: ${errorText}`, { id: "save-template-toast" });
      }
    } catch (err) {
      console.error("Error saving template", err);
      toast.error("Could not save template details.", { id: "save-template-toast" });
    } finally {
      setSaving(false);
    }
  };

  // Rules Manipulation
  const addRule = () => {
    setRules(prev => [
      ...prev,
      {
        type: "resume",
        name: `Incoming Rule #${prev.length + 1}`,
        subjectRegex: "",
        titleRegex: ""
      }
    ]);
  };

  const updateRule = (index: number, field: string, value: string) => {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  const removeRule = (index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index));
  };

  // Sandbox route test trigger
  const handleTestRoute = async () => {
    if (!testSubject.trim()) {
      toast.error("Please enter a subject line to test.");
      return;
    }
    setTestingRoute(true);
    setTestResult(null);
    try {
      const resp = await fetch(`${apiBase}/email/test-routing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: testSubject, body: testBody })
      });
      if (resp.ok) {
        const data = await resp.json();
        setTestResult(data);
        toast.success("Routing test complete!");
      } else {
        toast.error("Routing test failed.");
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection error while testing email routing.");
    } finally {
      setTestingRoute(false);
    }
  };

  // Manual Trigger email sync
  const triggerManualSync = async () => {
    setSyncingInbox(true);
    toast.loading("Initiating mailbox sync pass...", { id: "sync-toast" });
    try {
      const resp = await fetch(`${apiBase}/inbox/email-sync`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-tenant-id": "default-tenant" 
        },
        body: JSON.stringify({ provider: incomingProvider })
      });
      if (resp.ok) {
        const data = await resp.json();
        toast.success(data.message || "Email sync run complete!", { id: "sync-toast" });
      } else {
        toast.error("Failed to run email sync pass.", { id: "sync-toast" });
      }
    } catch (err) {
      console.error(err);
      toast.error("Connection error running email sync pass.", { id: "sync-toast" });
    } finally {
      setSyncingInbox(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[300px] items-center justify-center text-xs text-muted-foreground font-semibold">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border border-muted border-t-foreground" />
          <span>Retrieving workspace configurations...</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: 0.15 }}
      className="max-w-4xl space-y-6"
    >
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 font-sans">Workspace Settings</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5 font-semibold font-sans">Manage API connections, custom SMTP servers, white-label candidate branding, and email communication templates.</p>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-border gap-6 select-none">
        {[
          { id: "general", label: "Integrations & Sync", icon: Key },
          { id: "inbox-sync", label: "Email Inbox Sync", icon: Inbox },
          { id: "smtp", label: "SMTP & Branding", icon: Mail },
          { id: "templates", label: "Email Templates", icon: FileText }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`flex items-center gap-1.5 pb-2.5 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 -mb-[2px] cursor-pointer ${
                isActive 
                  ? "border-foreground text-foreground" 
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* General Integration Tab */}
      {activeTab === "general" && (
        <div className="space-y-6 max-w-2xl">
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
                  <input type="range" min="0" max="1" step="0.1" defaultValue="0.3" disabled className="w-1/3 accent-slate-800" />
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
                    <span className="text-slate-400 text-[10px] block mt-0.5 font-semibold">{integration.desc}</span>
                  </div>
                  <Badge variant={integration.status === "Enabled" ? "success" : "secondary"} className="text-[9px] font-bold">
                    {integration.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Email Inbox Sync Tab */}
      {activeTab === "inbox-sync" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Rules Editor */}
          <div className="md:col-span-2 space-y-6">
            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Email Sync Configuration</CardTitle>
                  <CardDescription className="text-[10px] mt-0.5">Determine how the platform fetches and maps incoming recruitment emails.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-xs">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="space-y-0.5">
                    <strong className="text-foreground font-bold">Enable Inbox Ingestion Sync</strong>
                    <span className="text-slate-400 text-[10px] block">Periodically sync mailbox, classify subject lines, and auto-parse contents.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={incomingSyncEnabled}
                    onChange={(e) => setIncomingSyncEnabled(e.target.checked)}
                    className="h-4 w-4 accent-slate-800 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground">Incoming Mail Provider</span>
                    <select
                      value={incomingProvider}
                      onChange={(e) => setIncomingProvider(e.target.value)}
                      className="w-full bg-secondary border border-border rounded px-2.5 py-1.5 font-semibold outline-none text-[11px] text-foreground"
                    >
                      <option value="mock">Mock Sync Provider (Testing feed)</option>
                      <option value="gmail">Gmail API Sync (OAuth)</option>
                      <option value="outlook">Outlook Microsoft Graph Sync</option>
                      <option value="zoho">Zoho Mail API</option>
                      <option value="imap">IMAP Protocol server</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground">Mailbox Sync Folder</span>
                    <input
                      type="text"
                      value={incomingFolder}
                      onChange={(e) => setIncomingFolder(e.target.value)}
                      placeholder="e.g. INBOX"
                      className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1 pt-3 border-t border-border">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">HR Manager Email (for Interview Alerts)</span>
                  <input
                    type="email"
                    value={hrManagerEmail}
                    onChange={(e) => setHrManagerEmail(e.target.value)}
                    placeholder="e.g. hr@yourcompany.com"
                    className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none text-xs"
                  />
                  <span className="text-[9px] text-muted-foreground block">When a candidate passes the assessment, the HR interview invite will be sent to this email alongside the candidate notification.</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Routing Rules & Regex Patterns</CardTitle>
                  <CardDescription className="text-[10px] mt-0.5">Rules are evaluated sequentially. First match handles classification and job mapping.</CardDescription>
                </div>
                <Button onClick={addRule} size="sm" variant="outline" className="text-[10px] gap-1 font-bold">
                  <Plus className="h-3 w-3" /> Add Rule
                </Button>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-xs">
                {rules.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground font-semibold text-[11px]">
                    No custom routing rules defined. System will use default patterns.
                  </div>
                ) : (
                  rules.map((rule, idx) => (
                    <div key={idx} className="p-3 bg-secondary/20 rounded border border-border space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <input
                          type="text"
                          value={rule.name}
                          onChange={(e) => updateRule(idx, "name", e.target.value)}
                          placeholder="Rule Name"
                          className="font-bold text-foreground bg-transparent border-b border-transparent hover:border-border/60 focus:border-foreground outline-none text-xs w-2/3"
                        />
                        <div className="flex items-center gap-2">
                          <select
                            value={rule.type}
                            onChange={(e) => updateRule(idx, "type", e.target.value)}
                            className="bg-secondary text-[9px] border border-border rounded px-1 py-0.5 font-bold uppercase"
                          >
                            <option value="resume">Resume App</option>
                            <option value="jd">JD Ingest</option>
                          </select>
                          <button
                            onClick={() => removeRule(idx)}
                            className="text-muted-foreground hover:text-destructive cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                        <div className="space-y-1">
                          <span className="block text-[9px] uppercase font-bold text-muted-foreground">Subject Line Match Regex</span>
                          <input
                            type="text"
                            value={rule.subjectRegex}
                            onChange={(e) => updateRule(idx, "subjectRegex", e.target.value)}
                            placeholder="e.g. (?i)applying\s*for"
                            className="w-full bg-card border border-border rounded px-2 py-1 outline-none font-mono text-[10px]"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="block text-[9px] uppercase font-bold text-muted-foreground">Title Extraction Regex</span>
                          <input
                            type="text"
                            value={rule.titleRegex}
                            onChange={(e) => updateRule(idx, "titleRegex", e.target.value)}
                            placeholder="e.g. (?i)applying\s*for\s*(.+)"
                            className="w-full bg-card border border-border rounded px-2 py-1 outline-none font-mono text-[10px]"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    onClick={triggerManualSync}
                    disabled={syncingInbox}
                    variant="outline"
                    className="text-xs font-bold"
                  >
                    Sync Inbox Now
                  </Button>
                  <Button
                    onClick={saveSmtpAndBranding}
                    disabled={saving}
                    className="text-xs font-bold gap-1.5 shadow-sm"
                  >
                    <Save className="h-3.5 w-3.5" /> Save Sync Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sandbox & Help */}
          <div className="md:col-span-1 space-y-6">
            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Interactive Routing Sandbox</CardTitle>
                <CardDescription className="text-[10px] mt-0.5">Test how incoming subject lines get classified and routed by current active rules.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-3.5 text-xs">
                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">Sample Subject Line</span>
                  <input
                    type="text"
                    value={testSubject}
                    onChange={(e) => setTestSubject(e.target.value)}
                    placeholder="e.g. Applying for React Developer - John Doe"
                    className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">Sample Email Body (Optional)</span>
                  <textarea
                    rows={4}
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                    placeholder="Cloud resume URL, description, etc."
                    className="w-full bg-secondary/30 border border-border rounded p-2 outline-none font-sans resize-none font-semibold"
                  />
                </div>

                <Button
                  onClick={handleTestRoute}
                  disabled={testingRoute || !testSubject}
                  className="w-full text-xs font-bold"
                >
                  {testingRoute ? "Testing..." : "Evaluate Routing"}
                </Button>

                {testResult && (
                  <div className="pt-3 border-t border-border space-y-2 leading-relaxed">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Evaluation Report</span>
                    <div className="p-3 rounded border border-border bg-secondary/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">Match Status:</span>
                        <Badge variant={testResult.matched ? "success" : "destructive"} className="text-[9px] font-bold">
                          {testResult.matched ? "MATCHED" : "NO MATCH"}
                        </Badge>
                      </div>

                      {testResult.matched && (
                        <>
                          <div className="flex justify-between">
                            <span className="font-semibold text-slate-400">Classification:</span>
                            <span className="font-bold uppercase text-foreground text-[10px]">{testResult.classification}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-semibold text-slate-400">Job Title Match:</span>
                            <span className="font-bold text-amber-500">{testResult.jobTitleExtracted || "Not Found"}</span>
                          </div>
                        </>
                      )}

                      {testResult.extractedLinks?.length > 0 && (
                        <div>
                          <span className="font-semibold text-slate-400 block mb-0.5">Resume Links Extracted:</span>
                          {testResult.extractedLinks.map((link: string, i: number) => (
                            <code key={i} className="text-[9px] text-sky-400 block truncate font-mono bg-card p-1 rounded border border-border/40 mt-1">{link}</code>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t border-border/40 text-[10px] flex gap-1.5 items-start">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <strong className="text-foreground block">Action to Take:</strong>
                          <span className="text-slate-400 font-semibold block mt-0.5">{testResult.actionToTake}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Quick Syntax Help</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2.5 text-[10px] text-slate-400 font-semibold leading-normal">
                <p>
                  <strong>(?i) Modifier:</strong> Use <code>(?i)</code> at the beginning of the regex pattern to trigger case-insensitive matching.
                </p>
                <p>
                  <strong>Capture Groups <code>(...)</code>:</strong> Place parentheses around the section of the subject regex representing the Job Title to extract it.
                </p>
                <p>
                  <strong>Matching Jobs:</strong> The system will try to find a Job profile matching the extracted Title using a SQL partial ILIKE match. If it finds one, candidate resumes are matched to it automatically.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* SMTP & Branding Tab */}
      {activeTab === "smtp" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* SMTP Config */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">SMTP Outgoing Server Config</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div className="space-y-1">
                <span className="block text-[10px] uppercase font-bold text-muted-foreground">Email Provider</span>
                <select
                  value={smtpProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="w-full bg-secondary border border-border rounded px-2.5 py-1.5 font-semibold outline-none text-[11px] text-foreground"
                >
                  <option value="resend">Resend API (Recommended — No App Password Needed)</option>
                  <option value="gmail">Gmail SMTP (Requires App Password)</option>
                  <option value="zoho">Zoho Mail SMTP</option>
                  <option value="outlook">Outlook / Office 365 SMTP</option>
                  <option value="sendgrid">SendGrid API</option>
                  <option value="custom">Custom SMTP Server</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">SMTP Host</span>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    disabled={smtpProvider !== "custom"}
                    className="w-full bg-secondary/30 disabled:opacity-60 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">SMTP Port</span>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    disabled={smtpProvider !== "custom"}
                    className="w-full bg-secondary/30 disabled:opacity-60 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">
                    {smtpProvider === "resend" || smtpProvider === "sendgrid" ? "Sender Email Address" : "Username / Email"}
                  </span>
                  <input
                    type="email"
                    placeholder="recruiting@yourdomain.com"
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">
                    {smtpProvider === "resend" || smtpProvider === "sendgrid" ? "API Key" : "Password / App Key"}
                  </span>
                  <input
                    type="password"
                    placeholder={smtpProvider === "resend" || smtpProvider === "sendgrid" ? "re_..." : "••••••••••••"}
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-border/40">
                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">Sender From Name</span>
                  <input
                    type="text"
                    placeholder="Acme Recruitment Team"
                    value={smtpFromName}
                    onChange={(e) => setSmtpFromName(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">Reply-To Address</span>
                  <input
                    type="email"
                    placeholder="no-reply@yourdomain.com"
                    value={smtpReplyTo}
                    onChange={(e) => setSmtpReplyTo(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Branding Config */}
          <div className="space-y-6">
            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="pb-3 border-b border-border">
                <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Candidate Portal Branding</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-xs">
                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">Brand Logo URL</span>
                  <input
                    type="url"
                    placeholder="https://yourdomain.com/logo.png"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none"
                  />
                  <span className="text-[9px] text-muted-foreground/80 block">Public URL to your company logo (appears on candidate portal top header)</span>
                </div>

                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">Branding Primary Color</span>
                  <div className="flex gap-2.5 items-center">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-7 w-12 bg-secondary border border-border rounded outline-none cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      maxLength={7}
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-24 bg-secondary/30 border border-border rounded px-2 py-1 font-mono text-[11px] outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">Global Email & Portal Footer</span>
                  <textarea
                    rows={3}
                    placeholder="© 2026 Acme Corp. All rights reserved. If you have questions, please reach out to hiring@acme.com."
                    value={emailFooter}
                    onChange={(e) => setEmailFooter(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-semibold outline-none resize-none"
                  />
                  <span className="text-[9px] text-muted-foreground/80 block">Appended to custom emails and displayed at the bottom of the portal page.</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={saveSmtpAndBranding}
                disabled={saving}
                className="text-xs font-bold gap-1.5 shadow-sm"
              >
                <Save className="h-3.5 w-3.5" /> Save Configuration Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Email Templates Tab */}
      {activeTab === "templates" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Template Sidebar List */}
          <Card className="shadow-sm border-border bg-card md:col-span-1">
            <CardHeader className="pb-3 border-b border-border">
              <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">Select Template</CardTitle>
            </CardHeader>
            <CardContent className="pt-3 px-2 space-y-1">
              {[
                { name: "Interview Invite", desc: "For scheduling notifications" },
                { name: "Shortlisted", desc: "Sent when candidate matches" },
                { name: "Rejected", desc: "Sent to unsuccessful applicants" },
                { name: "Follow Up", desc: "Manual check-in update notification" }
              ].map(t => {
                const isSelected = selectedTemplateName === t.name;
                return (
                  <button
                    key={t.name}
                    onClick={() => handleTemplateChange(t.name)}
                    className={`w-full text-left p-2.5 rounded-md transition-all border ${
                      isSelected 
                        ? "bg-secondary border-border shadow-xs text-foreground font-bold" 
                        : "border-transparent text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
                    }`}
                  >
                    <span className="block text-xs font-bold leading-tight">{t.name}</span>
                    <span className="text-[9px] block text-slate-400 font-semibold mt-0.5">{t.desc}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Template Editor */}
          <div className="md:col-span-2 space-y-6">
            <Card className="shadow-sm border-border bg-card">
              <CardHeader className="pb-3 border-b border-border flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs uppercase tracking-wider font-bold text-foreground">
                    Edit: {selectedTemplateName}
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-[9px] font-bold bg-secondary/50 uppercase tracking-wider border-border/80 text-muted-foreground">HTML Enabled</Badge>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-xs">
                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">Email Subject Line</span>
                  <input
                    type="text"
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                    placeholder="Enter email subject"
                    className="w-full bg-secondary/30 border border-border rounded px-2.5 py-1.5 font-sans font-bold outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground">Template Body (HTML / Rich Text)</span>
                  <textarea
                    rows={12}
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    placeholder="<p>Dear {{candidate_name}},</p>..."
                    className="w-full bg-secondary/30 border border-border rounded p-2.5 font-mono text-[11px] outline-none leading-relaxed resize-y"
                  />
                </div>

                {/* Placeholders Card */}
                <div className="p-3 bg-secondary/30 rounded border border-border flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-sky-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1 text-[10px]">
                    <span className="font-bold text-foreground block">Dynamic Template Placeholders:</span>
                    <p className="text-muted-foreground font-semibold">
                      You can embed the following bracket parameters inside your subject and body to inject candidate details dynamically:
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1.5 font-semibold text-slate-400">
                      <div><code className="text-amber-500 text-[10px] font-mono">{"{{candidate_name}}"}</code> - Full Name</div>
                      <div><code className="text-amber-500 text-[10px] font-mono">{"{{job_title}}"}</code> - Job Title</div>
                      <div><code className="text-amber-500 text-[10px] font-mono">{"{{company_name}}"}</code> - Company Name</div>
                      <div><code className="text-amber-500 text-[10px] font-mono">{"{{portal_link}}"}</code> - Portal Web Address</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={saveEmailTemplate}
                disabled={saving}
                className="text-xs font-bold gap-1.5 shadow-sm"
              >
                <Save className="h-3.5 w-3.5" /> Save Template Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
