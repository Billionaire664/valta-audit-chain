import crypto from "node:crypto";

export type AuditEntryInput = {
  scopeId: string;
  agentId?: string;
  agentName?: string;
  executionId?: string;
  eventType: string;
  action: string;
  affectedResourceId?: string;
  affectedResourceType?: string;
  amount?: number;
  reasoning?: string;
  triggeredBy?: string;
};

export type AuditEntry = AuditEntryInput & {
  id: number;
  previousEntryHash: string;
  entryHash: string;
  createdAt: string;
};

// Minimal DB interface — implement against whatever client you use
// (pg, postgres.js, Drizzle, Prisma raw query, etc.)
//
// insertEntry receives createdAt already set by the caller (not
// generated inside insertEntry) — the hash is computed against that
// exact timestamp, so verification must recompute against the same
// value that was persisted, not a timestamp generated independently
// at insert time.
export interface AuditDb {
  getLastHash(scopeId: string): Promise<string | null>;
  insertEntry(entry: Omit<AuditEntry, "id">): Promise<{ id: number }>;
}

function computeEntryHash(params: {
  previousHash: string;
  scopeId: string;
  agentId: string;
  eventType: string;
  action: string;
  timestamp: number;
}): string {
  const hashInput = [
    params.previousHash,
    params.scopeId,
    params.agentId,
    params.eventType,
    params.action,
    params.timestamp,
  ].join("|");

  return crypto.createHash("sha256").update(hashInput).digest("hex");
}

export async function writeAuditEntry(
  db: AuditDb,
  input: AuditEntryInput
): Promise<{ id: number; entryHash: string }> {
  const previousHash = (await db.getLastHash(input.scopeId)) ?? "genesis";
  const timestamp = Date.now();

  const entryHash = computeEntryHash({
    previousHash,
    scopeId: input.scopeId,
    agentId: input.agentId ?? "",
    eventType: input.eventType,
    action: input.action,
    timestamp,
  });

  const { id } = await db.insertEntry({
    ...input,
    previousEntryHash: previousHash,
    entryHash,
    createdAt: new Date(timestamp).toISOString(),
  });

  return { id, entryHash };
}
