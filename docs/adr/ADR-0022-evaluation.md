# ADR-0022: Evaluation records a refusal hold

Status: Accepted
Date: 2026-10-08

## Context
Phase 26 asks for golden datasets, dataset and model cards, prompt evals, subgroup metrics, drift monitoring, a red-team suite, and an approval board. This store has one disabled model and a gateway that refuses clinical generation. Scoring a model that did not run, or marking that model promoted, would be a production mock.

## Decision
An auditor stores the pinned golden set `eval-golden-2026.10`. The cases expect `refused`. A run sends each case through the AI Gateway and stores the actual outcome. The run passes only when every case is refused. The same pin produces the same case results. A rollback artifact stores the gate that was in place: `mdl_none` version `0`, status `disabled`. A second auditor can sign the run. The decision is `hold`. A promotion attempt after that signature is stored as `not-promoted` and does not change the model row. Subgroup metrics and drift are not calculated, because no model output is stored. The cards are fixed sentences, not model text.

## Consequences
Schema version 22 adds the evaluation tables. Rollback of the app is to stop it and delete `data/curasphere.sqlite`. The evaluation rollback artifact itself is the stored gate description, not a second model build.

## Revisit trigger
A candidate model exists outside this slice and has a signed evaluation that is allowed to promote it. Until then, the gate stays disabled.
