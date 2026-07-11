/**
 * Pre-call spend gate — the authorization check that runs BEFORE an
 * agent's LLM/tool call fires, not a monitor that inspects it after.
 *
 * Pairs with audit-chain.ts: every decision this gate makes (approved
 * or denied) should be written to the hash-chained log so the "why"
 * is provable after the fact, not just enforced in the moment.
 */

export type Wallet = {
  walletId: string;
  balance: number;
  dailyLimit: number;   // 0 = no limit
  monthlyLimit: number; // 0 = no limit
  perTxLimit: number;   // 0 = no limit
};

export type SpendCheckInput = {
  wallet: Wallet;
  amount: number;
  agentId: string;
};

export type SpendDecision =
  | { approved: true; newBalance: number }
  | { approved: false; reason: string; code: SpendDenialCode };

export type SpendDenialCode =
  | "insufficient_balance"
  | "per_tx_limit_exceeded"
  | "daily_limit_exceeded"
  | "monthly_limit_exceeded";

// Minimal interface — implement against whatever store tracks spend
// history (Postgres, Redis counters, whatever fits your latency budget).
export interface SpendLedger {
  getSpentSince(walletId: string, agentId: string, since: Date): Promise<number>;
}

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Runs all limit checks in order, cheapest/most-decisive first, so a
 * denial short-circuits before hitting the ledger for spend-history
 * queries when possible (per-tx and balance checks need no history
 * lookup at all).
 */
export async function checkSpend(
  ledger: SpendLedger,
  input: SpendCheckInput
): Promise<SpendDecision> {
  const { wallet, amount, agentId } = input;

  if (amount > wallet.balance) {
    return {
      approved: false,
      code: "insufficient_balance",
      reason: `Amount $${amount} exceeds wallet balance of $${wallet.balance}`,
    };
  }

  if (wallet.perTxLimit > 0 && amount > wallet.perTxLimit) {
    return {
      approved: false,
      code: "per_tx_limit_exceeded",
      reason: `Amount $${amount} exceeds per-transaction limit of $${wallet.perTxLimit}`,
    };
  }

  if (wallet.dailyLimit > 0) {
    const spentToday = await ledger.getSpentSince(wallet.walletId, agentId, startOfDay());
    if (spentToday + amount > wallet.dailyLimit) {
      return {
        approved: false,
        code: "daily_limit_exceeded",
        reason: `Daily limit of $${wallet.dailyLimit} would be exceeded (spent today: $${spentToday.toFixed(2)})`,
      };
    }
  }

  if (wallet.monthlyLimit > 0) {
    const spentThisMonth = await ledger.getSpentSince(wallet.walletId, agentId, startOfMonth());
    if (spentThisMonth + amount > wallet.monthlyLimit) {
      return {
        approved: false,
        code: "monthly_limit_exceeded",
        reason: `Monthly limit of $${wallet.monthlyLimit} would be exceeded (spent this month: $${spentThisMonth.toFixed(2)})`,
      };
    }
  }

  return { approved: true, newBalance: wallet.balance - amount };
}
