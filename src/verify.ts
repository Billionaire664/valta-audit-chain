import crypto from "node:crypto";
import type { AuditEntry } from "./audit-chain";

export type VerificationResult = {
  valid: boolean;
  brokenAtId?: number;
  reason?: string;
};

/**
 * Walks a chain of entries (must be ordered oldest -> newest, same scope)
 * and confirms each entry's previousEntryHash matches the prior entry's
 * entryHash, AND that the stored entryHash matches a recomputed hash of
 * the entry's own payload. Either mismatch means the chain was tampered
 * with or entries were reordered/deleted.
 */
export function verifyChain(entries: AuditEntry[]): VerificationResult {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedPrevHash = i === 0 ? "genesis" : entries[i - 1].entryHash;

    if (entry.previousEntryHash !== expectedPrevHash) {
      return {
        valid: false,
        brokenAtId: entry.id,
        reason: `Entry ${entry.id} references previous hash "${entry.previousEntryHash}" but the actual previous entry's hash is "${expectedPrevHash}". Chain broken — entries were likely reordered, deleted, or edited.`,
      };
    }

    const recomputed = recomputeHash(entry);
    if (recomputed !== entry.entryHash) {
      return {
        valid: false,
        brokenAtId: entry.id,
        reason: `Entry ${entry.id}'s stored hash does not match its own payload. The row was edited after being written.`,
      };
    }
  }

  return { valid: true };
}

function recomputeHash(entry: AuditEntry): string {
  // NOTE: this must match computeEntryHash in audit-chain.ts exactly,
  // including the original write-time timestamp — so the timestamp
  // used at write time has to be persisted (createdAt here) rather
  // than recomputed at verification time.
  const hashInput = [
    entry.previousEntryHash,
    entry.scopeId,
    entry.agentId ?? "",
    entry.eventType,
    entry.action,
    new Date(entry.createdAt).getTime(),
  ].join("|");

  return crypto.createHash("sha256").update(hashInput).digest("hex");
}
