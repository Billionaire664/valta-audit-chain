/**
 * Shows the two pieces composed together: the spend gate makes the
 * approve/deny decision BEFORE the agent's action executes, and the
 * decision — whichever way it goes — is written to the hash-chained
 * audit log so it's provable after the fact.
 */

import { checkSpend, type SpendLedger, type Wallet } from "./spend-gate";
import { writeAuditEntry, type AuditDb } from "./audit-chain";

export async function guardedAgentSpend(params: {
  db: AuditDb;
  ledger: SpendLedger;
  wallet: Wallet;
  agentId: string;
  amount: number;
  purpose: string;
}): Promise<{ allowed: boolean; reason?: string }> {
  const decision = await checkSpend(params.ledger, {
    wallet: params.wallet,
    amount: params.amount,
    agentId: params.agentId,
  });

  if (!decision.approved) {
    // Denied — write the audit entry and stop. The agent never gets
    // to make the call it asked to make.
    await writeAuditEntry(params.db, {
      scopeId: params.wallet.walletId,
      agentId: params.agentId,
      eventType: "spend_denied",
      action: `Spend of $${params.amount} denied — ${decision.code}`,
      affectedResourceId: params.wallet.walletId,
      affectedResourceType: "agent_wallet",
      amount: params.amount,
      reasoning: decision.reason,
      triggeredBy: "spend_gate",
    });

    return { allowed: false, reason: decision.reason };
  }

  // Approved — write the audit entry, then (and only then) the caller
  // proceeds to actually execute the LLM/tool call.
  await writeAuditEntry(params.db, {
    scopeId: params.wallet.walletId,
    agentId: params.agentId,
    eventType: "spend_approved",
    action: `Spend of $${params.amount} approved — ${params.purpose}`,
    affectedResourceId: params.wallet.walletId,
    affectedResourceType: "agent_wallet",
    amount: params.amount,
    reasoning: params.purpose,
    triggeredBy: "spend_gate",
  });

  return { allowed: true };
}
