# 📧 Client Email Onboarding Guide

## Overview

IRA AI Resume Screening supports multiple email providers. When delivering to a client, they need to configure **one** email provider to send automated emails (assessment invitations, interview scheduling, HR alerts).

> **VPS Hosting:** When hosted on a VPS (DigitalOcean, AWS EC2, Hetzner, etc.), all SMTP ports are open. All providers below will work without restrictions.

---

## Supported Email Providers

| Provider | Type | Best For | Free Tier |
|----------|------|----------|-----------|
| **Resend** | HTTP API | Easiest setup, no app passwords | 3,000 emails/month |
| **Gmail SMTP** | SMTP (Port 465) | Clients already using Google Workspace | N/A (included with Gmail) |
| **Zoho Mail** | SMTP (Port 465) | Clients using Zoho Workspace | Included with Zoho plan |
| **Outlook/O365** | SMTP (Port 465) | Enterprise clients on Microsoft 365 | Included with M365 plan |
| **SendGrid** | HTTP API | High-volume senders | 100 emails/day free |
| **Custom SMTP** | SMTP | Self-hosted mail servers | Varies |

---

## Option 1: Resend API (⭐ Recommended)

**Why Resend?** No app passwords needed. Works on any hosting (VPS, Railway, Vercel). Professional deliverability.

### Setup Steps:

