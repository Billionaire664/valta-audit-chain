/**
 * Real, measured micro-benchmark of the in-memory gate + hash-chain
 * write path. Not a claim about Postgres latency (that depends on your
 * infra) — this isolates the compute cost of the gate/hashing logic
 * itself, which is the part that's constant regardless of backend.
 */

import { checkSpend } from "./src/spend-gate";
import { writeAuditEntry } from "./src/audit-chain";
import { MemoryAuditDb, MemorySpendLedger } from "./src/memory-store";
import type { Wallet } from "./src/spend-gate";

async function benchGateCheck(iterations: number) {
  const ledger = new MemorySpendLedger();
  const wallet: Wallet = {
    walletId: "bench_wallet",
    balance: 1_000_000,
    dailyLimit: 0,
    monthlyLimit: 0,
    perTxLimit: 0,
  };

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await checkSpend(ledger, { wallet, amount: 1, agentId: "bench_agent" });
  }
  const elapsed = performance.now() - start;
  return elapsed / iterations;
}

async function benchAuditWrite(iterations: number) {
  const db = new MemoryAuditDb();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    await writeAuditEntry(db, {
      scopeId: "bench_wallet",
      agentId: "bench_agent",
      eventType: "spend_approved",
      action: "bench iteration",
      affectedResourceId: "bench_wallet",
      reasoning: "benchmark",
      triggeredBy: "bench",
    });
  }
  const elapsed = performance.now() - start;
  return elapsed / iterations;
}

async function main() {
  const N = 10_000;

  // warm up (JIT)
  await benchGateCheck(1000);
  await benchAuditWrite(1000);

  const gateAvg = await benchGateCheck(N);
  const auditAvg = await benchAuditWrite(N);

  console.log(`Iterations: ${N}`);
  console.log(`Gate check (checkSpend, no history lookup needed):     ${gateAvg.toFixed(4)}ms avg`);
  console.log(`Audit write (writeAuditEntry, hash computation + insert): ${auditAvg.toFixed(4)}ms avg`);
  console.log(`Combined (gate + audit write):                          ${(gateAvg + auditAvg).toFixed(4)}ms avg`);
  console.log(`\nNote: this measures in-memory compute only — actual Postgres write latency`);
  console.log(`depends on your database, network, and connection pooling. Measure your own`);
  console.log(`stack before quoting a total-overhead number in production.`);
}

main();
