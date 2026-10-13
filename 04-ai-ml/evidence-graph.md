# Evidence Graph

The evidence graph links every material AI claim to source data and knowledge. Minimum edge: Claim -> Evidence -> Source -> Source version/date. Optional links include guideline, model, prompt, transformation, reviewer and approval.

An evidence record is permission-aware. If the user cannot access the source, the derived claim must not leak it. If source data is corrected or withdrawn, impacted derived outputs are marked stale and scheduled for recomputation.
