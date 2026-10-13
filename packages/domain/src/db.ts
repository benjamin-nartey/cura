import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  jurisdiction TEXT
);
CREATE TABLE facilities (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  facility_id TEXT REFERENCES facilities(id),
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('clinician','nurse','auditor','admin'))
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
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
`;

export type AppDatabase = DatabaseSync;

type Cache = { path: string; db: AppDatabase };

export function createDatabase(filename: string): AppDatabase {
  if (filename !== ":memory:") {
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  }
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
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

function migrate(db: AppDatabase) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)");
  const row = db.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as
    | { version: number }
    | undefined;
  if (!row) {
    db.exec("BEGIN");
    try {
      db.exec(SCHEMA);
      db.prepare("INSERT INTO schema_migrations (version) VALUES (26)").run();
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return;
  }
  if (row.version === 26) return;
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
