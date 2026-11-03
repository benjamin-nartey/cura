import { CODE_SYSTEM_REGISTRY_SCHEMA, TERMINOLOGY_VALIDATION_SCHEMA } from "./code-system-schema";
import { SMART_SCHEMA } from "./smart-schema";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled'))
);
CREATE TABLE facilities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled'))
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  facility_id TEXT REFERENCES facilities(id),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('clinician','nurse','auditor','admin')),
  account_status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  active_organization_id TEXT,
  active_facility_id TEXT,
  context_version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active','suspended','revoked')),
  version INTEGER NOT NULL,
  UNIQUE (organization_id, user_id)
);
CREATE TABLE facility_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','suspended','revoked')),
  version INTEGER NOT NULL,
  UNIQUE (facility_id, user_id)
);
CREATE TABLE service_principals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  UNIQUE (organization_id, name)
);
CREATE TABLE tenancy_controls (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dependency TEXT NOT NULL
);
CREATE TABLE identity_providers (
  issuer TEXT PRIMARY KEY,
  audience TEXT NOT NULL
);
CREATE TABLE external_identities (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','pending','disabled')),
  UNIQUE (issuer, subject)
);
CREATE TABLE auth_transactions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  assurance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  refresh_token TEXT,
  refresh_current_hash TEXT,
  refresh_previous_hash TEXT
);
CREATE TABLE pending_logins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  refresh_token TEXT
);
CREATE TABLE auth_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  subject_hash TEXT,
  correlation_id TEXT,
  duration_ms INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE totp_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  secret TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','revoked')),
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  recovery_hashes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','revoked'))
);
CREATE TABLE webauthn_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('registration','authentication')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE auth_counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  mrn TEXT NOT NULL,
  given_name TEXT NOT NULL,
  family_name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('female','male','other','unknown')),
  confidentiality TEXT NOT NULL,
  retention_class TEXT NOT NULL,
  version INTEGER NOT NULL,
  author_id TEXT NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL,
  UNIQUE (organization_id, mrn)
);
CREATE TABLE conditions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  clinical_status TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  author_id TEXT NOT NULL
);
CREATE TABLE allergies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  display TEXT NOT NULL,
  reaction TEXT NOT NULL,
  criticality TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  author_id TEXT NOT NULL
);
CREATE TABLE medications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  display TEXT NOT NULL,
  dose TEXT NOT NULL,
  status TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  author_id TEXT NOT NULL
);
CREATE TABLE encounters (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  status TEXT NOT NULL CHECK (status IN ('in-progress','finished','cancelled')),
  class TEXT NOT NULL,
  reason TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  author_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  encounter_id TEXT,
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_system_version TEXT NOT NULL,
  binding_version TEXT NOT NULL,
  interpretation TEXT NOT NULL,
  threshold_text TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  status TEXT NOT NULL,
  reason TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL
);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  purpose_of_use TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  outcome TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE idempotency_keys (
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, idempotency_key)
);
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE code_systems (
  id TEXT PRIMARY KEY,
  uri TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  UNIQUE (uri, version)
);
CREATE TABLE concepts (
  id TEXT PRIMARY KEY,
  code_system_id TEXT NOT NULL REFERENCES code_systems(id),
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  unit_code TEXT,
  low_bound REAL,
  high_bound REAL,
  entry_min REAL,
  entry_max REAL,
  UNIQUE (code_system_id, code)
);
CREATE TABLE value_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL
);
CREATE TABLE value_set_members (
  value_set_id TEXT NOT NULL REFERENCES value_sets(id),
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  PRIMARY KEY (value_set_id, concept_id)
);
CREATE TABLE facility_catalogs (
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  value_set_id TEXT NOT NULL REFERENCES value_sets(id),
  PRIMARY KEY (facility_id, value_set_id)
);
CREATE TABLE fhir_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  criteria TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL,
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE fhir_notifications (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES fhir_subscriptions(id),
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE patient_state_builds (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  built_at TEXT NOT NULL,
  UNIQUE (organization_id, facility_id, patient_id, version)
);
CREATE TABLE evidence_claims (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('supported','insufficient','invalidated')),
  author_id TEXT NOT NULL,
  filed_at TEXT NOT NULL
);
CREATE TABLE evidence_citations (
  claim_id TEXT NOT NULL REFERENCES evidence_claims(id),
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (claim_id, source_table, source_id)
);
CREATE INDEX idx_patients_tenant ON patients(organization_id, facility_id);
CREATE INDEX idx_obs_patient ON observations(patient_id, effective_at);
CREATE INDEX idx_audit_org ON audit_events(organization_id, created_at);
CREATE INDEX idx_fhir_notes ON fhir_notifications(subscription_id, created_at);
CREATE INDEX idx_evidence_patient ON evidence_claims(organization_id, facility_id, patient_id);
CREATE TABLE gateway_prompts (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  output_schema_json TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE TABLE gateway_models (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  PRIMARY KEY (id, version)
);
CREATE TABLE gateway_quotas (
  organization_id TEXT PRIMARY KEY,
  token_budget INTEGER NOT NULL,
  tokens_used INTEGER NOT NULL
);
CREATE TABLE gateway_attempts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  actor_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL,
  redacted INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  output_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE agent_manifests (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  risk_class TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  allowed_actors_json TEXT NOT NULL,
  allowed_tools_json TEXT NOT NULL,
  data_scope TEXT NOT NULL,
  model_policy TEXT NOT NULL,
  approval_required INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  evaluation_suite TEXT NOT NULL,
  owner TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE TABLE agent_tools (
  id TEXT PRIMARY KEY,
  capability TEXT NOT NULL CHECK (capability IN ('read','draft')),
  permits_execution INTEGER NOT NULL,
  sandbox TEXT NOT NULL
);
CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_version INTEGER NOT NULL,
  patient_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','awaiting-approval','completed','refused','failed')),
  attempt_count INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE agent_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  tool_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('committed','parked','refused')),
  input_hash TEXT NOT NULL,
  output_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, step_index)
);
CREATE TABLE agent_approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','declined')),
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_agent_runs_facility ON agent_runs(organization_id, facility_id, created_at);
CREATE INDEX idx_agent_approvals_run ON agent_approvals(organization_id, facility_id, status);
CREATE TABLE copilot_turns (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('grounded','blocked')),
  reason TEXT NOT NULL,
  grounding_score REAL NOT NULL,
  answer_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE copilot_feedback (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful','not-grounded')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_copilot_turns_patient ON copilot_turns(organization_id, facility_id, patient_id, created_at);
CREATE TABLE documentation_settings (
  organization_id TEXT PRIMARY KEY,
  audio_retention_hours INTEGER NOT NULL CHECK (audio_retention_hours >= 0 AND audio_retention_hours <= 72)
);
CREATE TABLE documentation_consents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE TABLE documentation_captures (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text','audio')),
  retention_hours INTEGER NOT NULL,
  expires_at TEXT,
  content_hash TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  audio_bytes BLOB,
  transcript_text TEXT,
  transcript_origin TEXT NOT NULL CHECK (transcript_origin IN ('clinician-typed','none')),
  created_at TEXT NOT NULL
);
CREATE TABLE documentation_drafts (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','accepted','rejected')),
  signed INTEGER NOT NULL DEFAULT 0 CHECK (signed = 0),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);
CREATE TABLE documentation_sections (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  quote_start INTEGER NOT NULL,
  quote_end INTEGER NOT NULL,
  text TEXT NOT NULL,
  authorship TEXT NOT NULL CHECK (authorship IN ('source-quote','clinician-authored')),
  UNIQUE (draft_id, position)
);
CREATE INDEX idx_documentation_patient ON documentation_drafts(organization_id, facility_id, patient_id, created_at);
CREATE TABLE lab_critical_rules (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  critical_low REAL,
  critical_high REAL,
  rule_version TEXT NOT NULL
);
CREATE TABLE lab_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','collected','resulted','cancelled')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE lab_specimens (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  collected_by TEXT NOT NULL,
  collected_at TEXT NOT NULL
);
CREATE TABLE lab_results (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  observation_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  code TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_system_version TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  binding_version TEXT NOT NULL,
  reference_low REAL,
  reference_high REAL,
  critical_flag TEXT NOT NULL CHECK (critical_flag IN ('none','critical-low','critical-high')),
  rule_id TEXT,
  rule_version TEXT,
  recorded_at TEXT NOT NULL
);
CREATE TABLE lab_alerts (
  id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  critical_flag TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','acknowledged')),
  acknowledged_by TEXT,
  acknowledged_at TEXT
);
CREATE INDEX idx_lab_orders_patient ON lab_orders(organization_id, facility_id, patient_id, created_at);
CREATE TABLE rx_formulary (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display TEXT NOT NULL,
  therapy_class TEXT NOT NULL,
  formulary_status TEXT NOT NULL CHECK (formulary_status IN ('on-formulary','non-formulary')),
  source TEXT NOT NULL,
  rule_version TEXT NOT NULL
);
CREATE TABLE rx_safety_rules (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('allergy','interaction','duplicate','formulary')),
  left_key TEXT NOT NULL,
  right_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high','moderate')),
  source TEXT NOT NULL,
  rule_version TEXT NOT NULL
);
CREATE TABLE rx_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  formulary_id TEXT NOT NULL,
  dose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','active','dispensed','cancelled')),
  medication_id TEXT,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE rx_warnings (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  source TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','acknowledged')),
  acknowledged_by TEXT,
  acknowledged_at TEXT
);
CREATE TABLE rx_dispenses (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  dispensed_by TEXT NOT NULL,
  dispensed_at TEXT NOT NULL
);
CREATE TABLE rx_administrations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  administered_by TEXT NOT NULL,
  administered_at TEXT NOT NULL
);
CREATE INDEX idx_rx_orders_patient ON rx_orders(organization_id, facility_id, patient_id, created_at);
CREATE TABLE outreach_templates (
  id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en','es')),
  body TEXT NOT NULL,
  version TEXT NOT NULL,
  PRIMARY KEY (id, locale)
);
CREATE TABLE patient_outreach (
  patient_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en','es')),
  channel TEXT NOT NULL CHECK (channel IN ('portal','none')),
  consent TEXT NOT NULL CHECK (consent IN ('granted','withheld')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE outreach_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  body TEXT NOT NULL,
  version TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE care_referrals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  from_facility_id TEXT NOT NULL,
  to_facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','accepted','declined')),
  author_id TEXT NOT NULL,
  decided_by TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE TABLE care_plans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','active')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE care_tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('follow-up','gap','escalation')),
  source_table TEXT,
  source_id TEXT,
  reason TEXT NOT NULL,
  failure TEXT,
  status TEXT NOT NULL CHECK (status IN ('open','done')),
  owner_id TEXT,
  due_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_care_tasks_patient ON care_tasks(organization_id, facility_id, patient_id, created_at);
CREATE INDEX idx_care_referrals_to ON care_referrals(organization_id, to_facility_id, status);
CREATE TABLE patient_principals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL
);
CREATE TABLE patient_sessions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES patient_principals(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE patient_education (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  version TEXT NOT NULL
);
CREATE TABLE patient_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  text TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('stored','triage')),
  instruction TEXT,
  tool TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE patient_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  body TEXT NOT NULL,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('patient','facility')),
  created_at TEXT NOT NULL
);
CREATE TABLE patient_coverage (
  patient_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  member_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE patient_payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recorded')),
  created_at TEXT NOT NULL
);
CREATE TABLE patient_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','accepted','declined')),
  starts_at TEXT,
  ends_at TEXT,
  appointment_id TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX idx_patient_questions_patient ON patient_questions(organization_id, facility_id, patient_id, created_at);
