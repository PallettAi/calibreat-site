/**
 * Email delivery for the 6-digit verification code (Resend API).
 *
 * - `resendApiKey` set  → sent through Resend (production).
 * - otherwise           → logged to the console and captured in
 *   `devCapturedOtps` so the flow works locally (wrangler dev) and in tests.
 */

export const devCapturedOtps: Record<string, string> = {};

export async function sendVerificationEmail(
  email: string,
  otp: string,
  apiKey: string,
  from: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!apiKey) {
    devCapturedOtps[email] = otp;
    console.log(
      `[calibrEAT] 📧 verification code for ${email}: ${otp} ` +
        '(no RESEND_API_KEY configured — dev mode)',
    );
    return { ok: true };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Your calibrEAT verification code',
        text: [
          'Hi,',
          '',
          'Your calibrEAT verification code is:',
          '',
          `  ${otp}`,
          '',
          'Enter it in the app to verify this device. It expires in 10 minutes.',
          '',
          "If you didn't request this code, you can safely ignore this email.",
          '',
          '— The calibrEAT team',
        ].join('\n'),
        html: [
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>',
          '<body style="margin:0;padding:0;background:#0a1019">',
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1019;padding:24px 12px"><tr><td align="center">',
          '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;border-radius:16px;overflow:hidden">',
          // ── Header: navy, mark + wordmark (matches the support auto-ack) ──
          '<tr><td style="background:#0a1019;padding:28px 28px 20px">',
          '<table role="presentation" cellpadding="0" cellspacing="0"><tr>',
          `<td style="padding-right:12px"><img src="${MARK_URL}" width="48" height="48" alt="calibrEAT" style="display:block;border-radius:10px"></td>`,
          '<td style="font-family:Sora,Inter,system-ui,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#eef2f5">calibr<span style="color:#b7e93c">EAT</span></td>',
          '</tr></table>',
          '</td></tr>',
          // ── Body: white ──
          '<tr><td style="background:#ffffff;padding:28px 28px 28px">',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#101820;margin:0 0 20px">Hi — here is your calibrEAT verification code:</p>',
          '<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td align="center" style="background:#0a1019;border-radius:14px;padding:18px 36px">',
          `<span style="font-family:Sora,Inter,system-ui,sans-serif;font-size:38px;font-weight:800;letter-spacing:10px;color:#b7e93c">${otp}</span>`,
          '</td></tr></table>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#46525c;margin:0 0 8px;text-align:center">Enter it in the app to verify this device.</p>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.6;color:#7d8a96;margin:0 0 20px;text-align:center">It expires in <strong style="color:#46525c">10 minutes</strong> and can be used once.</p>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:12px;line-height:1.6;color:#7d8a96;margin:0;text-align:center">Didn\'t request this code? You can safely ignore this email.</p>',
          '</td></tr>',
          // ── Footer: navy strip ──
          '<tr><td style="background:#0e1623;padding:18px 28px">',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:13px;color:#a7b2bc;margin:0 0 6px">— The calibrEAT team</p>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:12px;color:#7d8a96;margin:0">Need help? <a href="mailto:support@calibreat.co.uk" style="color:#a7b2bc">support@calibreat.co.uk</a> · <a href="https://calibreat.co.uk" style="color:#a7b2bc">calibreat.co.uk</a></p>',
          '</td></tr>',
          '</table>',
          '</td></tr></table>',
          '</body></html>',
        ].join(''),
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.log(`[calibrEAT] Resend verification send failed ${response.status}: ${detail.slice(0, 500)}`);
      // Surface Resend's message when it explains the problem (domain not verified, etc.)
      try {
        const parsed = JSON.parse(detail) as { message?: string; error?: string };
        const msg = parsed.message || parsed.error;
        if (msg) return { ok: false, message: `Email provider error (${response.status}): ${msg}` };
      } catch {}
      return { ok: false, message: `Email provider error (${response.status})` };
    }
    return { ok: true };
  } catch (e) {
    console.log(`[calibrEAT] Resend fetch threw: ${String(e).slice(0, 500)}`);
    return { ok: false, message: 'Could not reach the email provider' };
  }
}

/**
 * Support auto-acknowledgement, sent when a support email arrives at
 * `support@calibreat.co.uk` (Resend Inbound → /v1/webhook/inbound).
 * The ack is a courtesy, never a dependency — but the result is reported so
 * the caller only records `acked: true` when Resend actually accepted it.
 *
 * Branded with the site's design system (apps/web): navy #0A1019, lime
 * #B7E93C, green #1F9D55, Sora/Inter. The mark is a PNG hosted on the site
 * (Gmail blocks SVG); wordmark is text so it always renders.
 */
