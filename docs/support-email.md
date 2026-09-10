# Support email — `support@calibreat.co.uk`

The legal pages (Terms, Refunds, Privacy, Download) and the app's help flow all
commit to **`support@calibreat.co.uk`**. This doc records how that address is
delivered and how to run it. It must be live **before checkout goes live** —
Terms §non-delivery and Refunds both tell buyers to email it.

**Decision (recorded):** receive mail via **Resend Inbound**, wired into the
existing license Worker (`POST /v1/webhook/inbound` — Svix-verified, deduped,
90-day metadata store, optional auto-ack from `SUPPORT_FROM`). No Cloudflare
zone needed — the only DNS change is one MX record at Fasthosts (the domain's
current DNS host). Full email content is read in the Resend dashboard or via
the Received Emails API; the Worker keeps only a metadata list.
Upgrade path: Zoho Mail / Google Workspace mailbox when volume justifies it.

> **Domain note:** all calibrEAT domains are consolidated on **`calibreat.co.uk`** —
> the deployed site, the support address, the OTP sender (`no-reply@calibreat.co.uk`)
> and the app's link constants all use it.

---

## Part A — Verify the domain for sending (required for both OTPs and receiving)

1. **Resend dashboard → Domains → Add Domain** → enter `calibreat.co.uk`
   → choose the region (EU if offered) → **Add**.
2. Resend shows the DNS records on the domain's details page (a DKIM TXT record
   named `resend._domainkey`, plus an SPF MX/TXT pair — newer domains may show
   CNAME records instead; copy **exactly what your dashboard shows**).
3. Add each record at **Fasthosts** (Domains → calibreat.co.uk → DNS / Advanced DNS):
   - Type, name and value copied character-for-character. If Fasthosts appends
     the domain to an MX value (e.g. `...amazonses.com.calibreat.co.uk`), add a
     trailing dot to the value.
4. Back in Resend, click **Verify** (or **Restart verification**). Green usually
   within 15 minutes; up to 72h worst case.
5. The OTP sender must then be `no-reply@calibreat.co.uk` — set via
   `EMAIL_FROM` (see Part D step 3).

## Part B — Enable receiving (the support inbox)

1. On the same domain's details page in Resend, find the **Receiving** section
   and toggle receiving **on**. A modal shows one **MX record** — add it at
   Fasthosts, then click **I've added the record** and wait for it to show
   **verified**.
   - ⚠️ If the domain ever gets real MX records for a mailbox provider, mail is
     delivered only to the **lowest-priority-number** MX — keep Resend's record
     the lowest, or move receiving to a subdomain instead.
2. **Test:** from your Gmail, email `support@calibreat.co.uk`. It appears in
   **Resend dashboard → Emails → Receiving tab** within a minute or two. Click
   it to read the full text/HTML. Resend stores mail even if the webhook is
   down — the dashboard is the system of record.

## Part C — Wire the webhook into the license Worker

1. Deploy the Worker first (the endpoint must exist): `apps/api` → `npm run deploy`.
2. **Resend dashboard → Webhooks → Add Webhook** → endpoint URL
   `https://<your-worker>.workers.dev/v1/webhook/inbound` → select the event
   **email.received** → **Add**.
3. Resend shows a signing secret once (`whsec_…`). Copy it, then:
   ```bash
   cd apps/api
   npx wrangler secret put RESEND_WEBHOOK_SECRET   # paste the whsec_ value
   npx wrangler secret put SUPPORT_FROM            # paste: calibrEAT <no-reply@calibreat.co.uk>
   ```
   (`SUPPORT_FROM` enables the auto-ack reply; leave unset to disable.)
4. **Test end-to-end:** email `support@calibreat.co.uk` again → the sender gets
   the auto-ack, and the metadata appears in the Worker's store:
   ```bash
   curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<your-worker>/v1/admin/inbound
   ```
   Each record carries `resendEmailId` — fetch the full body any time via
   `GET https://api.resend.com/emails/receiving/<resendEmailId>` (Bearer
   `RESEND_API_KEY`) or the dashboard's Receiving tab.

## Part D — Deliverability + final wiring (do not skip)

| # | Task | Where |
| --- | --- | --- |
| 1 | DMARC record: TXT, name `_dmarc`, value `v=DMARC1; p=none; rua=mailto:<your-gmail>` | Fasthosts DNS |
| 2 | OTP sender switch: `wrangler secret put EMAIL_FROM` → `calibrEAT <no-reply@calibreat.co.uk>` | terminal |
| 3 | Send an OTP test: request a verification code in the app (dev URL) and confirm it arrives **from** the new address — not in spam | app + Gmail |

DMARC starts at `p=none` (monitor only); tighten to `p=quarantine` after a few
clean weeks. Without it, support replies and re-sent license codes will land in
spam — fatal for a "we'll re-send your code" flow.

## Part E — Replying as the support address (optional, when needed)

Mail you send from your personal address comes from that address unless you
add a send-as identity:

1. Gmail: **Settings → Accounts → Send mail as → Add** → `support@calibreat.co.uk`.
2. SMTP when asked: host `smtp.resend.com`, port 587 (STARTTLS) or 465 (TLS),
   username `resend`, password = a Resend **API key** with sending access on
   the verified domain.
3. Confirm the verification email Gmail sends.

Cost: £0 (Resend free tier covers low reply volume; the 100 sends/day limit is
shared with OTP mail).

## Part F — Migrating later to a real mailbox (trigger, not a to-do)

Migrate when support volume outgrows the dashboard, you need a second operator,
or you want ticket history/retention tooling. Then: create a **Zoho Mail**
(~£1/user/mo) or **Google Workspace** (~£6/user/mo) mailbox, point the domain's
MX records at the provider (they give exact records — replacing Resend's),
and remove the Resend receiving domain. Nothing in the app or site changes;
disable the auto-ack by unsetting `SUPPORT_FROM`.

## Operations notes (UK GDPR)

- The inbox will contain buyer emails and order references. Resend retains
  received mail per its policy — export or delete resolved threads from the
  dashboard; the Worker's metadata store self-prunes after 90 days. Set a
  retention habit (e.g. resolved threads gone after 24 months) and note it in
  the privacy policy when support goes live.
- Never paste full license codes back into a reply; reference the last 4
  characters and re-send via the MoR's receipt/portal or the admin endpoint.
- The **MoR is seller of record** for payment disputes — forward payment/
  refund questions to their portal rather than re-litigating them in email.
- Only Resend webhooks signed with `RESEND_WEBHOOK_SECRET` are accepted by the
  Worker endpoint; unsigned or replayed deliveries are rejected.