CREATE INDEX idx_patient_messages_patient ON patient_messages(organization_id, facility_id, patient_id, created_at);
CREATE TABLE facility_beds (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','occupied','closed')),
  patient_id TEXT,
  version INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE facility_shifts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled','active','finished')),
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE facility_equipment (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available','out-of-service')),
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE facility_state (
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  built_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, facility_id)
);
CREATE INDEX idx_facility_beds_facility ON facility_beds(organization_id, facility_id, recorded_at);
CREATE TABLE operations_inventory (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  label TEXT NOT NULL,
  on_hand INTEGER NOT NULL CHECK (on_hand >= 0 AND on_hand <= 100000),
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE operations_overrides (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('wait','capacity','inventory','staffing','bottleneck')),
  action TEXT NOT NULL CHECK (action IN ('hold')),
  reason TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE operations_state (
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  baseline_json TEXT NOT NULL,
  built_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, facility_id)
);
CREATE INDEX idx_operations_inventory_facility ON operations_inventory(organization_id, facility_id, recorded_at);
CREATE INDEX idx_operations_overrides_facility ON operations_overrides(organization_id, facility_id, created_at);
CREATE TABLE analytics_facts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  outbox_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  facility_id TEXT,
  kept_json TEXT NOT NULL,
  dropped_keys_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  deid_version TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  UNIQUE (organization_id, outbox_id)
);
CREATE TABLE analytics_exports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('release','withhold')),
  body_json TEXT,
  lineage_json TEXT NOT NULL,
  assessment_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_analytics_facts_org ON analytics_facts(organization_id, event_type);
CREATE TABLE population_state (
  organization_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  jurisdiction TEXT,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  built_at TEXT NOT NULL
);
CREATE TABLE research_workspaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  protocol_label TEXT NOT NULL,
  ethics_status TEXT NOT NULL CHECK (ethics_status IN ('not-reviewed')),
  ethics_note TEXT NOT NULL,
  purpose_of_use TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE research_datasets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  population_version INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, version)
);
CREATE TABLE research_exports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('awaiting-approval','approved','declined')),
  requester_id TEXT NOT NULL,
  approver_id TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX idx_research_workspaces_org ON research_workspaces(organization_id, created_at);
CREATE TABLE imaging_studies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  accession TEXT NOT NULL,
  modality TEXT NOT NULL,
  description TEXT NOT NULL,
  study_date TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_imaging_studies_fac ON imaging_studies(organization_id, facility_id, created_at);
CREATE TABLE imaging_reports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  study_id TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE imaging_releases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  study_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('release','withhold')),
  body_json TEXT,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  connectivity TEXT NOT NULL CHECK (connectivity IN ('not-connected')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_devices_fac ON devices(organization_id, facility_id, created_at);
CREATE TABLE device_readings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  unit_system_version TEXT NOT NULL,
  binding_version TEXT NOT NULL,
  normalization_version TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  order_flag TEXT NOT NULL CHECK (order_flag IN ('in-order','out-of-order')),
  author_id TEXT NOT NULL,
  UNIQUE (device_id, code, effective_at)
);
CREATE TABLE device_alerts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reading_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('open','acknowledged')),
  rule_version TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT
);
CREATE TABLE device_escalations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reading_id TEXT NOT NULL UNIQUE,
  budget INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE revenue_invoices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  service_label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recorded')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_revenue_invoices_org ON revenue_invoices(organization_id, created_at);
CREATE TABLE revenue_payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recorded')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE revenue_eligibility (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  payer_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not-checked')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE revenue_claims (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE revenue_claim_attempts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('not-submitted')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE revenue_subscriptions (
  organization_id TEXT PRIMARY KEY,
  plan_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not-billed')),
  author_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE eval_datasets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  golden_version TEXT NOT NULL,
  case_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, version)
);
CREATE TABLE eval_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('passed','failed')),
  result_json TEXT NOT NULL,
  rollback_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE eval_approvals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('awaiting','signed')),
  requester_id TEXT NOT NULL,
  signer_id TEXT,
  decision TEXT CHECK (decision IN ('hold')),
  created_at TEXT NOT NULL,
  signed_at TEXT
);
CREATE TABLE eval_promotions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('not-promoted')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE enterprise_residency (
  organization_id TEXT PRIMARY KEY,
  region TEXT NOT NULL CHECK (region IN ('local-sqlite')),
  author_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE enterprise_federation (
  organization_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('not-connected')),
  author_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE enterprise_keys (
  organization_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('not-configured')),
  author_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE enterprise_drills (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  failover TEXT NOT NULL CHECK (failover IN ('not-run')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE enterprise_grants (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  label TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('health.read')),
  status TEXT NOT NULL CHECK (status IN ('local-session')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE marketplace_listings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  label TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('health.read')),
  risk TEXT NOT NULL CHECK (risk IN ('administrative')),
  status TEXT NOT NULL CHECK (status IN ('awaiting-review','reviewed','stopped')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE marketplace_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  listing_id TEXT NOT NULL UNIQUE,
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('hold')),
  created_at TEXT NOT NULL
);
CREATE TABLE marketplace_shares (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not-billed')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE marketplace_stops (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE release_strategies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('local-synthetic')),
  status TEXT NOT NULL CHECK (status IN ('not-approved')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE release_dossiers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  label TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE release_traces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE release_risks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-reviewed')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE release_validations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL CHECK (outcome IN ('refused')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE release_evaluations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-performed')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE release_changes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-authorized')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE release_surveillance (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-active')),
  refusal_count INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE release_attempts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('not-released')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE ai_modules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code IN ('imaging','ecg','pathology','dermatology','maternal','cardio','oncology')),
  status TEXT NOT NULL CHECK (status IN ('not-cleared')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, code)
);
CREATE TABLE ai_module_validations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  module_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL CHECK (outcome IN ('refused')),
  reviewer_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE ai_module_studies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  module_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-run')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE ai_module_performance (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  module_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-calculated')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE authorization_roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  facility_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  system_role INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','retired')),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, name)
);
CREATE TABLE authorization_permissions (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('standard','administrative','clinical','restricted')),
  constraints_json TEXT NOT NULL,
  UNIQUE (resource, action)
);
CREATE TABLE authorization_role_permissions (
  role_id TEXT NOT NULL REFERENCES authorization_roles(id),
  permission_id TEXT NOT NULL REFERENCES authorization_permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE authorization_assignments (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES authorization_roles(id),
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','revoked')),
  version INTEGER NOT NULL,
  UNIQUE (principal_id, role_id, organization_id, facility_id)
);
CREATE TABLE authorization_policies (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  scope TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('deny')),
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  approved_at TEXT,
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  UNIQUE (id, version)
);
CREATE TABLE authorization_decisions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  scope_organization_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('allow','deny')),
  reason TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX authorization_decisions_principal ON authorization_decisions (principal_id, created_at);
