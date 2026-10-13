# Agent Runtime Specification

Each agent is a versioned manifest: ID, purpose, risk class, allowed actors, allowed tools, data scopes, model policy, prompt, output schema, approval requirements, timeout/retry policy, budget, evaluation suite and owner.

Agents run inside durable Temporal workflows. Tool calls are server-side typed capabilities with policy enforcement. The model never receives raw database credentials or arbitrary network access. Consequential write tools create drafts/tasks unless the capability policy explicitly permits execution.
