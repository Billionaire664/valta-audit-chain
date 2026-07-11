-- Hash-chained audit log schema.
-- One row per decision/event. Chained via previous_entry_hash -> entry_hash.

CREATE TABLE audit_log (
  id                      BIGSERIAL PRIMARY KEY,

  -- Whatever you chain per: user, agent run, crew, session. Chains are
  -- independent per scope_id so writes across different scopes never
  -- block each other.
  scope_id                TEXT NOT NULL,

  agent_id                TEXT,
  agent_name              TEXT,
  execution_id            TEXT,

  -- e.g. "spend_approved" | "spend_denied" | "policy_blocked" | "freeze"
  event_type              TEXT NOT NULL,

  -- Human-readable description of what happened.
  action                  TEXT NOT NULL,

  -- The scope the decision was checked against — a wallet, a budget,
  -- an authority/permission boundary. Domain-specific.
  affected_resource_id    TEXT,
  affected_resource_type  TEXT,

  amount                  NUMERIC,

  -- Structured reason, not free text. e.g. "daily_limit_exceeded:
  -- spent $6.00 of $6.00" — should be parseable, not just prose.
  reasoning               TEXT,

  -- Who/what triggered this event (SDK, delegation source, human, etc.)
  triggered_by            TEXT,

  previous_entry_hash     TEXT,
  entry_hash              TEXT NOT NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_scope       ON audit_log(scope_id);
CREATE INDEX idx_audit_log_agent       ON audit_log(agent_id);
CREATE INDEX idx_audit_log_created     ON audit_log(created_at DESC);

-- One chain per scope_id: fetching the tail of a chain is a single
-- indexed lookup, not a full-table scan.
CREATE INDEX idx_audit_log_scope_id_id ON audit_log(scope_id, id DESC);