const MARK_URL = 'https://calibreat.co.uk/assets/email-mark-dark.png';

const ACK_TEXT = [
  'Hi,',
  '',
  'Thanks for contacting calibrEAT support. Your message has been received and',
  'you will get a response within 48 hours — usually much faster.',
  '',
  'In the meantime, these may help:',
  '',
  '• Lost activation code — your code is included in your original purchase',
  '  receipt. See also: https://calibreat.co.uk/license.html#faq',
  '• Moving to a new device — open the app menu and use "Deactivate on this',
  '  device" first, then activate on the new one with the same code and email.',
  '• Download the app: https://calibreat.co.uk/download.html',
  '',
  '— The calibrEAT team',
].join('\n');

const ACK_HTML = [
  '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>',
  '<body style="margin:0;padding:0;background:#0a1019">',
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1019;padding:24px 12px"><tr><td align="center">',
  '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;border-radius:16px;overflow:hidden">',
  // ── Header: navy, mark + wordmark ──
  '<tr><td style="background:#0a1019;padding:28px 28px 20px">',
  `<table role="presentation" cellpadding="0" cellspacing="0"><tr>`,
  `<td style="padding-right:12px"><img src="${MARK_URL}" width="48" height="48" alt="calibrEAT" style="display:block;border-radius:10px"></td>`,
  '<td style="font-family:Sora,Inter,system-ui,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#eef2f5">calibr<span style="color:#b7e93c">EAT</span></td>',
  '</tr></table>',
  '</td></tr>',
  // ── Body: white ──
  '<tr><td style="background:#ffffff;padding:28px 28px 8px">',
  '<p style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#101820;margin:0 0 16px">Thanks for contacting calibrEAT support — your message has been received.</p>',
  '<p style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#101820;margin:0 0 24px">You will get a response <strong>within 48 hours</strong> — usually much faster.</p>',
  '<p style="font-family:Inter,system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0e6b38;margin:0 0 12px">While you wait</p>',
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2ee;border-radius:12px;margin:0 0 24px"><tr><td style="padding:18px 20px">',
  '<p style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#101820;margin:0 0 12px">🔑 <strong>Lost your activation code?</strong><br>It\'s included in your original purchase receipt, or see the <a href="https://calibreat.co.uk/license.html#faq" style="color:#0e6b38;font-weight:600">license FAQ</a>.</p>',
  '<p style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#101820;margin:0 0 12px">📱 <strong>Moving to a new device?</strong><br>Use "Deactivate on this device" in the app menu first, then activate on the new one with the same code and email.</p>',
  '<p style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.6;color:#101820;margin:0">⬇️ <strong>Need to install the app?</strong><br><a href="https://calibreat.co.uk/download.html" style="color:#0e6b38;font-weight:600">Download it here</a>.</p>',
  '</td></tr></table>',
  '</td></tr>',
  // ── Footer: navy strip ──
  '<tr><td style="background:#0e1623;padding:18px 28px">',
  '<p style="font-family:Inter,system-ui,sans-serif;font-size:13px;color:#a7b2bc;margin:0 0 6px">— The calibrEAT team</p>',
  '<p style="font-family:Inter,system-ui,sans-serif;font-size:12px;color:#7d8a96;margin:0">Support: <a href="mailto:support@calibreat.co.uk" style="color:#a7b2bc">support@calibreat.co.uk</a> · <a href="https://calibreat.co.uk" style="color:#a7b2bc">calibreat.co.uk</a></p>',
  '</td></tr>',
  '</table>',
  '</td></tr></table>',
  '</body></html>',
].join('');

/**
 * License delivery email, sent when a purchase webhook registers a new
 * license. Branded to match the OTP + support templates (navy/lime, Sora).
 * A courtesy, never a dependency — failures are logged, not fatal.
 */
