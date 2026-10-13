# AI Platform Specification

## AI Gateway
All generative/model calls flow through a central gateway enforcing model allowlists, routing policy, PHI handling, tenant policy, prompt/version registry, structured schemas, token/cost budgets, logging, tracing and safety checks.

## Model classes
- LLM/LMM for language/multimodal assistance
- deterministic rules for hard safety constraints
- conventional ML for validated prediction
- specialty medical models for imaging/ECG/etc.
- embedding/reranking models for retrieval

## Context pipeline
Authenticate -> authorize -> establish patient/facility purpose -> retrieve minimum necessary context -> attach provenance -> run model/tool -> validate schema -> check evidence -> policy/safety -> human approval if required -> persist output/audit.