CREATE TABLE authorization_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE authorization_cache (
  cache_key TEXT PRIMARY KEY,
  assignment_version INTEGER NOT NULL,
  permissions_json TEXT NOT NULL
);
CREATE TABLE workforce_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','expired','cancelled')),
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  cancelled_at TEXT,
  token_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  requires_external INTEGER NOT NULL,
  bound_user_id TEXT,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE workforce_invitation_facilities (
  invitation_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  PRIMARY KEY (invitation_id, facility_id)
);
CREATE TABLE workforce_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  organization_id TEXT,
  previous_state TEXT,
  next_state TEXT,
  reason TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE workforce_outbox (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('captured','failed','retried')),
  attempt INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE workforce_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE emergency_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  action TEXT NOT NULL,
  overridable_reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('enabled','disabled')),
  version INTEGER NOT NULL,
  UNIQUE (organization_id, facility_id, environment, resource_type, action)
);
CREATE TABLE emergency_resources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE TABLE emergency_requests (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  purpose TEXT NOT NULL,
  reason_category TEXT NOT NULL,
  justification TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  status TEXT NOT NULL,
  assurance_required TEXT NOT NULL,
  policy_id TEXT,
  policy_version INTEGER,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE emergency_challenges (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL
);
CREATE TABLE emergency_grants (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  principal_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  status TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  assurance_ref TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE emergency_events (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  grant_id TEXT,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decision TEXT NOT NULL,
  resource_id TEXT,
  action TEXT,
  outcome TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE TABLE emergency_reviews (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  reviewer_id TEXT,
  status TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  reviewed_at TEXT,
  disposition TEXT,
  notes TEXT,
  escalation TEXT,
  version INTEGER NOT NULL
);
CREATE TABLE emergency_alerts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('captured','failed','retried')),
  attempt INTEGER NOT NULL,
  failure_category TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE TABLE emergency_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE access_ledger (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  actor_id TEXT NOT NULL,
  subject_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  purpose TEXT NOT NULL,
  outcome TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  before_hash TEXT NOT NULL,
  after_hash TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_access_ledger_org ON access_ledger(organization_id, sequence);
CREATE TRIGGER access_ledger_no_update
BEFORE UPDATE ON access_ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger-sealed');
END;
CREATE TRIGGER access_ledger_no_delete
BEFORE DELETE ON access_ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger-sealed');
END;
CREATE TABLE consent_subjects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  subject_type TEXT NOT NULL,
  display_name TEXT NOT NULL
);
CREATE TABLE consent_policies (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_category TEXT NOT NULL,
  recipient_class TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  version INTEGER NOT NULL,
  consent_required INTEGER NOT NULL,
  UNIQUE (action, version)
);
CREATE TABLE consent_authorities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  grantor_id TEXT NOT NULL,
  category TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  verifier_id TEXT,
  status TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  scope TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE consent_directives (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  subject_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  category TEXT NOT NULL,
  purpose TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_category TEXT NOT NULL,
  recipient TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  grantor_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  decision TEXT NOT NULL,
  status TEXT NOT NULL,
  effective_at TEXT,
  expires_at TEXT,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE TABLE consent_versions (
  id TEXT PRIMARY KEY,
  consent_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  change_code TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (consent_id, version)
);
CREATE TABLE consent_withdrawals (
  id TEXT PRIMARY KEY,
  consent_id TEXT NOT NULL,
  prior_version INTEGER NOT NULL,
  requester_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL,
  applied_version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  UNIQUE (consent_id, idempotency_key)
);
CREATE TABLE consent_dispatches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  purpose TEXT NOT NULL,
  action TEXT NOT NULL,
  recipient TEXT NOT NULL,
  resource_category TEXT NOT NULL,
  status TEXT NOT NULL,
  directive_id TEXT,
  directive_version INTEGER,
  reason_code TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE consent_sink (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL UNIQUE,
  delivered_at TEXT NOT NULL
);
CREATE TABLE consent_cache (
  cache_key TEXT PRIMARY KEY,
  directive_version INTEGER NOT NULL,
  result TEXT NOT NULL,
  reason_code TEXT NOT NULL
);
CREATE TABLE consent_idempotency (
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  directive_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, idempotency_key)
);
CREATE TABLE consent_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX idx_consent_directive_subject ON consent_directives(organization_id, subject_id, status);
CREATE TRIGGER consent_versions_no_update
BEFORE UPDATE ON consent_versions
BEGIN
  SELECT RAISE(ABORT, 'consent-history-sealed');
END;
CREATE TRIGGER consent_versions_no_delete
BEFORE DELETE ON consent_versions
BEGIN
  SELECT RAISE(ABORT, 'consent-history-sealed');
END;
`;

export type AppDatabase = DatabaseSync;

type Cache = { path: string; db: AppDatabase };

export function createDatabase(filename: string): AppDatabase {
  if (filename !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  try {
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function getDb(): AppDatabase {
  const filename = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), "data", "curasphere.sqlite");
  const globalCache = globalThis as { __curasphere?: Cache };
  if (!globalCache.__curasphere || globalCache.__curasphere.path !== filename) {
    const db = createDatabase(filename);
    const row = db.prepare("SELECT COUNT(*) AS c FROM organizations").get() as { c: number };
    if (row.c === 0) {
      const { seed } = requireSeed();
      seed(db);
    }
    globalCache.__curasphere = { path: filename, db };
  }
  migrate(globalCache.__curasphere.db);
  ensureTerminology(globalCache.__curasphere.db);
  ensureGateway(globalCache.__curasphere.db);
  ensureAgents(globalCache.__curasphere.db);
  ensureDocumentation(globalCache.__curasphere.db);
  ensureLab(globalCache.__curasphere.db);
  ensureRx(globalCache.__curasphere.db);
  ensureCoordination(globalCache.__curasphere.db);
  ensurePatient(globalCache.__curasphere.db);
  ensureResearchAuditor(globalCache.__curasphere.db);
  ensureBillingAdmin(globalCache.__curasphere.db);
  ensureConsent(globalCache.__curasphere.db);
  ensureRetention(globalCache.__curasphere.db);
  ensureDsar(globalCache.__curasphere.db);
  ensureTelemetry(globalCache.__curasphere.db);
  ensureAuthorization(globalCache.__curasphere.db);
  ensureMaster(globalCache.__curasphere.db);
  ensureSchedule(globalCache.__curasphere.db);
  ensureSource(globalCache.__curasphere.db);
  ensureWork(globalCache.__curasphere.db);
  ensureBilling(globalCache.__curasphere.db);
  return globalCache.__curasphere.db;
}

function ensureResearchAuditor(db: AppDatabase) {
  db.prepare(
    `INSERT INTO users (id, organization_id, facility_id, display_name, role)
     SELECT 'usr_nabil', 'org_harborlight', NULL, 'Nabil Rahman', 'auditor'
     WHERE EXISTS (SELECT 1 FROM organizations WHERE id = 'org_harborlight')
       AND NOT EXISTS (SELECT 1 FROM users WHERE id = 'usr_nabil')`,
  ).run();
}

function ensureBillingAdmin(db: AppDatabase) {
  db.prepare(
    `INSERT INTO users (id, organization_id, facility_id, display_name, role)
     SELECT 'usr_admin', 'org_harborlight', NULL, 'Harborlight Admin', 'admin'
     WHERE EXISTS (SELECT 1 FROM organizations WHERE id = 'org_harborlight')
       AND NOT EXISTS (SELECT 1 FROM users WHERE id = 'usr_admin')`,
  ).run();
}

function requireSeed(): { seed: (db: AppDatabase) => void } {
  return { seed: seedDatabase };
}

let seedDatabase: (db: AppDatabase) => void = () => {
  throw new Error("Seed is not registered.");
};

let ensureTerminology: (db: AppDatabase) => void = () => {};
let ensureGateway: (db: AppDatabase) => void = () => {};
let ensureAgents: (db: AppDatabase) => void = () => {};
let ensureDocumentation: (db: AppDatabase) => void = () => {};
let ensureLab: (db: AppDatabase) => void = () => {};
let ensureRx: (db: AppDatabase) => void = () => {};
let ensureCoordination: (db: AppDatabase) => void = () => {};
let ensurePatient: (db: AppDatabase) => void = () => {};
let ensureAuthorization: (db: AppDatabase) => void = () => {};
let ensureConsent: (db: AppDatabase) => void = () => {};
let ensureRetention: (db: AppDatabase) => void = () => {};
let ensureDsar: (db: AppDatabase) => void = () => {};
let ensureTelemetry: (db: AppDatabase) => void = () => {};
let ensureMaster: (db: AppDatabase) => void = () => {};
let ensureSchedule: (db: AppDatabase) => void = () => {};
let ensureSource: (db: AppDatabase) => void = () => {};
let ensureWork: (db: AppDatabase) => void = () => {};
let ensureBilling: (db: AppDatabase) => void = () => {};

export function registerSeed(seed: (db: AppDatabase) => void) {
  seedDatabase = seed;
}

export function registerTerminology(ensure: (db: AppDatabase) => void) {
  ensureTerminology = ensure;
}

export function registerGateway(ensure: (db: AppDatabase) => void) {
  ensureGateway = ensure;
}

export function registerAgents(ensure: (db: AppDatabase) => void) {
  ensureAgents = ensure;
}

export function registerDocumentation(ensure: (db: AppDatabase) => void) {
  ensureDocumentation = ensure;
}

export function registerLab(ensure: (db: AppDatabase) => void) {
  ensureLab = ensure;
}

export function registerRx(ensure: (db: AppDatabase) => void) {
  ensureRx = ensure;
}

export function registerCoordination(ensure: (db: AppDatabase) => void) {
  ensureCoordination = ensure;
}

export function registerPatient(ensure: (db: AppDatabase) => void) {
  ensurePatient = ensure;
}

export function registerAuthorization(ensure: (db: AppDatabase) => void) {
  ensureAuthorization = ensure;
}

export function registerConsent(ensure: (db: AppDatabase) => void) {
  ensureConsent = ensure;
}

export function registerRetention(ensure: (db: AppDatabase) => void) {
  ensureRetention = ensure;
}

export function registerDsar(ensure: (db: AppDatabase) => void) {
  ensureDsar = ensure;
}

export function registerTelemetry(ensure: (db: AppDatabase) => void) {
  ensureTelemetry = ensure;
}

export function registerMaster(ensure: (db: AppDatabase) => void) {
  ensureMaster = ensure;
}

export function registerSchedule(ensure: (db: AppDatabase) => void) {
  ensureSchedule = ensure;
}

export function registerSource(ensure: (db: AppDatabase) => void) {
  ensureSource = ensure;
}

export function registerWork(ensure: (db: AppDatabase) => void) {
  ensureWork = ensure;
}

export function registerBilling(ensure: (db: AppDatabase) => void) {
  ensureBilling = ensure;
}

function migrate(db: AppDatabase) {
  const exists = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  const current = exists ? db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number | null } : null;
  if (current?.version === 49) return;
  if (current?.version && current.version > 49) throw new Error("Unsupported database schema.");
  if (!current?.version || current.version < 44) {
    migrateLegacy(db);
    transaction(db, () => {
      db.exec(CODE_SYSTEM_REGISTRY_SCHEMA);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (44)").run();
    });
  }
  if (!current?.version || current.version < 45) {
    transaction(db, () => {
      db.exec(TERMINOLOGY_VALIDATION_SCHEMA);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (45)").run();
    });
  }
  if (!current?.version || current.version < 46) {
    transaction(db, () => {
      db.exec(TERMINOLOGY_MAPPING_SCHEMA);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (46)").run();
    });
  }
  if (!current?.version || current.version < 47) {
    transaction(db, () => {
      db.exec(FACILITY_CATALOG_SCHEMA);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (47)").run();
    });
  }
  if(!current?.version || current.version<48) transaction(db, () => {
    db.exec(CLINICAL_CODING_SCHEMA);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (48)").run();
  });
  transaction(db,()=>{db.exec(SMART_SCHEMA);db.prepare("INSERT INTO schema_migrations (version) VALUES (49)").run();});
}

function migrateLegacy(db: AppDatabase) {
  // Identity 29, authorization 30, workforce 31, emergency access 32, access ledger 33, consent 34, retention 35, privacy requests 36, privacy telemetry 37, master records 38, scheduling 39, clinical source 40, work coordination 41, billing 42, billing integrity 43.
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)");
  const row = db.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.exec("BEGIN");
    try {
      db.exec(SCHEMA);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (34)").run();
      db.exec(UPGRADE_V35);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (35)").run();
      applyV36(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 43) return;
  if (row.version === 42) {
    transaction(db, () => applyV43(db));
    return;
  }
  if (row.version === 41) {
    db.exec("BEGIN");
    try {
      applyV42(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 40) {
    db.exec("BEGIN");
    try {
      applyV41(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 39) {
    db.exec("BEGIN");
    try {
      applyV40(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 38) {
    db.exec("BEGIN");
    try {
      applyV39(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 37) {
    db.exec("BEGIN");
    try {
      applyV38(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 36) {
    db.exec("BEGIN");
    try {
      applyV37(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 35) {
    db.exec("BEGIN");
    try {
      applyV36(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 34) {
    db.exec("BEGIN");
    try {
      db.exec(UPGRADE_V35);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (35)").run();
      applyV36(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 33) {
    db.exec("BEGIN");
    try {
      db.exec(UPGRADE_V34);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (34)").run();
      db.exec(UPGRADE_V35);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (35)").run();
      applyV36(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 32) {
    db.exec("BEGIN");
    try {
      db.exec(UPGRADE_V33);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (33)").run();
      db.exec(UPGRADE_V34);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (34)").run();
      db.exec(UPGRADE_V35);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (35)").run();
      applyV36(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 31) {
    db.exec("BEGIN");
    try {
      db.exec(UPGRADE_V32);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (32)").run();
      db.exec(UPGRADE_V33);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (33)").run();
      db.exec(UPGRADE_V34);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (34)").run();
      db.exec(UPGRADE_V35);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (35)").run();
      applyV36(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 30 || row.version === 29 || row.version === 28 || row.version === 27 || row.version === 26) {
    db.exec("BEGIN");
    try {
      if (row.version === 26) {
        db.exec(UPGRADE_V27);
        db.prepare("INSERT INTO schema_migrations (version) VALUES (27)").run();
      }
      if (row.version <= 27) {
        db.exec(UPGRADE_V28);
        db.prepare("INSERT INTO schema_migrations (version) VALUES (28)").run();
      }
      if (row.version <= 28) {
        db.exec(UPGRADE_V29);
        db.prepare("INSERT INTO schema_migrations (version) VALUES (29)").run();
      }
      if (row.version <= 29) {
        db.exec(UPGRADE_V30);
        db.prepare("INSERT INTO schema_migrations (version) VALUES (30)").run();
      }
      db.exec(UPGRADE_V31);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (31)").run();
      db.exec(UPGRADE_V32);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (32)").run();
      db.exec(UPGRADE_V33);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (33)").run();
      db.exec(UPGRADE_V34);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (34)").run();
      db.exec(UPGRADE_V35);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (35)").run();
      applyV36(db);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version !== 1 && row.version !== 2 && row.version !== 3 && row.version !== 4 && row.version !== 5 && row.version !== 6 && row.version !== 7 && row.version !== 8 && row.version !== 9 && row.version !== 10 && row.version !== 11 && row.version !== 12 && row.version !== 13 && row.version !== 14 && row.version !== 15 && row.version !== 16 && row.version !== 17 && row.version !== 18 && row.version !== 19 && row.version !== 20 && row.version !== 21 && row.version !== 22 && row.version !== 23 && row.version !== 24 && row.version !== 25) {
    throw new Error(`Unsupported schema version ${row.version}`);
  }
  db.exec("BEGIN");
  try {
    if (row.version === 1) {
      db.exec(UPGRADE_V2);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (2)").run();
    }
    if (row.version <= 2) {
      db.exec(UPGRADE_V3);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (3)").run();
    }
    if (row.version <= 3) {
      db.exec(UPGRADE_V4);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (4)").run();
    }
    if (row.version <= 4) {
      db.exec(UPGRADE_V5);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (5)").run();
    }
    if (row.version <= 5) {
      db.exec(UPGRADE_V6);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (6)").run();
    }
    if (row.version <= 6) {
      db.exec(UPGRADE_V7);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (7)").run();
    }
    if (row.version <= 7) {
      db.exec(UPGRADE_V8);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (8)").run();
    }
    if (row.version <= 8) {
      db.exec(UPGRADE_V9);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (9)").run();
    }
    if (row.version <= 9) {
      db.exec(UPGRADE_V10);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (10)").run();
    }
    if (row.version <= 10) {
      db.exec(UPGRADE_V11);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (11)").run();
    }
    if (row.version <= 11) {
      db.exec(UPGRADE_V12);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (12)").run();
    }
    if (row.version <= 12) {
      db.exec(UPGRADE_V13);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (13)").run();
    }
    if (row.version <= 13) {
      db.exec(UPGRADE_V14);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (14)").run();
    }
    if (row.version <= 14) {
      db.exec(UPGRADE_V15);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (15)").run();
    }
    if (row.version <= 15) {
      db.exec(UPGRADE_V16);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (16)").run();
    }
    if (row.version <= 16) {
      db.exec(UPGRADE_V17);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (17)").run();
    }
    if (row.version <= 17) {
      db.exec(UPGRADE_V18);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (18)").run();
    }
    if (row.version <= 18) {
      db.exec(UPGRADE_V19);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (19)").run();
    }
    if (row.version <= 19) {
      db.exec(UPGRADE_V20);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (20)").run();
    }
    if (row.version <= 20) {
      db.exec(UPGRADE_V21);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (21)").run();
    }
    if (row.version <= 21) {
      db.exec(UPGRADE_V22);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (22)").run();
    }
    if (row.version <= 22) {
      db.exec(UPGRADE_V23);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (23)").run();
    }
    if (row.version <= 23) {
      db.exec(UPGRADE_V24);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (24)").run();
    }
    if (row.version <= 24) {
      db.exec(UPGRADE_V25);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (25)").run();
    }
    db.exec(UPGRADE_V26);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (26)").run();
    db.exec(UPGRADE_V27);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (27)").run();
    db.exec(UPGRADE_V28);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (28)").run();
    db.exec(UPGRADE_V29);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (29)").run();
    db.exec(UPGRADE_V30);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (30)").run();
    db.exec(UPGRADE_V31);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (31)").run();
    db.exec(UPGRADE_V32);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (32)").run();
    db.exec(UPGRADE_V33);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (33)").run();
    db.exec(UPGRADE_V34);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (34)").run();
    db.exec(UPGRADE_V35);
    db.prepare("INSERT INTO schema_migrations (version) VALUES (35)").run();
      applyV36(db);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const UPGRADE_V2 = `
ALTER TABLE conditions ADD COLUMN code_system_version TEXT NOT NULL DEFAULT '2026';
ALTER TABLE observations ADD COLUMN code_system_version TEXT NOT NULL DEFAULT '2.78';
ALTER TABLE observations ADD COLUMN unit_system_version TEXT NOT NULL DEFAULT '2.2';
ALTER TABLE observations ADD COLUMN binding_version TEXT NOT NULL DEFAULT 'facility-vitals-2026.10';
CREATE TABLE IF NOT EXISTS code_systems (
  id TEXT PRIMARY KEY,
  uri TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  UNIQUE (uri, version)
);
CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  code_system_id TEXT NOT NULL REFERENCES code_systems(id),
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  unit_code TEXT,
  low_bound REAL,
  high_bound REAL,
  entry_min REAL,
  entry_max REAL,
  UNIQUE (code_system_id, code)
);
CREATE TABLE IF NOT EXISTS value_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS value_set_members (
  value_set_id TEXT NOT NULL REFERENCES value_sets(id),
  concept_id TEXT NOT NULL REFERENCES concepts(id),
  PRIMARY KEY (value_set_id, concept_id)
);
CREATE TABLE IF NOT EXISTS facility_catalogs (
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  value_set_id TEXT NOT NULL REFERENCES value_sets(id),
  PRIMARY KEY (facility_id, value_set_id)
);
`;

const UPGRADE_V3 = `
CREATE TABLE IF NOT EXISTS fhir_subscriptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  criteria TEXT NOT NULL,
  channel_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL,
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fhir_notifications (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES fhir_subscriptions(id),
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS export_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fhir_notes ON fhir_notifications(subscription_id, created_at);
`;

const UPGRADE_V4 = `
CREATE TABLE IF NOT EXISTS patient_state_builds (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  built_at TEXT NOT NULL,
  UNIQUE (organization_id, facility_id, patient_id, version)
);
`;

const UPGRADE_V5 = `
CREATE TABLE IF NOT EXISTS evidence_claims (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('supported','insufficient','invalidated')),
  author_id TEXT NOT NULL,
  filed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_citations (
  claim_id TEXT NOT NULL REFERENCES evidence_claims(id),
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  PRIMARY KEY (claim_id, source_table, source_id)
);
CREATE INDEX IF NOT EXISTS idx_evidence_patient ON evidence_claims(organization_id, facility_id, patient_id);
`;

const UPGRADE_V6 = `
CREATE TABLE IF NOT EXISTS gateway_prompts (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  output_schema_json TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS gateway_models (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS gateway_quotas (
  organization_id TEXT PRIMARY KEY,
  token_budget INTEGER NOT NULL,
  tokens_used INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS gateway_attempts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  actor_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL,
  redacted INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  output_json TEXT,
  created_at TEXT NOT NULL
);
`;

const UPGRADE_V7 = `
CREATE TABLE IF NOT EXISTS agent_manifests (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  risk_class TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  allowed_actors_json TEXT NOT NULL,
  allowed_tools_json TEXT NOT NULL,
  data_scope TEXT NOT NULL,
  model_policy TEXT NOT NULL,
  approval_required INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  evaluation_suite TEXT NOT NULL,
  owner TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE TABLE IF NOT EXISTS agent_tools (
  id TEXT PRIMARY KEY,
  capability TEXT NOT NULL CHECK (capability IN ('read','draft')),
  permits_execution INTEGER NOT NULL,
  sandbox TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  agent_version INTEGER NOT NULL,
  patient_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','awaiting-approval','completed','refused','failed')),
  attempt_count INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  tool_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('committed','parked','refused')),
  input_hash TEXT NOT NULL,
  output_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (run_id, step_index)
);
CREATE TABLE IF NOT EXISTS agent_approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','declined')),
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_facility ON agent_runs(organization_id, facility_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_approvals_run ON agent_approvals(organization_id, facility_id, status);
`;

const UPGRADE_V8 = `
CREATE TABLE IF NOT EXISTS copilot_turns (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('grounded','blocked')),
  reason TEXT NOT NULL,
  grounding_score REAL NOT NULL,
  answer_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS copilot_feedback (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('helpful','not-grounded')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_copilot_turns_patient ON copilot_turns(organization_id, facility_id, patient_id, created_at);
`;

const UPGRADE_V9 = `
CREATE TABLE IF NOT EXISTS documentation_settings (
  organization_id TEXT PRIMARY KEY,
  audio_retention_hours INTEGER NOT NULL CHECK (audio_retention_hours >= 0 AND audio_retention_hours <= 72)
);
CREATE TABLE IF NOT EXISTS documentation_consents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  granted INTEGER NOT NULL CHECK (granted IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documentation_captures (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text','audio')),
  retention_hours INTEGER NOT NULL,
  expires_at TEXT,
  content_hash TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  audio_bytes BLOB,
  transcript_text TEXT,
  transcript_origin TEXT NOT NULL CHECK (transcript_origin IN ('clinician-typed','none')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documentation_drafts (
  id TEXT PRIMARY KEY,
  capture_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','accepted','rejected')),
  signed INTEGER NOT NULL DEFAULT 0 CHECK (signed = 0),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);
CREATE TABLE IF NOT EXISTS documentation_sections (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  quote_start INTEGER NOT NULL,
  quote_end INTEGER NOT NULL,
  text TEXT NOT NULL,
  authorship TEXT NOT NULL CHECK (authorship IN ('source-quote','clinician-authored')),
  UNIQUE (draft_id, position)
);
CREATE INDEX IF NOT EXISTS idx_documentation_patient ON documentation_drafts(organization_id, facility_id, patient_id, created_at);
`;

const UPGRADE_V10 = `
CREATE TABLE IF NOT EXISTS lab_critical_rules (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  critical_low REAL,
  critical_high REAL,
  rule_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','collected','resulted','cancelled')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_specimens (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  collected_by TEXT NOT NULL,
  collected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_results (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  observation_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  code TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  unit_system_version TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  binding_version TEXT NOT NULL,
  reference_low REAL,
  reference_high REAL,
  critical_flag TEXT NOT NULL CHECK (critical_flag IN ('none','critical-low','critical-high')),
  rule_id TEXT,
  rule_version TEXT,
  recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_alerts (
  id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  critical_flag TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','acknowledged')),
  acknowledged_by TEXT,
  acknowledged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON lab_orders(organization_id, facility_id, patient_id, created_at);
`;

const UPGRADE_V11 = `
CREATE TABLE IF NOT EXISTS rx_formulary (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display TEXT NOT NULL,
  therapy_class TEXT NOT NULL,
  formulary_status TEXT NOT NULL CHECK (formulary_status IN ('on-formulary','non-formulary')),
  source TEXT NOT NULL,
  rule_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rx_safety_rules (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('allergy','interaction','duplicate','formulary')),
  left_key TEXT NOT NULL,
  right_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high','moderate')),
  source TEXT NOT NULL,
  rule_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rx_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  formulary_id TEXT NOT NULL,
  dose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed','active','dispensed','cancelled')),
  medication_id TEXT,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rx_warnings (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  source TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','acknowledged')),
  acknowledged_by TEXT,
  acknowledged_at TEXT
);
CREATE TABLE IF NOT EXISTS rx_dispenses (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  dispensed_by TEXT NOT NULL,
  dispensed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rx_administrations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  administered_by TEXT NOT NULL,
  administered_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rx_orders_patient ON rx_orders(organization_id, facility_id, patient_id, created_at);
`;

const UPGRADE_V12 = `
CREATE TABLE IF NOT EXISTS outreach_templates (
  id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en','es')),
  body TEXT NOT NULL,
  version TEXT NOT NULL,
  PRIMARY KEY (id, locale)
);
CREATE TABLE IF NOT EXISTS patient_outreach (
  patient_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en','es')),
  channel TEXT NOT NULL CHECK (channel IN ('portal','none')),
  consent TEXT NOT NULL CHECK (consent IN ('granted','withheld')),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outreach_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  body TEXT NOT NULL,
  version TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_referrals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  from_facility_id TEXT NOT NULL,
  to_facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','accepted','declined')),
  author_id TEXT NOT NULL,
  decided_by TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS care_plans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','active')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS care_tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('follow-up','gap','escalation')),
  source_table TEXT,
  source_id TEXT,
  reason TEXT NOT NULL,
  failure TEXT,
  status TEXT NOT NULL CHECK (status IN ('open','done')),
  owner_id TEXT,
  due_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_care_tasks_patient ON care_tasks(organization_id, facility_id, patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_care_referrals_to ON care_referrals(organization_id, to_facility_id, status);
`;

const UPGRADE_V13 = `
CREATE TABLE IF NOT EXISTS patient_principals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient_sessions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL REFERENCES patient_principals(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS patient_education (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient_questions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  text TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('stored','triage')),
  instruction TEXT,
  tool TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient_messages (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  body TEXT NOT NULL,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('patient','facility')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient_coverage (
  patient_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  payer_name TEXT NOT NULL,
  member_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient_payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recorded')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested','accepted','declined')),
  starts_at TEXT,
  ends_at TEXT,
  appointment_id TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_patient_questions_patient ON patient_questions(organization_id, facility_id, patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_patient_messages_patient ON patient_messages(organization_id, facility_id, patient_id, created_at);
`;

const UPGRADE_V14 = `
CREATE TABLE IF NOT EXISTS facility_beds (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','occupied','closed')),
  patient_id TEXT,
  version INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS facility_shifts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled','active','finished')),
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS facility_equipment (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available','out-of-service')),
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS facility_state (
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  built_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, facility_id)
);
CREATE INDEX IF NOT EXISTS idx_facility_beds_facility ON facility_beds(organization_id, facility_id, recorded_at);
`;

const UPGRADE_V15 = `
CREATE TABLE IF NOT EXISTS operations_inventory (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  label TEXT NOT NULL,
  on_hand INTEGER NOT NULL CHECK (on_hand >= 0 AND on_hand <= 100000),
  author_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS operations_overrides (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('wait','capacity','inventory','staffing','bottleneck')),
  action TEXT NOT NULL CHECK (action IN ('hold')),
  reason TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS operations_state (
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  baseline_json TEXT NOT NULL,
  built_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, facility_id)
);
CREATE INDEX IF NOT EXISTS idx_operations_inventory_facility ON operations_inventory(organization_id, facility_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_operations_overrides_facility ON operations_overrides(organization_id, facility_id, created_at);
`;

const UPGRADE_V16 = `
CREATE TABLE IF NOT EXISTS analytics_facts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  outbox_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  facility_id TEXT,
  kept_json TEXT NOT NULL,
  dropped_keys_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  deid_version TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  UNIQUE (organization_id, outbox_id)
);
CREATE TABLE IF NOT EXISTS analytics_exports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('release','withhold')),
  body_json TEXT,
  lineage_json TEXT NOT NULL,
  assessment_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_facts_org ON analytics_facts(organization_id, event_type);
`;

const UPGRADE_V17 = `
ALTER TABLE organizations ADD COLUMN jurisdiction TEXT;
CREATE TABLE IF NOT EXISTS population_state (
  organization_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  jurisdiction TEXT,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  built_at TEXT NOT NULL
);
`;

const UPGRADE_V18 = `
CREATE TABLE IF NOT EXISTS research_workspaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  protocol_label TEXT NOT NULL,
  ethics_status TEXT NOT NULL CHECK (ethics_status IN ('not-reviewed')),
  ethics_note TEXT NOT NULL,
  purpose_of_use TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS research_datasets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  population_version INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, version)
);
CREATE TABLE IF NOT EXISTS research_exports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('awaiting-approval','approved','declined')),
  requester_id TEXT NOT NULL,
  approver_id TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_research_workspaces_org ON research_workspaces(organization_id, created_at);
`;

const UPGRADE_V19 = `
CREATE TABLE IF NOT EXISTS imaging_studies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  accession TEXT NOT NULL,
  modality TEXT NOT NULL,
  description TEXT NOT NULL,
  study_date TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_imaging_studies_fac ON imaging_studies(organization_id, facility_id, created_at);
CREATE TABLE IF NOT EXISTS imaging_reports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  study_id TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imaging_releases (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  study_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('release','withhold')),
  body_json TEXT,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const UPGRADE_V20 = `
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  connectivity TEXT NOT NULL CHECK (connectivity IN ('not-connected')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_fac ON devices(organization_id, facility_id, created_at);
CREATE TABLE IF NOT EXISTS device_readings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  unit_system_version TEXT NOT NULL,
  binding_version TEXT NOT NULL,
  normalization_version TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  order_flag TEXT NOT NULL CHECK (order_flag IN ('in-order','out-of-order')),
  author_id TEXT NOT NULL,
  UNIQUE (device_id, code, effective_at)
);
CREATE TABLE IF NOT EXISTS device_alerts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reading_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('open','acknowledged')),
  rule_version TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT
);
CREATE TABLE IF NOT EXISTS device_escalations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  reading_id TEXT NOT NULL UNIQUE,
  budget INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const UPGRADE_V21 = `
CREATE TABLE IF NOT EXISTS revenue_invoices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  service_label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recorded')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revenue_invoices_org ON revenue_invoices(organization_id, created_at);
CREATE TABLE IF NOT EXISTS revenue_payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recorded')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revenue_eligibility (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  payer_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not-checked')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revenue_claims (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revenue_claim_attempts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  claim_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('not-submitted')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS revenue_subscriptions (
  organization_id TEXT PRIMARY KEY,
  plan_label TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not-billed')),
  author_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const UPGRADE_V22 = `
CREATE TABLE IF NOT EXISTS eval_datasets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  golden_version TEXT NOT NULL,
  case_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, version)
);
CREATE TABLE IF NOT EXISTS eval_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('passed','failed')),
  result_json TEXT NOT NULL,
  rollback_json TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS eval_approvals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('awaiting','signed')),
  requester_id TEXT NOT NULL,
  signer_id TEXT,
  decision TEXT CHECK (decision IN ('hold')),
  created_at TEXT NOT NULL,
  signed_at TEXT
);
CREATE TABLE IF NOT EXISTS eval_promotions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('not-promoted')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const UPGRADE_V23 = `
CREATE TABLE IF NOT EXISTS enterprise_residency (
  organization_id TEXT PRIMARY KEY,
  region TEXT NOT NULL CHECK (region IN ('local-sqlite')),
  author_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enterprise_federation (
  organization_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('not-connected')),
  author_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enterprise_keys (
  organization_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('not-configured')),
  author_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enterprise_drills (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  failover TEXT NOT NULL CHECK (failover IN ('not-run')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enterprise_grants (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  label TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('health.read')),
  status TEXT NOT NULL CHECK (status IN ('local-session')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const UPGRADE_V24 = `
CREATE TABLE IF NOT EXISTS marketplace_listings (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  label TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('health.read')),
  risk TEXT NOT NULL CHECK (risk IN ('administrative')),
  status TEXT NOT NULL CHECK (status IN ('awaiting-review','reviewed','stopped')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  listing_id TEXT NOT NULL UNIQUE,
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('hold')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS marketplace_shares (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('not-billed')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS marketplace_stops (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const UPGRADE_V25 = `
CREATE TABLE IF NOT EXISTS release_strategies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('local-synthetic')),
  status TEXT NOT NULL CHECK (status IN ('not-approved')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS release_dossiers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  label TEXT NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS release_traces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS release_risks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-reviewed')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS release_validations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL CHECK (outcome IN ('refused')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS release_evaluations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-performed')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS release_changes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-authorized')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS release_surveillance (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-active')),
  refusal_count INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS release_attempts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dossier_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('not-released')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const UPGRADE_V26 = `
CREATE TABLE IF NOT EXISTS ai_modules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code IN ('imaging','ecg','pathology','dermatology','maternal','cardio','oncology')),
  status TEXT NOT NULL CHECK (status IN ('not-cleared')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, code)
);
CREATE TABLE IF NOT EXISTS ai_module_validations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  module_id TEXT NOT NULL UNIQUE,
  outcome TEXT NOT NULL CHECK (outcome IN ('refused')),
  reviewer_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_module_studies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  module_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-run')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_module_performance (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  module_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not-calculated')),
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const UPGRADE_V27 = `
ALTER TABLE organizations ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE facilities ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE sessions ADD COLUMN active_organization_id TEXT;
ALTER TABLE sessions ADD COLUMN active_facility_id TEXT;
ALTER TABLE sessions ADD COLUMN context_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('active','suspended','revoked')),
  version INTEGER NOT NULL,
  UNIQUE (organization_id, user_id)
);
CREATE TABLE IF NOT EXISTS facility_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  facility_id TEXT NOT NULL REFERENCES facilities(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','suspended','revoked')),
  version INTEGER NOT NULL,
  UNIQUE (facility_id, user_id)
);
CREATE TABLE IF NOT EXISTS service_principals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  UNIQUE (organization_id, name)
);
CREATE TABLE IF NOT EXISTS tenancy_controls (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dependency TEXT NOT NULL
);
`;

const UPGRADE_V28 = `
CREATE TABLE IF NOT EXISTS identity_providers (
  issuer TEXT PRIMARY KEY,
  audience TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','pending','disabled')),
  UNIQUE (issuer, subject)
);
CREATE TABLE IF NOT EXISTS auth_transactions (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  nonce TEXT NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  assurance TEXT NOT NULL,
  created_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  idle_expires_at TEXT NOT NULL,
  revoked_at TEXT,
  refresh_token TEXT,
  refresh_current_hash TEXT,
  refresh_previous_hash TEXT
);
CREATE TABLE IF NOT EXISTS pending_logins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS auth_events (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  subject_hash TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS totp_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  secret TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','revoked')),
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  recovery_hashes TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','revoked'))
);
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  challenge TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('registration','authentication')),
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE IF NOT EXISTS auth_counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
`;

const UPGRADE_V29 = `
ALTER TABLE pending_logins ADD COLUMN refresh_token TEXT;
ALTER TABLE auth_events ADD COLUMN correlation_id TEXT;
ALTER TABLE auth_events ADD COLUMN duration_ms INTEGER;
`;

const UPGRADE_V30 = `
CREATE TABLE IF NOT EXISTS authorization_roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT,
  facility_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  system_role INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','retired')),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, name)
);
CREATE TABLE IF NOT EXISTS authorization_permissions (
  id TEXT PRIMARY KEY,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('standard','administrative','clinical','restricted')),
  constraints_json TEXT NOT NULL,
  UNIQUE (resource, action)
);
CREATE TABLE IF NOT EXISTS authorization_role_permissions (
  role_id TEXT NOT NULL REFERENCES authorization_roles(id),
  permission_id TEXT NOT NULL REFERENCES authorization_permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
CREATE TABLE IF NOT EXISTS authorization_assignments (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES authorization_roles(id),
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','revoked')),
  version INTEGER NOT NULL,
  UNIQUE (principal_id, role_id, organization_id, facility_id)
);
CREATE TABLE IF NOT EXISTS authorization_policies (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  scope TEXT NOT NULL,
  conditions_json TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('deny')),
  status TEXT NOT NULL CHECK (status IN ('active','disabled')),
  approved_at TEXT,
  effective_from TEXT NOT NULL,
  effective_until TEXT,
  UNIQUE (id, version)
);
CREATE TABLE IF NOT EXISTS authorization_decisions (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  scope_organization_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('allow','deny')),
  reason TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS authorization_decisions_principal ON authorization_decisions (principal_id, created_at);
CREATE TABLE IF NOT EXISTS authorization_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS authorization_cache (
  cache_key TEXT PRIMARY KEY,
  assignment_version INTEGER NOT NULL,
  permissions_json TEXT NOT NULL
);
`;

const UPGRADE_V31 = `
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active';
CREATE TABLE IF NOT EXISTS workforce_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','expired','cancelled')),
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  cancelled_at TEXT,
  token_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  requires_external INTEGER NOT NULL,
  bound_user_id TEXT,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS workforce_invitation_facilities (
  invitation_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  PRIMARY KEY (invitation_id, facility_id)
);
CREATE TABLE IF NOT EXISTS workforce_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  organization_id TEXT,
  previous_state TEXT,
  next_state TEXT,
  reason TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workforce_outbox (
  id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('captured','failed','retried')),
  attempt INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workforce_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const UPGRADE_V32 = `
CREATE TABLE IF NOT EXISTS emergency_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  action TEXT NOT NULL,
  overridable_reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('enabled','disabled')),
  version INTEGER NOT NULL,
  UNIQUE (organization_id, facility_id, environment, resource_type, action)
);
CREATE TABLE IF NOT EXISTS emergency_resources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  summary TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_requests (
  id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  purpose TEXT NOT NULL,
  reason_category TEXT NOT NULL,
  justification TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  status TEXT NOT NULL,
  assurance_required TEXT NOT NULL,
  policy_id TEXT,
  policy_version INTEGER,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS emergency_challenges (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  method TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_grants (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  principal_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  action TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  status TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  assurance_ref TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_events (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  grant_id TEXT,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decision TEXT NOT NULL,
  resource_id TEXT,
  action TEXT,
  outcome TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_reviews (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  reviewer_id TEXT,
  status TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  reviewed_at TEXT,
  disposition TEXT,
  notes TEXT,
  escalation TEXT,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS emergency_alerts (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('captured','failed','retried')),
  attempt INTEGER NOT NULL,
  failure_category TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE TABLE IF NOT EXISTS emergency_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const UPGRADE_V33 = `
CREATE TABLE IF NOT EXISTS access_ledger (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  actor_id TEXT NOT NULL,
  subject_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  purpose TEXT NOT NULL,
  outcome TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  before_hash TEXT NOT NULL,
  after_hash TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  entry_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_access_ledger_org ON access_ledger(organization_id, sequence);
CREATE TRIGGER IF NOT EXISTS access_ledger_no_update
BEFORE UPDATE ON access_ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger-sealed');
END;
CREATE TRIGGER IF NOT EXISTS access_ledger_no_delete
BEFORE DELETE ON access_ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger-sealed');
END;
`;

const UPGRADE_V34 = `
CREATE TABLE IF NOT EXISTS consent_subjects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  subject_type TEXT NOT NULL,
  display_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consent_policies (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_category TEXT NOT NULL,
  recipient_class TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  version INTEGER NOT NULL,
  consent_required INTEGER NOT NULL,
  UNIQUE (action, version)
);
CREATE TABLE IF NOT EXISTS consent_authorities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  grantor_id TEXT NOT NULL,
  category TEXT NOT NULL,
  evidence_ref TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  verifier_id TEXT,
  status TEXT NOT NULL,
  valid_from TEXT,
  valid_until TEXT,
  scope TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS consent_directives (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  subject_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  category TEXT NOT NULL,
  purpose TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_category TEXT NOT NULL,
  recipient TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  grantor_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  decision TEXT NOT NULL,
  status TEXT NOT NULL,
  effective_at TEXT,
  expires_at TEXT,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consent_versions (
  id TEXT PRIMARY KEY,
  consent_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  change_code TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (consent_id, version)
);
CREATE TABLE IF NOT EXISTS consent_withdrawals (
  id TEXT PRIMARY KEY,
  consent_id TEXT NOT NULL,
  prior_version INTEGER NOT NULL,
  requester_id TEXT NOT NULL,
  authority_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL,
  applied_version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  UNIQUE (consent_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS consent_dispatches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  subject_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  purpose TEXT NOT NULL,
  action TEXT NOT NULL,
  recipient TEXT NOT NULL,
  resource_category TEXT NOT NULL,
  status TEXT NOT NULL,
  directive_id TEXT,
  directive_version INTEGER,
  reason_code TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS consent_sink (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL UNIQUE,
  delivered_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consent_cache (
  cache_key TEXT PRIMARY KEY,
  directive_version INTEGER NOT NULL,
  result TEXT NOT NULL,
  reason_code TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consent_idempotency (
  organization_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  directive_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS consent_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consent_directive_subject ON consent_directives(organization_id, subject_id, status);
CREATE TRIGGER IF NOT EXISTS consent_versions_no_update
BEFORE UPDATE ON consent_versions
BEGIN
  SELECT RAISE(ABORT, 'consent-history-sealed');
END;
CREATE TRIGGER IF NOT EXISTS consent_versions_no_delete
BEFORE DELETE ON consent_versions
BEGIN
  SELECT RAISE(ABORT, 'consent-history-sealed');
END;
`;

const UPGRADE_V35 = `
CREATE TABLE IF NOT EXISTS retention_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  jurisdiction TEXT NOT NULL,
  category TEXT NOT NULL,
  classification TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  duration INTEGER,
  duration_unit TEXT,
  expiry_action TEXT NOT NULL,
  approval_state TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS retention_policy_versions (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  snapshot_hash TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (policy_id, version)
);
CREATE TABLE IF NOT EXISTS retention_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  category TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL,
  version INTEGER NOT NULL,
  retention_start TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS retention_tombstones (
  resource_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  category TEXT NOT NULL,
  disposed_at TEXT NOT NULL,
  plan_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS retention_archives (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  resource_id TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  verified INTEGER NOT NULL,
  archived_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS legal_holds (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  matter_ref TEXT NOT NULL,
  scope_kind TEXT NOT NULL,
  scope_ref TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  authority_ref TEXT NOT NULL,
  issuing_actor TEXT NOT NULL,
  status TEXT NOT NULL,
  effective_at TEXT,
  review_at TEXT,
  released_at TEXT,
  released_by TEXT,
  release_reason TEXT,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS legal_hold_resources (
  hold_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  PRIMARY KEY (hold_id, resource_id)
);
CREATE TABLE IF NOT EXISTS retention_dry_runs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  eligible_count INTEGER NOT NULL,
  held_count INTEGER NOT NULL,
  review_count INTEGER NOT NULL,
  missing_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS retention_plan_items (
  id TEXT PRIMARY KEY,
  dry_run_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_version INTEGER NOT NULL,
  decision TEXT NOT NULL,
  policy_id TEXT,
  policy_version INTEGER,
  hold_id TEXT
);
CREATE TABLE IF NOT EXISTS retention_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  dry_run_id TEXT,
  requester_id TEXT NOT NULL,
  status TEXT NOT NULL,
  cursor_resource TEXT,
  success_count INTEGER NOT NULL,
  skip_count INTEGER NOT NULL,
  failure_count INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS retention_job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  outcome TEXT NOT NULL,
  failure_reason TEXT,
  executed_at TEXT NOT NULL,
  UNIQUE (job_id, resource_id)
);
CREATE TABLE IF NOT EXISTS retention_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_retention_records_org ON retention_records(organization_id, category, lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_legal_holds_org ON legal_holds(organization_id, status);
`;

function applyV36(db: AppDatabase) {
  db.exec(UPGRADE_V36);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (36)").run();
  applyV37(db);
}

function applyV37(db: AppDatabase) {
  db.exec(UPGRADE_V37);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (37)").run();
  applyV38(db);
}

function applyV38(db: AppDatabase) {
  const columns = db.prepare("PRAGMA table_info(patients)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("preferred_name")) db.exec("ALTER TABLE patients ADD COLUMN preferred_name TEXT");
  if (!names.has("registration_status")) db.exec("ALTER TABLE patients ADD COLUMN registration_status TEXT NOT NULL DEFAULT 'active'");
  if (!names.has("registration_source")) db.exec("ALTER TABLE patients ADD COLUMN registration_source TEXT NOT NULL DEFAULT 'chart'");
  if (!names.has("merged_into_id")) db.exec("ALTER TABLE patients ADD COLUMN merged_into_id TEXT");
  db.exec(UPGRADE_V38);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (38)").run();
  applyV39(db);
}

function applyV39(db: AppDatabase) {
  const columns = db.prepare("PRAGMA table_info(appointments)").all() as Array<{ name: string }>;
  const names = new Set(columns.map((column) => column.name));
  const add = (name: string, sql: string) => {
    if (!names.has(name)) db.exec(`ALTER TABLE appointments ADD COLUMN ${sql}`);
  };
  add("practitioner_id", "practitioner_id TEXT");
  add("category", "category TEXT");
  add("timezone", "timezone TEXT");
  add("version", "version INTEGER NOT NULL DEFAULT 1");
  add("source", "source TEXT NOT NULL DEFAULT 'legacy-chart'");
  add("created_by", "created_by TEXT");
  add("confirmed_by", "confirmed_by TEXT");
  add("cancellation_reason", "cancellation_reason TEXT");
  add("no_show_reason", "no_show_reason TEXT");
  add("arrived_at", "arrived_at TEXT");
  add("correlation_id", "correlation_id TEXT");
  add("created_at", "created_at TEXT");
  add("updated_at", "updated_at TEXT");
  db.exec(UPGRADE_V39);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (39)").run();
  applyV40(db);
}

const UPGRADE_V40 = `
CREATE TABLE IF NOT EXISTS source_conditions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  clinical_status TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  onset_date TEXT,
  resolution_date TEXT,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_allergies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  category TEXT NOT NULL,
  finding TEXT NOT NULL,
  clinical_status TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  criticality TEXT,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_observations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  value_type TEXT NOT NULL,
  value_quantity REAL,
  unit_code TEXT,
  unit_system TEXT NOT NULL,
  status TEXT NOT NULL,
  effective_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_observation_components (
  observation_id TEXT NOT NULL,
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  value_quantity REAL NOT NULL,
  unit_code TEXT NOT NULL,
  PRIMARY KEY (observation_id, code)
);
CREATE TABLE IF NOT EXISTS source_medication_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  dose_quantity REAL NOT NULL,
  dose_unit TEXT NOT NULL,
  route TEXT NOT NULL,
  frequency TEXT NOT NULL,
  intent TEXT NOT NULL,
  status TEXT NOT NULL,
  executable INTEGER NOT NULL CHECK (executable = 0),
  transmission TEXT NOT NULL CHECK (transmission = 'disabled'),
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS source_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  prior_version INTEGER,
  actor_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  encounter_id TEXT,
  recorded_at TEXT NOT NULL,
  amended_at TEXT,
  reason TEXT,
  snapshot_json TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (organization_id, record_kind, record_id, version)
);
CREATE TRIGGER IF NOT EXISTS source_versions_no_update
BEFORE UPDATE ON source_versions
BEGIN
  SELECT RAISE(ABORT, 'source version is immutable');
END;
CREATE TRIGGER IF NOT EXISTS source_versions_no_delete
BEFORE DELETE ON source_versions
BEGIN
  SELECT RAISE(ABORT, 'source version is immutable');
END;
CREATE TABLE IF NOT EXISTS source_commands (
  organization_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  PRIMARY KEY (organization_id, command_key)
);
CREATE TABLE IF NOT EXISTS source_metrics (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS source_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_conditions_patient ON source_conditions(organization_id, facility_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_source_observations_patient ON source_observations(organization_id, facility_id, patient_id);
`;

function applyV40(db: AppDatabase) {
  db.exec(UPGRADE_V40);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (40)").run();
  applyV41(db);
}

const UPGRADE_V41 = `
CREATE TABLE IF NOT EXISTS work_departments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  display TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  destination_department_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  due_on TEXT NOT NULL,
  fulfillment TEXT NOT NULL CHECK (fulfillment = 'not-transmitted'),
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_plans (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  status TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  due_on TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_referrals (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  from_facility_id TEXT NOT NULL,
  to_facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_system TEXT NOT NULL,
  code_system_version TEXT NOT NULL,
  display TEXT NOT NULL,
  status TEXT NOT NULL,
  due_on TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_tasks (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  parent_kind TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  status TEXT NOT NULL,
  assignee_user_id TEXT,
  due_on TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  prior_version INTEGER,
  actor_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  encounter_id TEXT,
  recorded_at TEXT NOT NULL,
  amended_at TEXT,
  reason TEXT,
  snapshot_json TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (organization_id, record_kind, record_id, version)
);
CREATE TRIGGER IF NOT EXISTS work_versions_no_update
BEFORE UPDATE ON work_versions
BEGIN
  SELECT RAISE(ABORT, 'work version is immutable');
END;
CREATE TRIGGER IF NOT EXISTS work_versions_no_delete
BEFORE DELETE ON work_versions
BEGIN
  SELECT RAISE(ABORT, 'work version is immutable');
END;
CREATE TABLE IF NOT EXISTS work_attachments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  parent_kind TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS work_commands (
  organization_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  PRIMARY KEY (organization_id, command_key)
);
CREATE TABLE IF NOT EXISTS work_metrics (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS work_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_work_orders_patient ON work_orders(organization_id, facility_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_work_tasks_facility ON work_tasks(organization_id, facility_id, status);
`;

function applyV41(db: AppDatabase) {
  db.exec(UPGRADE_V41);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (41)").run();
  applyV42(db);
}

const UPGRADE_V42 = `
CREATE TABLE IF NOT EXISTS billing_catalog (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  category TEXT NOT NULL,
  currency TEXT NOT NULL,
  minor_units INTEGER NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  effective_on TEXT NOT NULL,
  expires_on TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_charges (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  encounter_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  total_minor INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_charge_items (
  id TEXT PRIMARY KEY,
  charge_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  catalog_id TEXT NOT NULL,
  catalog_version INTEGER NOT NULL,
  code TEXT NOT NULL,
  display TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_adjustments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  charge_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  adjustment_type TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  prior_amount_minor INTEGER NOT NULL,
  reason TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  prior_version INTEGER NOT NULL,
  resulting_version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_versions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  prior_version INTEGER,
  actor_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  encounter_id TEXT,
  recorded_at TEXT NOT NULL,
  amended_at TEXT,
  reason TEXT,
  snapshot_json TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  UNIQUE (organization_id, record_kind, record_id, version)
);
CREATE TRIGGER IF NOT EXISTS billing_versions_no_update
BEFORE UPDATE ON billing_versions
BEGIN
  SELECT RAISE(ABORT, 'billing version is immutable');
END;
CREATE TRIGGER IF NOT EXISTS billing_versions_no_delete
BEFORE DELETE ON billing_versions
BEGIN
  SELECT RAISE(ABORT, 'billing version is immutable');
END;
CREATE TABLE IF NOT EXISTS billing_commands (
  organization_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  PRIMARY KEY (organization_id, command_key)
);
CREATE TABLE IF NOT EXISTS billing_metrics (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_charges_patient ON billing_charges(organization_id, facility_id, patient_id);
CREATE INDEX IF NOT EXISTS idx_billing_charges_encounter ON billing_charges(organization_id, encounter_id);
`;

function applyV42(db: AppDatabase) {
  db.exec(UPGRADE_V42);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (42)").run();
  applyV43(db);
}

// Additive guards also protect databases that already received experimental schema 42.
function applyV43(db: AppDatabase) {
  for (const operation of ["INSERT", "UPDATE"]) {
    db.exec(`CREATE TRIGGER IF NOT EXISTS billing_charge_integrity_${operation.toLowerCase()}
      BEFORE ${operation} ON billing_charges BEGIN
        SELECT CASE WHEN typeof(NEW.total_minor) != 'integer' OR NEW.total_minor < 0 OR NEW.total_minor > 100000000
          OR NEW.currency != 'GHS' OR NEW.version < 1 OR NEW.status NOT IN ('draft','recorded','reviewed','finalized-local','voided')
          OR NOT EXISTS (SELECT 1 FROM visit_encounters e JOIN patients p ON p.id = e.patient_id
            WHERE e.id = NEW.encounter_id AND e.patient_id = NEW.patient_id AND e.organization_id = NEW.organization_id
              AND e.facility_id = NEW.facility_id AND p.organization_id = NEW.organization_id)
          THEN RAISE(ABORT, 'invalid billing charge') END;
      END;
      CREATE TRIGGER IF NOT EXISTS billing_item_integrity_${operation.toLowerCase()}
      BEFORE ${operation} ON billing_charge_items BEGIN
        SELECT CASE WHEN typeof(NEW.quantity) != 'integer' OR NEW.quantity < 1 OR NEW.quantity > 100
          OR typeof(NEW.amount_minor) != 'integer' OR NEW.amount_minor < 0 OR NEW.amount_minor > 100000000
          OR typeof(NEW.unit_price_minor) != 'integer' OR NEW.unit_price_minor < 0 OR NEW.version < 1
          OR NOT EXISTS (SELECT 1 FROM billing_charges c JOIN billing_catalog k ON k.id = NEW.catalog_id
            WHERE c.id = NEW.charge_id AND c.organization_id = NEW.organization_id AND c.currency = NEW.currency
              AND k.organization_id = c.organization_id AND (k.facility_id IS NULL OR k.facility_id = c.facility_id))
          THEN RAISE(ABORT, 'invalid billing item') END;
      END;`);
  }
  db.exec(`CREATE TRIGGER IF NOT EXISTS billing_adjustments_no_update BEFORE UPDATE ON billing_adjustments
    BEGIN SELECT RAISE(ABORT, 'billing adjustment is immutable'); END;
    CREATE TRIGGER IF NOT EXISTS billing_adjustments_no_delete BEFORE DELETE ON billing_adjustments
    BEGIN SELECT RAISE(ABORT, 'billing adjustment is immutable'); END;`);
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (43)").run();
}

const UPGRADE_V36 = `
CREATE TABLE IF NOT EXISTS privacy_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  request_type TEXT NOT NULL,
  deadline_days INTEGER NOT NULL,
  download_hours INTEGER NOT NULL,
  large_threshold INTEGER NOT NULL,
  approval_state TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_subjects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  kind TEXT NOT NULL,
  display_label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_authorities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  guardian_ref TEXT NOT NULL,
  relationship TEXT NOT NULL,
  status TEXT NOT NULL,
  scope TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS privacy_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  category TEXT NOT NULL,
  third_party INTEGER NOT NULL,
  held INTEGER NOT NULL,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL,
  lifecycle_status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_record_versions (
  id TEXT PRIMARY KEY,
  record_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  changed_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  subject_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  authority_id TEXT,
  request_type TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  policy_id TEXT,
  policy_version INTEGER,
  categories TEXT NOT NULL,
  approved_categories TEXT,
  status TEXT NOT NULL,
  verification_state TEXT NOT NULL,
  decision_state TEXT NOT NULL,
  correction_field TEXT,
  correction_value TEXT,
  due_at TEXT,
  version INTEGER NOT NULL,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS privacy_verifications (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  result TEXT NOT NULL,
  verifier_id TEXT NOT NULL,
  evidence_hash TEXT,
  verified_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_reviews (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  reviewed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_exports (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  downloader_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL,
  cursor_index INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  byte_count INTEGER NOT NULL,
  monitoring TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  worker_token TEXT,
  error_code TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE (organization_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS privacy_export_items (
  export_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  PRIMARY KEY (export_id, record_id)
);
CREATE TABLE IF NOT EXISTS privacy_artifacts (
  id TEXT PRIMARY KEY,
  export_id TEXT NOT NULL UNIQUE,
  format TEXT NOT NULL,
  payload TEXT NOT NULL,
  checksum TEXT NOT NULL,
  byte_count INTEGER NOT NULL,
  access_state TEXT NOT NULL,
  download_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  cleaned_at TEXT
);
CREATE TABLE IF NOT EXISTS privacy_manifests (
  export_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  checksum TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_tombstones (
  record_id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  disposed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_erasure_plans (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  eligible_count INTEGER NOT NULL,
  blocked_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_alerts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  export_id TEXT,
  kind TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_revoked_sessions (
  session_id TEXT PRIMARY KEY,
  revoked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_org ON privacy_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_privacy_records_subject ON privacy_records(organization_id, subject_id, lifecycle_status);
`;

const UPGRADE_V37 = `
CREATE TABLE IF NOT EXISTS privacy_telemetry_policies (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  allowed_fields TEXT NOT NULL,
  excluded_classes TEXT NOT NULL,
  destination TEXT NOT NULL,
  approval_state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_signal_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  category TEXT NOT NULL,
  version INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  severity TEXT NOT NULL,
  dedupe_seconds INTEGER NOT NULL,
  status TEXT NOT NULL,
  approval_state TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_security_alerts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  investigation_note TEXT,
  disposition TEXT,
  version INTEGER NOT NULL,
  detected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, rule_id, source_ref)
);
CREATE TABLE IF NOT EXISTS privacy_alert_events (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_telemetry_sink (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  decision TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS privacy_telemetry_health (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source TEXT NOT NULL,
  sanitizer TEXT NOT NULL,
  collector TEXT NOT NULL,
  destination TEXT NOT NULL,
  failure_category TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_privacy_security_alerts_org ON privacy_security_alerts(organization_id, status);
`;

const UPGRADE_V38 = `
CREATE TABLE IF NOT EXISTS patient_identifiers (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT,
  system TEXT NOT NULL,
  value TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE (organization_id, system, value)
);
CREATE TABLE IF NOT EXISTS patient_contacts (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  use TEXT NOT NULL,
  system TEXT NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patient_facility_registrations (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  UNIQUE (patient_id, facility_id)
);
CREATE TABLE IF NOT EXISTS patient_versions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS duplicate_candidates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  left_patient_id TEXT NOT NULL,
  right_patient_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  opened_by TEXT NOT NULL,
  decided_by TEXT,
  UNIQUE (organization_id, left_patient_id, right_patient_id, reason)
);
CREATE TABLE IF NOT EXISTS patient_merges (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  survivor_id TEXT NOT NULL,
  retired_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  survivor_version INTEGER NOT NULL,
  retired_version INTEGER NOT NULL,
  blocked_resources TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS practitioners (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_type TEXT NOT NULL,
  license_number TEXT,
  license_issuer TEXT,
  verification_state TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  author_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS practitioner_affiliations (
  id TEXT PRIMARY KEY,
  practitioner_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE (practitioner_id, facility_id)
);
CREATE TABLE IF NOT EXISTS practitioner_identity_links (
  id TEXT PRIMARY KEY,
  practitioner_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  UNIQUE (practitioner_id),
  UNIQUE (organization_id, user_id)
);
CREATE TABLE IF NOT EXISTS patient_subject_links (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  UNIQUE (organization_id, subject_kind, subject_id)
);
CREATE TABLE IF NOT EXISTS patient_registration_drafts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  given_name TEXT NOT NULL,
  family_name TEXT NOT NULL,
  preferred_name TEXT,
  birth_date TEXT NOT NULL,
  sex TEXT NOT NULL,
  contact_value TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS master_commands (
  organization_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  response_json TEXT NOT NULL,
  PRIMARY KEY (organization_id, command_key)
);
INSERT OR IGNORE INTO patient_identifiers (id, patient_id, organization_id, facility_id, system, value, status)
SELECT id || ':mrn', id, organization_id, facility_id, 'local-mrn', mrn, 'active' FROM patients;
INSERT OR IGNORE INTO patient_facility_registrations (id, patient_id, organization_id, facility_id, status, version)
SELECT id || ':fac', id, organization_id, facility_id, 'active', 1 FROM patients;
CREATE INDEX IF NOT EXISTS idx_duplicate_candidates_org ON duplicate_candidates(organization_id, status);
`;

const UPGRADE_V39 = `
CREATE TABLE IF NOT EXISTS scheduling_resources (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  capacity INTEGER NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS practitioner_availability (
  id TEXT PRIMARY KEY,
  practitioner_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  weekday INTEGER NOT NULL,
  start_minute INTEGER NOT NULL,
  end_minute INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scheduling_reservations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  practitioner_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS appointment_events (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visit_encounters (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  facility_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL UNIQUE,
  practitioner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  created_by TEXT NOT NULL,
  closed_by TEXT,
  closure_reason TEXT,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visit_encounter_events (
  id TEXT PRIMARY KEY,
  encounter_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedule_commands (
  organization_id TEXT NOT NULL,
  command_key TEXT NOT NULL,
  response_json TEXT NOT NULL,
  PRIMARY KEY (organization_id, command_key)
);
CREATE TABLE IF NOT EXISTS scheduling_notices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scheduling_metrics (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS scheduling_controls (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_practitioner ON scheduling_reservations(practitioner_id, status, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_facility ON appointments(organization_id, facility_id, starts_at);
`;

export function transaction<T>(db: AppDatabase, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function get<T>(db: AppDatabase, sql: string, ...params: Array<string | number | null>): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(db: AppDatabase, sql: string, ...params: Array<string | number | null>): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(db: AppDatabase, sql: string, ...params: Array<string | number | null | Uint8Array>) {
  return db.prepare(sql).run(...params);
}
import { TERMINOLOGY_MAPPING_SCHEMA } from "./terminology-mapping-schema";
import { FACILITY_CATALOG_SCHEMA } from "./facility-catalog-schema";
import { CLINICAL_CODING_SCHEMA } from "./clinical-coding-schema";
