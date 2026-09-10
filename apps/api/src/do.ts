import { DurableObject } from 'cloudflare:workers';

import { configFromEnv } from './config.ts';
import { handleHttp, type HttpRequest, type HttpResponse } from './router.ts';
import {
  keys,
  INBOUND_RETENTION_MS,
  type ActivationRecord,
  type AttemptRecord,
  type InboundRecord,
  type LicenseRecord,
  type LicenseStore,
  type OtpRecord,
} from './store.ts';
import { type Env } from './worker.ts';

/**
 * The durable single-writer store: one Durable Object instance holds the
 * whole license database (SQLite-backed on Cloudflare's free plan). Its
 * storage methods mirror the LicenseStore interface, and `handleRequest` is
 * the RPC the Worker calls for every API request.
 */
export class LicenseStoreDO extends DurableObject<Env> implements LicenseStore {
  async getLicense(codeHash: string): Promise<LicenseRecord | null> {
    return (await this.ctx.storage.get<LicenseRecord>(keys.license(codeHash))) ?? null;
  }
  async upsertLicense(record: LicenseRecord): Promise<void> {
    await this.ctx.storage.put(keys.license(record.codeHash), record);
  }
  async setLicenseRevoked(codeHash: string, revoked: boolean): Promise<void> {
    const record = await this.getLicense(codeHash);
    if (record) {
      await this.ctx.storage.put(keys.license(codeHash), { ...record, revoked });
    }
  }
  async getActivation(codeHash: string): Promise<ActivationRecord | null> {
    return (await this.ctx.storage.get<ActivationRecord>(keys.activation(codeHash))) ?? null;
  }
  async setActivation(codeHash: string, record: ActivationRecord): Promise<void> {
    await this.ctx.storage.put(keys.activation(codeHash), record);
  }
  async clearActivation(codeHash: string): Promise<void> {
    await this.ctx.storage.delete(keys.activation(codeHash));
  }
  async getOtp(key: string): Promise<OtpRecord | null> {
    return (await this.ctx.storage.get<OtpRecord>(keys.otp(key))) ?? null;
  }
  async putOtp(key: string, record: OtpRecord): Promise<void> {
    await this.ctx.storage.put(keys.otp(key), record);
  }
  async markOtpUsed(key: string): Promise<void> {
    const record = await this.getOtp(key);
    if (record) {
      await this.ctx.storage.put(keys.otp(key), { ...record, used: true });
    }
  }
  async deleteOtp(key: string): Promise<void> {
    await this.ctx.storage.delete(keys.otp(key));
  }
  async getAttempts(emailHash: string): Promise<AttemptRecord | null> {
    return (await this.ctx.storage.get<AttemptRecord>(keys.attempts(emailHash))) ?? null;
  }
  async recordFailedAttempt(emailHash: string, windowEndsAt: number): Promise<void> {
    const current = await this.getAttempts(emailHash);
    await this.ctx.storage.put(keys.attempts(emailHash), {
      count: (current?.count ?? 0) + 1,
      windowEndsAt: current?.windowEndsAt ?? windowEndsAt,
    });
  }
  async clearAttempts(emailHash: string): Promise<void> {
    await this.ctx.storage.delete(keys.attempts(emailHash));
  }
  async getLastOtpSentAt(emailHash: string): Promise<number | null> {
    return (await this.ctx.storage.get<number>(keys.sentAt(emailHash))) ?? null;
  }
  async markOtpSent(emailHash: string): Promise<void> {
    await this.ctx.storage.put(keys.sentAt(emailHash), Date.now());
  }
  async getOtpSends(emailHash: string): Promise<AttemptRecord | null> {
    return (await this.ctx.storage.get<AttemptRecord>(keys.otpSends(emailHash))) ?? null;
  }
  async recordOtpSend(emailHash: string, windowEndsAt: number): Promise<void> {
    const current = await this.getOtpSends(emailHash);
    if (!current || Date.now() >= current.windowEndsAt) {
      await this.ctx.storage.put(keys.otpSends(emailHash), { count: 1, windowEndsAt });
      return;
    }
    await this.ctx.storage.put(keys.otpSends(emailHash), {
      count: current.count + 1,
      windowEndsAt: current.windowEndsAt,
    });
  }
  async getEmailVerifiedAt(emailHash: string): Promise<number | null> {
    return (await this.ctx.storage.get<number>(keys.verified(emailHash))) ?? null;
  }
  async markEmailVerified(emailHash: string): Promise<void> {
    await this.ctx.storage.put(keys.verified(emailHash), Date.now());
  }

  async putInbound(record: InboundRecord): Promise<void> {
    await this.ctx.storage.put(keys.inbound(record.id), record);
  }
  async getInbound(id: string): Promise<InboundRecord | null> {
    return (await this.ctx.storage.get<InboundRecord>(keys.inbound(id))) ?? null;
  }
  async listInbound(limit: number): Promise<InboundRecord[]> {
    // Inbound keys sort after all other prefixes; list newest first.
    const entries = await this.ctx.storage.list<InboundRecord>({ prefix: 'inb:', reverse: true, limit });
    return [...entries.values()];
  }
  async pruneInbound(before: number): Promise<number> {
    // receivedAt is in the record, not the key — list and filter.
    const stale = await this.ctx.storage.list<InboundRecord>({ prefix: 'inb:' });
    const expired: string[] = [];
    for (const [key, record] of stale) {
      if (record.receivedAt < before) expired.push(key);
    }
    await this.ctx.storage.delete(expired);
    return expired.length;
  }
  async markInboundAcked(id: string): Promise<void> {
    const record = await this.getInbound(id);
    if (record) {
      await this.ctx.storage.put(keys.inbound(id), { ...record, acked: true });
    }
  }

  /** RPC entry: runs the router against this object's durable storage. */
  async handleRequest(req: HttpRequest): Promise<HttpResponse> {
    const config = configFromEnv(this.env);
    const result = await handleHttp({ store: this, config }, req);

    // Opportunistic retention: prune inbound mail past the 90-day horizon on
    // any write-ish request (cheap: no-op most of the time).
    await this.pruneInbound(Date.now() - INBOUND_RETENTION_MS);

    return result;
  }
}