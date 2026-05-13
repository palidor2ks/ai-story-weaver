## Goal

Two separate email systems on `polipulseapp.com`, working side-by-side without conflicts:

1. **Personal mailbox** — `you@polipulseapp.com` via **Zoho Mail** (free tier, you read/send like Gmail)
2. **App emails** — `notify@notify.polipulseapp.com` via **Lovable Emails** (auth + transactional, branded)

These two coexist because Zoho uses the **root domain** (`polipulseapp.com`) and Lovable uses a dedicated **subdomain** (`notify.polipulseapp.com`). No DNS conflict.

---

## Part A — Zoho Mail (personal inbox) — manual steps for you

I cannot create your Zoho account or add MX records on your registrar. You do these steps; I'll be on standby for questions.

### A1. Sign up at Zoho
1. Go to https://www.zoho.com/mail/zohomail-pricing.html
2. Choose the **Forever Free Plan** (1 user, 5 GB, web access)
3. Sign up with `polipulseapp.com` as your domain

### A2. Verify domain ownership
Zoho will give you a TXT record like `zoho-verification=zb12345678.zmverify.zoho.com`. Add it at your domain registrar:
- **Type:** TXT
- **Host:** `@`
- **Value:** the string Zoho gives you

### A3. Create your mailbox
After verification, create the user (e.g. `you@polipulseapp.com`) inside Zoho's admin console.

### A4. Add MX records (delivers mail to Zoho)
At your domain registrar, add these on the **root domain** (`@`):

| Type | Host | Priority | Value |
|---|---|---|---|
| MX | @ | 10 | `mx.zoho.com` |
| MX | @ | 20 | `mx2.zoho.com` |
| MX | @ | 50 | `mx3.zoho.com` |

### A5. Add SPF + DKIM (deliverability)

| Type | Host | Value |
|---|---|---|
| TXT | @ | `v=spf1 include:zoho.com ~all` |
| TXT | (Zoho-provided) | (Zoho-provided DKIM key) |

Wait up to 24 h for DNS propagation. Then sign in at https://mail.zoho.com.

> **Note:** If you bought polipulseapp.com through Lovable, you can manage these records inside Lovable: **Project Settings → Domains → ⋯ → Configure → Manage DNS records.**

---

## Part B — Lovable Emails (branded app emails) — I do this

This is what I can build for you. Once you confirm this plan, I'll:

### B1. Set up sender domain `notify.polipulseapp.com`
Open the email setup dialog so you can add the sender subdomain. Lovable adds NS records to delegate that subdomain only — your root-domain Zoho records are untouched.

### B2. Provision email infrastructure
- Email queue (pgmq), send-log table, suppression list, unsubscribe tokens
- Cron dispatcher that drains the queue every 5 s with retries

### B3. Scaffold + brand auth email templates
6 templates (signup confirm, password reset, magic link, invite, email change, reauthentication) styled to match PoliPulse (gradient hero, Sparkles icon, your color tokens). Body background white per email best practice.

### B4. Scaffold transactional email infrastructure
- `send-transactional-email` Edge Function (single entry point)
- `handle-email-unsubscribe` + `handle-email-suppression` webhooks
- Branded `/unsubscribe` page in the app
- Initial transactional templates:
  - **Claim approved** — sent when an admin approves a profile claim
  - **Claim rejected** — sent when a claim is rejected with reason
  - **Welcome** — sent after signup verification

### B5. Wire triggers
- In `useProfileClaims` approval/rejection flow → invoke `send-transactional-email`
- In signup confirmation handler → invoke welcome template
- All sends use `idempotencyKey` derived from claim/user ID for retry safety

### B6. Deploy + verify
Deploy all edge functions. Tell you to monitor DNS verification at **Cloud → Emails**. Once `notify.polipulseapp.com` is active (usually < 1 h, up to 72 h), auth emails immediately stop using default Lovable templates and start using your branded ones.

---

## Out of scope

- Marketing emails / newsletters / bulk sends (Lovable doesn't support these — would need Mailchimp/etc.)
- Migrating existing email data into Zoho
- Custom domains beyond polipulseapp.com

---

## What you do vs what I do

| Step | Who |
|---|---|
| A1–A5 (Zoho signup, MX/SPF/DKIM at registrar) | **You** |
| B1 (click "Set up email domain" button I'll show) | **You** (one click) |
| B2–B6 (infrastructure, templates, code, deploy) | **Me** |

Approve this plan and I'll start with Part B immediately, then walk you through Part A in parallel.
