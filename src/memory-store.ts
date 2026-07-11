/**
 * In-memory implementations of AuditDb and SpendLedger, purely so the
 * demo can run with zero setup — no database required. Swap for a real
 * Postgres/Redis-backed implementation in production; the interfaces
 * in audit-chain.ts and spend-gate.ts are what matter, not this file.
 */

import type { AuditDb, AuditEntry } from "./audit-chain";
import type { SpendLedger } from "./spend-gate";

export class MemoryAuditDb implements AuditDb {
  private entries: AuditEntry[] = [];
  private nextId = 1;

  async getLastHash(scopeId: string): Promise<string | null> {
    const scoped = this.entries.filter((e) => e.scopeId === scopeId);
    return scoped.length ? scoped[scoped.length - 1].entryHash : null;
  }

  async insertEntry(entry: Omit<AuditEntry, "id">): Promise<{ id: number }> {
    const id = this.nextId++;
    this.entries.push({ ...entry, id });
    return { id };
  }

  getEntriesForScope(scopeId: string): AuditEntry[] {
    return this.entries.filter((e) => e.scopeId === scopeId);
  }

  getAllEntries(): AuditEntry[] {
    return this.entries;
  }
}

export class MemorySpendLedger implements SpendLedger {
  private spends: { walletId: string; agentId: string; amount: number; at: Date }[] = [];

  record(walletId: string, agentId: string, amount: number) {
    this.spends.push({ walletId, agentId, amount, at: new Date() });
  }

  async getSpentSince(walletId: string, agentId: string, since: Date): Promise<number> {
    return this.spends
      .filter((s) => s.walletId === walletId && s.agentId === agentId && s.at >= since)
      .reduce((sum, s) => sum + s.amount, 0);
  }
}
