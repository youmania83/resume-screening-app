<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Memory Context
# [yogeshkumarwadhwa] recent context, 2026-06-19 12:15am GMT+5:30

## Completed Features
* **Dynamic Assessment Registration Portal:** Built at `/assessment/start/[jobId]`. Allows candidates to dynamically register (Name, Email, Phone) on mobile, tablet, or desktop, and enter tests without strict tab/proctor blockers.
* **Session Re-entry/Recovery:** Candidates can refresh or re-enter their details to resume their existing attempts seamlessly.
* **Keka ATS Integration Foundation:** Full implementation under `src/integrations/keka/` utilizing the **Adapter Pattern** (Mock and Real adapters). Exposes routes for webhook ingestion (`/api/webhooks/keka`), manual sync (`/api/integrations/keka/sync`), and configurations. It automates candidate pipeline stage routing based on AI score thresholds.
* **Zoho Mail Integration:** Ingests candidate applications from mailboxes, downloads and saves resume attachments locally in `/uploads/`, registers candidates and applications in the database, and schedules interview invitations using the **Adapter Pattern** (Mock and Real adapters). Implemented under `src/integrations/zoho/` and integrated with `src/lib/email.ts` for outgoing invitations.
* **Model-Agnostic LLM Wrapper:** Implemented a unified AI client layer in `src/lib/ai/` that abstracts text-generation models. Out-of-the-box support for **DeepSeek**, **OpenAI (GPT-4o-mini)**, and **Google Gemini (gemini-2.5-flash)** using lightweight HTTP requests. Configurable via `AI_PROVIDER` environment variable with dynamic fallback logic based on active API keys. Refactored `deepseek.ts` to route through `aiService` to guarantee backward compatibility.
* **Database Schema Upgrades:** Added the `education` column to the `candidates` table in PostgreSQL/Supabase and reordered database sync writes to insert `candidates` first, ensuring foreign key constraints are satisfied.
* **Stability & Crash-Guards:** Added global Express error handling middleware and Node process-level crash-guards (`unhandledRejection` and `uncaughtException` listeners) in `server.ts` to make backend workflows highly stable and crash-proof.
* **Project Directory Optimization:** Conducted a file cleanup audit deleting duplicate `next.config.ts` (keeping ESM-compliant `next.config.js`), outdated CommonJS `initDb.js`, and root-level `test_resume.txt` scratch files.

## Live Production Environments
* **Vercel URL (Frontend Client):** https://resume-screening-app-sage.vercel.app
* **Railway URL (Backend API & Worker):** https://resume-screening-app-databaseurl.up.railway.app
