/**
 * Runnable, zero-setup demo: simulates a rogue agent trying to spend
 * $2 four times against a wallet with a $6 daily limit. The first
 * three are approved, the fourth is denied — and every decision is
 * written to the hash-chained audit log. At the end, the chain is
 * verified end to end.
 *
 * Run: npm run demo
 */

import { guardedAgentSpend } from "./src/example";
import { MemoryAuditDb, MemorySpendLedger } from "./src/memory-store";
import { verifyChain } from "./src/verify";
import type { Wallet } from "./src/spend-gate";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

async function main() {
  const db = new MemoryAuditDb();
  const ledger = new MemorySpendLedger();

  const wallet: Wallet = {
    walletId: "wallet_demo",
    balance: 100,
    dailyLimit: 6,
    monthlyLimit: 0,
    perTxLimit: 0,
  };

  console.log(`${BOLD}Rogue agent loop — $2/call against a $6 daily limit${RESET}\n`);

  for (let i = 1; i <= 4; i++) {
    const result = await guardedAgentSpend({
      db,
      ledger,
      wallet,
      agentId: "rogue_agent",
      amount: 2,
      purpose: `loop iteration ${i}`,
    });

    // record the spend so subsequent daily-limit checks see it
    if (result.allowed) ledger.record(wallet.walletId, "rogue_agent", 2);

    if (result.allowed) {
      console.log(`${GREEN}[loop ${i}] APPROVED${RESET} — $2 spent`);
    } else {
      console.log(`${RED}[loop ${i}] DENIED${RESET} — ${result.reason}`);
      console.log(`${RED}${BOLD}VALTA SPEND GATE · EXECUTION HALTED${RESET}`);
      break;
    }
  }

  console.log(`\n${BOLD}Audit chain for wallet_demo:${RESET}`);
  const entries = db.getEntriesForScope("wallet_demo");
  for (const e of entries) {
    const color = e.eventType === "spend_denied" ? RED : GREEN;
    console.log(
      `${DIM}#${String(e.id).padStart(4, "0")}${RESET} ${color}${e.eventType}${RESET} ${DIM}hash=${e.entryHash.slice(0, 8)}… prev=${e.previousEntryHash === "genesis" ? "genesis" : e.previousEntryHash.slice(0, 8) + "…"}${RESET}`
    );
  }

  const verification = verifyChain(entries);
  console.log(
    `\n${BOLD}Chain verification:${RESET} ${verification.valid ? `${GREEN}VALID${RESET}` : `${RED}BROKEN — ${verification.reason}${RESET}`}`
  );
}

main();
