/**
 * Storage interface + in-memory implementation.
 *
 * The Worker's Durable Object (src/do.ts) implements the same interface over
 * its SQLite-backed storage, and tests use the in-memory store below — so the
 * router's policy code is exercised identically in both runtimes.
 */

export type LicenseRecord = {
  codeHash: string;
  email: string;
  createdAt: string;
  revoked: boolean;
};

export type ActivationRecord = {
  email: string;
  installId: string;
  activatedAt: string;
  /** Best-effort phone label from the client, e.g. "Pixel 8". */
  deviceLabel?: string;
};

export type OtpRecord = {
  email: string;
  expiresAt: number;
  used: boolean;
};

export type AttemptRecord = { count: number; windowEndsAt: number };

/** An inbound support email received via the Resend Inbound webhook. */
export type InboundRecord = {
  /** Svix event id — used for retry dedupe. */
  id: string;
  receivedAt: number;
  from: string;
  subject: string;
  /** Resend email id — the body lives in Resend; fetch via GET /emails/receiving/:id. */
  resendEmailId: string;
  acked: boolean;
};

/** Prune horizon for stored inbound mail (Resend retains the full content). */
export const INBOUND_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface LicenseStore {
  getLicense(codeHash: string): Promise<LicenseRecord | null>;
  upsertLicense(record: LicenseRecord): Promise<void>;
  setLicenseRevoked(codeHash: string, revoked: boolean): Promise<void>;
  getActivation(codeHash: string): Promise<ActivationRecord | null>;
  setActivation(codeHash: string, record: ActivationRecord): Promise<void>;
  clearActivation(codeHash: string): Promise<void>;
  getOtp(key: string): Promise<OtpRecord | null>;
  putOtp(key: string, record: OtpRecord): Promise<void>;
  markOtpUsed(key: string): Promise<void>;
  deleteOtp(key: string): Promise<void>;
  getAttempts(emailHash: string): Promise<AttemptRecord | null>;
  recordFailedAttempt(emailHash: string, windowEndsAt: number): Promise<void>;
  clearAttempts(emailHash: string): Promise<void>;
  getLastOtpSentAt(emailHash: string): Promise<number | null>;
  markOtpSent(emailHash: string): Promise<void>;
  getOtpSends(emailHash: string): Promise<AttemptRecord | null>;
  recordOtpSend(emailHash: string, windowEndsAt: number): Promise<void>;
  getEmailVerifiedAt(emailHash: string): Promise<number | null>;
  markEmailVerified(emailHash: string): Promise<void>;
  putInbound(record: InboundRecord): Promise<void>;
  getInbound(id: string): Promise<InboundRecord | null>;
  listInbound(limit: number): Promise<InboundRecord[]>;
  /** Deletes inbound records older than `before` — returns how many were removed. */
  pruneInbound(before: number): Promise<number>;
  markInboundAcked(id: string): Promise<void>;
}

/** Key prefixes keep the Durable Object storage namespaced. */
export const keys = {
  license: (codeHash: string) => `lic:${codeHash}`,
  activation: (codeHash: string) => `act:${codeHash}`,
  otp: (otpKey: string) => `otp:${otpKey}`,
  attempts: (emailHash: string) => `att:${emailHash}`,
  sentAt: (emailHash: string) => `sent:${emailHash}`,
  otpSends: (emailHash: string) => `snd:${emailHash}`,
  verified: (emailHash: string) => `ver:${emailHash}`,
  inbound: (id: string) => `inb:${id}`,
} as const;

/** In-memory implementation used by the node:test suite. */
export class InMemoryStore implements LicenseStore {
  private licenses = new Map<string, LicenseRecord>();
  private activations = new Map<string, ActivationRecord>();
  private otps = new Map<string, OtpRecord>();
  private attempts = new Map<string, AttemptRecord>();
  private sentAt = new Map<string, number>();
  private otpSends = new Map<string, AttemptRecord>();
  private verifiedAt = new Map<string, number>();

