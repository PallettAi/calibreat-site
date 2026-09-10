// Sends a correctly Svix-signed email.received event to the deployed worker
// to verify the inbound webhook path end-to-end without needing a real email.
// Usage: node scripts/test-inbound-webhook.mjs <worker-url> <whsec>
import { Webhook } from "svix";

const [url, secret] = process.argv.slice(2);
if (!url || !secret) {
  console.error("Usage: node scripts/test-inbound-webhook.mjs <worker-url> <whsec>");
  process.exit(1);
}

const wh = new Webhook(secret);
const msgId = `msgtest_${Date.now()}`;
const timestamp = new Date();
const payload = JSON.stringify({
  type: "email.received",
  created_at: timestamp.toISOString(),
  data: {
    email_id: `sim-${Date.now()}`,
    from: "Simulated Sender <sim@example.com>",
    to: ["support@calibreat.co.uk"],
    subject: "Simulated webhook test",
  },
});

const signature = wh.sign(msgId, timestamp, payload);

const res = await fetch(`${url.replace(/\/$/, "")}/v1/webhook/inbound`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "svix-id": msgId,
    "svix-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
    "svix-signature": signature,
  },
  body: payload,
});

console.log("HTTP", res.status, await res.text());
