export type Role = "clinician" | "nurse" | "auditor" | "admin" | "patient";
export type PurposeOfUse = "TREATMENT" | "OPERATIONS" | "AUDIT" | "PATIENT";
export type Sex = "female" | "male" | "other" | "unknown";
export type Interpretation = "normal" | "high" | "low";

export type SessionContext = {
  sessionId: string;
  userId: string;
  displayName: string;
  role: Role;
  purposeOfUse: PurposeOfUse;
  organizationId: string;
  organizationName: string;
  facilityId: string | null;
  facilityName: string | null;
};

export type DirectoryEntry = {
  userId: string;
  displayName: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  facilityId: string | null;
  facilityName: string | null;
};

export type PatientSummary = {
  id: string;
  mrn: string;
  givenName: string;
  familyName: string;
  birthDate: string;
  sex: Sex;
  ageYears: number;
};

export type WorklistAppointment = {
  id: string;
  patientId: string;
  patientName: string;
  mrn: string;
  reason: string;
  startsAt: string;
  status: string;
};

export type WorklistEncounter = {
  id: string;
  patientId: string;
  patientName: string;
  mrn: string;
  reason: string;
  startedAt: string;
  version: number;
};

export type Worklist = {
  date: string;
  appointments: WorklistAppointment[];
  openEncounters: WorklistEncounter[];
};

export type ChartObservation = {
  id: string;
  code: string;
  display: string;
  value: number;
  unit: string;
  codeSystemLabel: string;
  codeSystemVersion: string;
  unitSystemVersion: string;
  bindingVersion: string;
  interpretation: Interpretation;
  thresholdText: string;
  effectiveAt: string;
  authorName: string;
  encounterId: string | null;
};

export type FacilityObservationChoice = {
  code: string;
  display: string;
  unit: string;
};

export type ChartEncounter = {
  id: string;
  status: "in-progress" | "finished" | "cancelled";
  reason: string;
  startedAt: string;
  endedAt: string | null;
  version: number;
  authorName: string;
};

export type SourceTable =
  | "encounters"
  | "conditions"
  | "allergies"
  | "medications"
  | "observations"
  | "appointments"
  | "device_readings";

export type TimelineEvent = {
  id: string;
  at: string;
  kind: "encounter" | "condition" | "allergy" | "medication" | "observation" | "appointment";
  title: string;
  detail: string;
  sourceId: string;
  sourceTable: SourceTable;
  abnormal: boolean;
};

export type TimelineGroup = "all" | "results" | "encounters" | "problems" | "allergies" | "medications" | "visits";

export type TimelineDay = {
  day: string;
  events: TimelineEvent[];
};

export type BriefingItem = {
  at: string;
  text: string;
  sourceId: string;
  sourceTable: SourceTable;
  abnormal: boolean;
};

export type PatientTimeline = {
  patientId: string;
  group: TimelineGroup;
  projectedAt: string;
  since: string | null;
  events: TimelineEvent[];
  days: TimelineDay[];
  changes: BriefingItem[];
};

export type Chart = {
  patient: {
    id: string;
    mrn: string;
    givenName: string;
    familyName: string;
    birthDate: string;
    sex: Sex;
    ageYears: number;
    version: number;
    confidentiality: string;
    retentionClass: string;
    recordedAt: string;
  };
  allergies: { id: string; display: string; reaction: string; criticality: string }[];
  conditions: {
    id: string;
    display: string;
    code: string;
    codeSystemLabel: string;
    codeSystemVersion: string;
    clinicalStatus: string;
    recordedAt: string;
  }[];
  medications: { id: string; display: string; dose: string; status: string }[];
  observations: ChartObservation[];
  encounters: ChartEncounter[];
  timeline: TimelineEvent[];
  briefing: { since: string | null; items: BriefingItem[] };
  appointments: { id: string; reason: string; startsAt: string; status: string }[];
};

export type AuditEntry = {
  id: string;
  createdAt: string;
  actorName: string;
  purposeOfUse: PurposeOfUse;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
};

export type NewPatientInput = {
  givenName: string;
  familyName: string;
  birthDate: string;
  sex: Sex;
  idempotencyKey: string;
};

export type NewEncounterInput = {
  patientId: string;
  reason: string;
  idempotencyKey: string;
};

export type CompleteEncounterInput = {
  encounterId: string;
  expectedVersion: number;
  idempotencyKey: string;
};

export type NewObservationInput = {
  patientId: string;
  code: string;
  value: number;
  idempotencyKey: string;
  observationId?: string;
};

export type PatientStateItem = {
  sourceId: string;
  sourceTable: SourceTable;
  text: string;
};

export type PatientStateConflict = {
  kind: "duplicate-result" | "duplicate-problem";
  code: string;
  text: string;
  sources: { sourceId: string; sourceTable: SourceTable }[];
};

export type PatientStateBody = {
  problems: PatientStateItem[];
  medications: PatientStateItem[];
  allergies: PatientStateItem[];
  recentResults: PatientStateItem[];
  conflicts: PatientStateConflict[];
  careGaps: PatientStateItem[];
  pending: PatientStateItem[];
  riskSignals: { slot: "deterioration"; status: "unfilled"; text: string }[];
};

export type PatientStateView = {
  patientId: string;
  built: boolean;
  version: number | null;
  builtAt: string | null;
  sourceHash: string | null;
  currentSourceHash: string;
  stale: boolean;
  state: PatientStateBody | null;
};

export type EvidenceState = "supported" | "insufficient" | "invalidated";

export type EvidenceClaim = {
  id: string;
  text: string;
  evidenceState: EvidenceState;
  citations: { sourceTable: SourceTable; sourceId: string; label: string }[];
};

export type EvidenceView = {
  patientId: string;
  claims: EvidenceClaim[];
};