  async getLicense(codeHash: string): Promise<LicenseRecord | null> {
    return this.licenses.get(keys.license(codeHash)) ?? null;
  }
  async upsertLicense(record: LicenseRecord): Promise<void> {
    this.licenses.set(keys.license(record.codeHash), record);
  }
  async setLicenseRevoked(codeHash: string, revoked: boolean): Promise<void> {
    const record = this.licenses.get(keys.license(codeHash));
    if (record) record.revoked = revoked;
  }
  async getActivation(codeHash: string): Promise<ActivationRecord | null> {
    return this.activations.get(keys.activation(codeHash)) ?? null;
  }
  async setActivation(codeHash: string, record: ActivationRecord): Promise<void> {
    this.activations.set(keys.activation(codeHash), record);
  }
  async clearActivation(codeHash: string): Promise<void> {
    this.activations.delete(keys.activation(codeHash));
  }
  async getOtp(key: string): Promise<OtpRecord | null> {
    return this.otps.get(keys.otp(key)) ?? null;
  }
  async putOtp(key: string, record: OtpRecord): Promise<void> {
    this.otps.set(keys.otp(key), record);
  }
  async markOtpUsed(key: string): Promise<void> {
    const record = this.otps.get(keys.otp(key));
    if (record) record.used = true;
  }
  async deleteOtp(key: string): Promise<void> {
    this.otps.delete(keys.otp(key));
  }
  async getAttempts(emailHash: string): Promise<AttemptRecord | null> {
    return this.attempts.get(keys.attempts(emailHash)) ?? null;
  }
  async recordFailedAttempt(emailHash: string, windowEndsAt: number): Promise<void> {
    const current = this.attempts.get(keys.attempts(emailHash));
    this.attempts.set(keys.attempts(emailHash), {
      count: (current?.count ?? 0) + 1,
      windowEndsAt: current?.windowEndsAt ?? windowEndsAt,
    });
  }
  async clearAttempts(emailHash: string): Promise<void> {
    this.attempts.delete(keys.attempts(emailHash));
  }
  async getLastOtpSentAt(emailHash: string): Promise<number | null> {
    return this.sentAt.get(keys.sentAt(emailHash)) ?? null;
  }
  async markOtpSent(emailHash: string): Promise<void> {
    this.sentAt.set(keys.sentAt(emailHash), Date.now());
  }
  async getOtpSends(emailHash: string): Promise<AttemptRecord | null> {
    return this.otpSends.get(keys.otpSends(emailHash)) ?? null;
  }
  async recordOtpSend(emailHash: string, windowEndsAt: number): Promise<void> {
    const current = this.otpSends.get(keys.otpSends(emailHash));
    if (!current || Date.now() >= current.windowEndsAt) {
      this.otpSends.set(keys.otpSends(emailHash), { count: 1, windowEndsAt });
      return;
    }
    this.otpSends.set(keys.otpSends(emailHash), {
      count: current.count + 1,
      windowEndsAt: current.windowEndsAt,
    });
  }
  async getEmailVerifiedAt(emailHash: string): Promise<number | null> {
    return this.verifiedAt.get(keys.verified(emailHash)) ?? null;
  }
  async markEmailVerified(emailHash: string): Promise<void> {
    this.verifiedAt.set(keys.verified(emailHash), Date.now());
  }

  private inbound = new Map<string, InboundRecord>();

  async putInbound(record: InboundRecord): Promise<void> {
    this.inbound.set(record.id, record);
  }
  async getInbound(id: string): Promise<InboundRecord | null> {
    return this.inbound.get(id) ?? null;
  }
  async listInbound(limit: number): Promise<InboundRecord[]> {
    return [...this.inbound.values()].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, limit);
  }
  async pruneInbound(before: number): Promise<number> {
    let removed = 0;
    for (const [id, record] of this.inbound) {
      if (record.receivedAt < before) {
        this.inbound.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
  async markInboundAcked(id: string): Promise<void> {
    const record = this.inbound.get(id);
    if (record) record.acked = true;
  }
}