1. **Create Resend account:** Go to [resend.com](https://resend.com) and sign up
2. **Verify domain:**
   - Go to [resend.com/domains](https://resend.com/domains)
   - Click **Add Domain** → enter client's domain (e.g., `clientcompany.com`)
   - Add the DNS records Resend provides (MX, TXT, DKIM)
   - Wait for verification (usually 5-30 minutes)
3. **Get API Key:**
   - Go to [resend.com/api-keys](https://resend.com/api-keys)
   - Click **Create API Key** → name it (e.g., "IRA Resume Screening")
   - Copy the key (starts with `re_`)
4. **Configure in Dashboard:**
   - Log in to IRA Dashboard → **Settings** → **SMTP & Branding**
   - **Email Provider:** Select `Resend API`
   - **SMTP Username:** Paste the Resend API Key
   - **SMTP Password:** Paste the same Resend API Key
   - **Sender Email:** `hr@clientcompany.com` (must match verified domain)
   - Click **Save Configuration Settings**
5. **Test:** Upload a resume and verify the assessment invitation email is received

---

## Option 2: Gmail SMTP

### Prerequisites:
- Google Workspace or Gmail account
- **2-Factor Authentication** must be enabled on the Google account
- **Google App Password** is required (regular Gmail password will NOT work)

### Generate App Password:

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Sign in with the Gmail account that will send emails
3. Under **App name**, type `IRA Resume Screening`
4. Click **Create**
5. Copy the 16-character password (e.g., `abcd efgh ijkl mnop`)

### Configure in Dashboard:

1. Log in to IRA Dashboard → **Settings** → **SMTP & Branding**
2. **Email Provider:** Select `Gmail SMTP (Requires App Password)`
3. Fields will auto-fill:
   - **SMTP Host:** `smtp.gmail.com`
   - **SMTP Port:** `465`
4. **SMTP Username:** Full Gmail address (e.g., `hr@clientcompany.com`)
5. **SMTP Password:** Paste the 16-character App Password (NOT the Gmail password)
6. **Sender Email:** Same Gmail address as username
7. Click **Save Configuration Settings**

### ⚠️ Important Notes:
- Gmail has a daily sending limit of **500 emails** (personal) or **2,000 emails** (Workspace)
- The App Password is different from the regular Google password
- If 2FA is not enabled, App Passwords won't be available

---

## Option 3: Zoho Mail SMTP

### Prerequisites:
- Zoho Mail account (free or paid plan)
- Zoho App-Specific Password (if 2FA is enabled)

### Configure in Dashboard:

1. Log in to IRA Dashboard → **Settings** → **SMTP & Branding**
2. **Email Provider:** Select `Zoho Mail SMTP`
3. Fields will auto-fill:
   - **SMTP Host:** `smtp.zoho.com`
   - **SMTP Port:** `465`
4. **SMTP Username:** Full Zoho email (e.g., `hr@clientcompany.com`)
5. **SMTP Password:** Zoho password or App-Specific Password
6. **Sender Email:** Same Zoho email as username
7. Click **Save Configuration Settings**

### ⚠️ Important Notes:
- If using Zoho free plan, ensure SMTP access is enabled in Zoho Mail settings
- For Zoho EU/India datacenter, host may need to be `smtp.zoho.eu` or `smtp.zoho.in`
- Zoho daily limit: **200 emails/day** (free) or varies by plan

---

## Option 4: Outlook / Microsoft 365 SMTP

### Configure in Dashboard:

1. Log in to IRA Dashboard → **Settings** → **SMTP & Branding**
2. **Email Provider:** Select `Outlook / Office 365 SMTP`
3. Fields will auto-fill:
   - **SMTP Host:** `smtp.office365.com`
   - **SMTP Port:** `465`
4. **SMTP Username:** Full email address (e.g., `hr@clientcompany.com`)
5. **SMTP Password:** Microsoft account password or App Password (if 2FA enabled)
6. **Sender Email:** Same email as username
7. Click **Save Configuration Settings**

### ⚠️ Important Notes:
- Microsoft may require admin approval for SMTP AUTH in the Microsoft 365 Admin Center
- Go to **Admin Center → Active Users → Select User → Mail → Manage Email Apps** → Enable **Authenticated SMTP**

---

## Option 5: Custom SMTP Server

For clients running their own mail server (Postfix, hMailServer, etc.):

1. **Email Provider:** Select `Custom SMTP Server`
2. All fields become editable:
   - **SMTP Host:** Client's mail server hostname
   - **SMTP Port:** Usually `465` (SSL) or `587` (STARTTLS)
   - **SMTP Username:** Full email address
   - **SMTP Password:** Mail server password
3. **Sender Email:** Must match an email address the server is authorized to send from

---

## Emails Sent by the System

Once configured, the system automatically sends these emails:

| Email | Trigger | Recipient |
|-------|---------|-----------|
| **Assessment Invitation** | Resume uploaded + AI screening score ≥ threshold | Candidate |
| **Interview Scheduling** | Candidate passes assessment (≥ 80% final score) | Candidate + HR Manager |
| **HR Alert** | Qualified candidate identified | HR Manager / Recruiter |

---

## Troubleshooting

### "Email shows sent but not received"
1. Check spam/junk folder
2. Verify the sender email matches the authenticated account
3. For Gmail: Ensure you're using an **App Password**, not the regular password
4. Check the Railway/VPS logs for error messages

### "Authentication failed"
1. For Gmail: Regenerate the App Password
2. For Zoho: Ensure SMTP access is enabled in account settings
3. For Outlook: Enable Authenticated SMTP in Microsoft 365 Admin Center

### "Connection timeout"
1. If on Railway/cloud hosting: Use **Resend API** instead of SMTP
2. If on VPS: Ensure firewall allows outbound port 465
3. Run: `telnet smtp.gmail.com 465` from the VPS to verify connectivity

---

## VPS Deployment Checklist

When deploying to a VPS, ensure:

- [ ] Node.js 18+ installed
- [ ] PostgreSQL database accessible
- [ ] Redis server running (for BullMQ job queue)
- [ ] Firewall allows outbound ports: `443` (HTTPS), `465` (SMTP SSL), `587` (SMTP STARTTLS)
- [ ] Environment variables set (`.env`)
- [ ] PM2 or systemd configured for process management
- [ ] SSL certificate installed (Let's Encrypt recommended)
- [ ] Domain DNS pointed to VPS IP address
