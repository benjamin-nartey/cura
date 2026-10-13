# AGENTS.md — CuraSphere Cursor Agent Rules

This repository follows the **CuraSphere Engineering Specification Pack v1.0**. Read `source/CuraSphere_Engineering_Specification_Pack_v1.0.docx`, `docs/IMPLEMENTATION_POLICY.md`, `CURSOR_MASTER_PROMPT.md`, `docs/SYNTHETIC_SCENARIOS.md` and the earliest unlocked `phase-specs/PHASE_XX_*.md` before any code.

1. Work in **strict numeric phase order (00–30)**. Phase 00 has documentation only. Within a phase, implement **feature 1 fully** (backend, real UI, auth, migration, simulation, tests, safety, monitoring, rollback, docs) before feature 2.
2. Inspect existing repo and preserve completed code; no duplicated implementations, hallucinated file paths or assumed test results.
3. Source DOCX overrides any conflicting elaboration. Record gaps and proposed decisions in RFC/ADR and mark blocked if clinical, privacy, regulator or architecture approval needed.
4. Clinical source data is authoritative; model outputs/twins are derived. Human review for consequential actions; deterministic hard safety is never bypassed by AI.
5. Use synthetic data for reproducible scenarios across multiple isolated tenants and failure cases. No real PHI or live payment simulation. No mock production paths.
6. Run actual tests; preserve logs/evidence. Update `progress/feature-register.json` and `progress/phase-register.json`. If a gate fails or requires human approval, BLOCK and stop feature advancement.
7. At the end of each PHASE: produce completion report and **STOP**; never begin next phase without explicit user instruction. Read original §13.
8. Never claim certification, medical-device authorization, clinical validation or compliance based on this pack or synthetic data.
