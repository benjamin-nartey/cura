# CURASPHERE — Cursor implementation pack

**Included:** Source specification v1.0; Cursor master execution prompt; always-on Cursor rule; AGENTS.md; 31 numbered phase workplans (00–30); synthetic fixture generator and generated JSON/CSV; scenario oracles; acceptance registers. The source DOCX is authoritative; derived materials are clearly labeled proposals.

## Start in Cursor
1. Extract this package into the **root of your CuraSphere project**, without overwriting existing work without review. Keep the `source/`, `phase-specs/`, `docs/`, `fixtures/` and `progress/` folders committed (except for secrets).
2. Open the project in Cursor Agent and paste `CURSOR_MASTER_PROMPT.md` as your first task. The `.cursor/rules/curasphere.mdc` and `AGENTS.md` enforce repeatable instructions.
3. Start from Phase 00 (documentation only). The agent should **inspect first**, build the first incomplete feature, test, report and only proceed feature-by-feature after complete acceptance. At the end of the PHASE it must stop for your instruction before phase +1.
4. Run `python fixtures/generate_demo_data.py` to regenerate deterministic synthetic fixture records (`demo_healthcare.json` and `demo_encounters.csv`). This is an optional test fixture generator, not a production seed or a full simulation framework. Engineering must implement scenario test oracles and fake integrations as each feature is built.
5. Inspect `progress/phase-register.json` and `progress/feature-register.json` for evidence. The initial records are all `NOT_STARTED`, not self-attested completions.

## Decision hierarchy
Source v1.0 > Cursor execution rules > phase elaboration > synthetic fixtures. If source and a derived file conflict, source wins and an ADR is required. Sample entity and API names are proposals; adapt by ADR after inspecting the live codebase.

## Completion philosophy
A screen looking correct is NOT completion. Every feature needs real data flow, migrations, permissions, audit, error/offline/empty states, tests, resilience, operator support and rollback. Release of clinical/regulated features additionally requires independent qualified validation and approvals outside the coding agent.