export async function sendLicenseDeliveryEmail(
  to: string,
  code: string,
  apiKey: string,
  from: string,
): Promise<void> {
  if (!apiKey || !from) return;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: 'support@calibreat.co.uk',
        subject: 'Your calibrEAT license — welcome aboard',
        text: [
          'Hi,',
          '',
          'Thank you for purchasing calibrEAT! Here is your license code:',
          '',
          `  ${code}`,
          '',
          'To activate:',
          '1. Install the app: https://calibreat.co.uk/download.html',
          '2. Open calibrEAT and enter your email address.',
          '3. Enter the 6-digit verification code we email you.',
          '4. Enter this license code when asked.',
          '',
          'Keep this email — your code is also in your purchase receipt. Your',
          'license moves with you: use "Deactivate on this device" in the app',
          'menu before switching phones.',
          '',
          'Need a hand? Just reply to this email.',
          '',
          '— The calibrEAT team',
        ].join('\n'),
        html: [
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>',
          '<body style="margin:0;padding:0;background:#0a1019">',
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a1019;padding:24px 12px"><tr><td align="center">',
          '<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;border-radius:16px;overflow:hidden">',
          // ── Header: navy, mark + wordmark ──
          '<tr><td style="background:#0a1019;padding:28px 28px 20px">',
          '<table role="presentation" cellpadding="0" cellspacing="0"><tr>',
          `<td style="padding-right:12px"><img src="${MARK_URL}" width="48" height="48" alt="calibrEAT" style="display:block;border-radius:10px"></td>`,
          '<td style="font-family:Sora,Inter,system-ui,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#eef2f5">calibr<span style="color:#b7e93c">EAT</span></td>',
          '</tr></table>',
          '</td></tr>',
          // ── Body: white ──
          '<tr><td style="background:#ffffff;padding:28px 28px 8px">',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.6;color:#101820;margin:0 0 20px">Thank you for purchasing calibrEAT — here is your license code:</p>',
          '<table role="presentation" align="center" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td align="center" style="background:#f0f2ee;border-radius:14px;padding:20px 24px">',
          `<span style="font-family:Sora,Inter,system-ui,sans-serif;font-size:28px;font-weight:800;letter-spacing:4px;color:#0a1019">${code}</span>`,
          '</td></tr></table>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0e6b38;margin:0 0 12px">Activate in 4 steps</p>',
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2ee;border-radius:12px;margin:0 0 20px"><tr><td style="padding:18px 20px">',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.7;color:#101820;margin:0 0 8px"><strong style="color:#0e6b38">1.</strong> Install the app — <a href="https://calibreat.co.uk/download.html" style="color:#0e6b38;font-weight:600">calibreat.co.uk/download</a></p>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.7;color:#101820;margin:0 0 8px"><strong style="color:#0e6b38">2.</strong> Open calibrEAT and enter your email address</p>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.7;color:#101820;margin:0 0 8px"><strong style="color:#0e6b38">3.</strong> Enter the 6-digit verification code we email you</p>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:14px;line-height:1.7;color:#101820;margin:0"><strong style="color:#0e6b38">4.</strong> Enter this license code when asked</p>',
          '</td></tr></table>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.6;color:#46525c;margin:0 0 8px">Keep this email — your code is also in your purchase receipt.</p>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:13px;line-height:1.6;color:#46525c;margin:0 0 20px">Your license moves with you: use <strong>"Deactivate on this device"</strong> in the app menu before switching phones.</p>',
          '</td></tr>',
          // ── Footer: navy strip ──
          '<tr><td style="background:#0e1623;padding:18px 28px">',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:13px;color:#a7b2bc;margin:0 0 6px">— The calibrEAT team</p>',
          '<p style="font-family:Inter,system-ui,sans-serif;font-size:12px;color:#7d8a96;margin:0">Need a hand? Just reply to this email · <a href="https://calibreat.co.uk" style="color:#a7b2bc">calibreat.co.uk</a></p>',
          '</td></tr>',
          '</table>',
          '</td></tr></table>',
          '</body></html>',
        ].join(''),
      }),
    });
    if (!response.ok) {
      console.log(`[calibrEAT] ⚠️ license delivery email to ${to} rejected (${response.status})`);
      return;
    }
  } catch {
    console.log(`[calibrEAT] ⚠️ license delivery email to ${to} could not be sent`);
  }
}

export async function sendSupportAck(
  to: string,
  apiKey: string,
  from: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!apiKey || !from) return { ok: true };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: from,
        subject: 'We got your message — calibrEAT support',
        text: ACK_TEXT,
        html: ACK_HTML,
      }),
    });
    if (!response.ok) {
      console.log(`[calibrEAT] ⚠️ support ack to ${to} rejected (${response.status})`);
      return { ok: false, message: `Email provider error (${response.status})` };
    }
    return { ok: true };
  } catch {
    console.log(`[calibrEAT] ⚠️ support ack to ${to} could not be sent`);
    return { ok: false, message: 'Could not reach the email provider' };
  }
}