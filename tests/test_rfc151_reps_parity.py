"""RFC-151 Phase 1 — roster parity guard: Postgres ``reps`` backfill vs ``REPS[]``.

Q3 ratification (RFC-151) overrode the RFC's "accept manual coordination"
default and requires an automated CI check: the server-side rep registry
backfill (``db/migration-team-rbac-rls.sql`` — the
2026-07-10 roster upsert block, applied to Supabase after the Phase-1 schema
migration) and the client bundle roster
(``src/data-model.js`` ``REPS[]``) must never drift.

CI has no live-DB access, so the guard compares the two in-repo artifacts the
roster ritual edits (mirroring ``tests/test_rfc089_phase4_intake_parity.py``'s
producer/consumer file-parity pattern). When a rep is added to ``REPS[]``
without a matching backfill row (or vice versa), this suite reddens — which is
also the prompt to actually apply the updated backfill to the live ``reps``
table.

Drift here is a UI mismatch, not an access-control bypass: RLS enforces off
the Postgres ``reps`` table regardless of what the client bundle believes.
"""

import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_MODEL = REPO_ROOT / "src" / "data-model.js"
SCHEMA_MIGRATION = REPO_ROOT / "db" / "migration-team-rbac-rls.sql"


def _reps_block(js_source: str) -> str:
    """The literal text of the REPS[] array (from its opener to its ``];``)."""
    start = js_source.index("const REPS = [")
    end = js_source.index("\n];", start)
    return js_source[start:end]


def _data_model_rep_ids() -> set[str]:
    block = _reps_block(DATA_MODEL.read_text(encoding="utf-8"))
    return set(re.findall(r'\{\s*id:\s*"([^"]+)"', block))


def _data_model_cs_ids() -> set[str]:
    """Rep ids on the CS team in the client roster (the RFC-151 `team` field —
    NOT the job-title `role` string, which varies: "Customer Success",
    "Customer Success Manager", "Senior Customer Success Manager")."""
    block = _reps_block(DATA_MODEL.read_text(encoding="utf-8"))
    entries = re.findall(r'\{\s*id:\s*"([^"]+)"[^{]*?team:\s*"([^"]+)"', block)
    return {rep_id for rep_id, team in entries if team == "cs"}


# One backfill row: ('rep_id', 'Name', 'team_id', 'region', active)
_BACKFILL_ROW = re.compile(
    r"\(\s*'([^']+)',\s*'[^']*',\s*'(newbiz|cs)',\s*'(US|EMEA|APAC)',\s*(?:true|false)\s*\)"
)


def _migration_rows() -> list[tuple[str, str, str]]:
    sql = SCHEMA_MIGRATION.read_text(encoding="utf-8")
    return _BACKFILL_ROW.findall(sql)


def test_reps_backfill_id_set_matches_data_model():
    """Q3's exact acceptance criterion: id-set equality between the ``reps``
    backfill and ``REPS[]``. A rep added to one artifact but not the other
    (the 4th coordinated-edit site RFC-151 stacks on RFC-139's 3) reddens CI
    instead of drifting silently."""
    model_ids = _data_model_rep_ids()
    migration_ids = {rep_id for rep_id, _, _ in _migration_rows()}

    assert model_ids, "failed to parse any rep ids out of data-model.js REPS[]"
    assert migration_ids == model_ids, (
        f"reps backfill vs REPS[] drift — "
        f"only in migration: {sorted(migration_ids - model_ids)}; "
        f"only in data-model.js: {sorted(model_ids - migration_ids)} "
        f"(update BOTH artifacts, then re-apply the backfill to live Supabase)"
    )


def test_cs_team_membership_matches_data_model():
    """Team assignment parity for the isolation-critical axis: exactly the
    reps tagged ``role: "Customer Success"`` client-side carry ``team_id='cs'``
    in the backfill. A rep filed under the wrong team is the difference
    between Lara seeing their rows and not."""
    model_cs = _data_model_cs_ids()
    migration_cs = {rep_id for rep_id, team, _ in _migration_rows() if team == "cs"}

    assert model_cs, "failed to parse any Customer Success reps out of REPS[]"
    assert migration_cs == model_cs, (
        f"CS team drift — migration cs: {sorted(migration_cs)}, "
        f"data-model.js Customer Success: {sorted(model_cs)}"
    )
