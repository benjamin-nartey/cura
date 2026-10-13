import type { Chart, ChartObservation, DirectoryEntry, Interpretation, PatientSummary, PatientTimeline, PurposeOfUse, Role, SessionContext, Sex, TimelineGroup, WorklistAppointment, WorklistEncounter } from "@curasphere/contracts";

const FOUNDATION_URL = process.env.FOUNDATION_URL ?? "http://127.0.0.1:8081";

export type FoundationHealth = {
  ok: boolean;
  schemaVersion: number | null;
  store: "postgresql";
};

export async function readFoundationHealth(): Promise<FoundationHealth> {
  const down: FoundationHealth = { ok: false, schemaVersion: null, store: "postgresql" };
  try {
    const response = await fetch(`${FOUNDATION_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return down;
    const body = (await response.json()) as Partial<FoundationHealth>;
    if (body.ok !== true || body.store !== "postgresql" || typeof body.schemaVersion !== "number") return down;
    return { ok: true, schemaVersion: body.schemaVersion, store: "postgresql" };
  } catch {
    return down;
  }
}

export async function readFoundationDirectory(): Promise<{
  entries: DirectoryEntry[];
  disabled: boolean;
  unavailable: boolean;
}> {
  try {
    const response = await fetch(`${FOUNDATION_URL}/directory`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 403) return { entries: [], disabled: true, unavailable: false };
    if (!response.ok) return { entries: [], disabled: false, unavailable: true };
    const entries = (await response.json()) as DirectoryEntry[];
    if (!Array.isArray(entries)) return { entries: [], disabled: false, unavailable: true };
    return { entries, disabled: false, unavailable: false };
  } catch {
    return { entries: [], disabled: false, unavailable: true };
  }
}

export async function openFoundationSession(
  userId: string,
): Promise<{ status: "ok"; sessionId: string } | { status: "disabled" } | { status: "unavailable" }> {
  try {
    const response = await fetch(`${FOUNDATION_URL}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 403) return { status: "disabled" };
    if (!response.ok) return { status: "unavailable" };
    const body = (await response.json()) as { sessionId?: string };
    if (!body.sessionId || !body.sessionId.startsWith("ses_")) return { status: "unavailable" };
    return { status: "ok", sessionId: body.sessionId };
  } catch {
    return { status: "unavailable" };
  }
}

const ROLES = new Set<Role>(["clinician", "nurse", "auditor", "admin"]);

function purposeFor(role: Role): PurposeOfUse {
  if (role === "auditor") return "AUDIT";
  if (role === "admin") return "OPERATIONS";
  return "TREATMENT";
}

export async function readFoundationSession(sessionId: string): Promise<SessionContext | null> {
  if (!sessionId.startsWith("ses_")) return null;
  try {
    const response = await fetch(`${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<SessionContext>;
    if (body.sessionId !== sessionId || !body.userId || !body.displayName || !body.organizationId || !body.organizationName) {
      return null;
    }
    if (!body.role || !ROLES.has(body.role) || body.purposeOfUse !== purposeFor(body.role)) return null;
    return {
      sessionId: body.sessionId,
      userId: body.userId,
      displayName: body.displayName,
      role: body.role,
      purposeOfUse: body.purposeOfUse,
      organizationId: body.organizationId,
      organizationName: body.organizationName,
      facilityId: body.facilityId ?? null,
      facilityName: body.facilityName ?? null,
    };
  } catch {
    return null;
  }
}

export async function listFoundationPatients(sessionId: string, query: string): Promise<PatientSummary[] | null> {
  try {
    const url = new URL(`${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients`);
    if (query) url.searchParams.set("q", query);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const body = (await response.json()) as PatientSummary[];
    if (!Array.isArray(body)) return null;
    return body.filter((patient) => patient.id && patient.mrn && patient.givenName && patient.familyName);
  } catch {
    return null;
  }
}

export async function registerFoundationPatient(
  sessionId: string,
  input: { givenName: string; familyName: string; birthDate: string; sex: Sex; idempotencyKey: string },
): Promise<
  | { status: "ok"; patient: { id: string; mrn: string; givenName: string; familyName: string; birthDate: string; sex: Sex } }
  | { status: "invalid" | "forbidden" | "duplicate" | "unavailable" }
> {
  try {
    const response = await fetch(`${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 400) return { status: "invalid" };
    if (response.status === 403) return { status: "forbidden" };
    if (response.status === 409) return { status: "duplicate" };
    if (!response.ok) return { status: "unavailable" };
    const patient = (await response.json()) as {
      id?: string;
      mrn?: string;
      givenName?: string;
      familyName?: string;
      birthDate?: string;
      sex?: Sex;
    };
    if (!patient.id || !patient.mrn || !patient.givenName || !patient.familyName || !patient.birthDate || !patient.sex) {
      return { status: "unavailable" };
    }
    return {
      status: "ok",
      patient: {
        id: patient.id,
        mrn: patient.mrn,
        givenName: patient.givenName,
        familyName: patient.familyName,
        birthDate: patient.birthDate,
        sex: patient.sex,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

async function foundationStatus(response: Response): Promise<"invalid" | "forbidden" | "duplicate" | "open" | "conflict" | "notfound" | "code" | "range" | "unavailable"> {
  if (response.status === 400) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "code" || body?.error === "range") return body.error;
    return "invalid";
  }
  if (response.status === 403) return "forbidden";
  if (response.status === 404) return "notfound";
  if (response.status === 409) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "open" || body?.error === "conflict" || body?.error === "duplicate") return body.error;
  }
  return "unavailable";
}

export async function listFoundationEncounters(sessionId: string): Promise<WorklistEncounter[] | null> {
  try {
    const response = await fetch(`${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/encounters`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as WorklistEncounter[];
    if (!Array.isArray(body)) return null;
    return body.filter((item) => item.id && item.patientId && item.patientName && item.mrn);
  } catch {
    return null;
  }
}

export async function openFoundationEncounter(
  sessionId: string,
  input: { patientId: string; reason: string; idempotencyKey: string },
): Promise<
  | { status: "ok"; encounter: { id: string; patientId: string; reason: string; startedAt: string; version: number } }
  | { status: "invalid" | "forbidden" | "duplicate" | "open" | "conflict" | "notfound" | "code" | "range" | "unavailable" }
> {
  try {
    const response = await fetch(`${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/encounters`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { status: await foundationStatus(response) };
    const encounter = (await response.json()) as { id?: string; patientId?: string; reason?: string; startedAt?: string; version?: number };
    if (!encounter.id || !encounter.patientId || !encounter.reason || !encounter.startedAt || encounter.version !== 1) {
      return { status: "unavailable" };
    }
    return {
      status: "ok",
      encounter: {
        id: encounter.id,
        patientId: encounter.patientId,
        reason: encounter.reason,
        startedAt: encounter.startedAt,
        version: encounter.version,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function finishFoundationEncounter(
  sessionId: string,
  encounterId: string,
  input: { expectedVersion: number; idempotencyKey: string },
): Promise<
  | { status: "ok"; encounter: { id: string; version: number; endedAt: string } }
  | { status: "invalid" | "forbidden" | "duplicate" | "open" | "conflict" | "notfound" | "code" | "range" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/encounters/${encodeURIComponent(encounterId)}/finish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) return { status: await foundationStatus(response) };
    const encounter = (await response.json()) as { id?: string; version?: number; endedAt?: string };
    if (!encounter.id || !encounter.endedAt || encounter.version === undefined || !Number.isInteger(encounter.version)) {
      return { status: "unavailable" };
    }
    return { status: "ok", encounter: { id: encounter.id, version: encounter.version, endedAt: encounter.endedAt } };
  } catch {
    return { status: "unavailable" };
  }
}

const INTERPRETATIONS = new Set<Interpretation>(["normal", "high", "low"]);

export async function listFoundationObservations(sessionId: string, patientId: string): Promise<ChartObservation[] | null> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/observations`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as ChartObservation[];
    if (!Array.isArray(body)) return null;
    return body.filter(
      (item) => item.id && item.code && item.display && Number.isFinite(item.value) && item.unit && INTERPRETATIONS.has(item.interpretation),
    );
  } catch {
    return null;
  }
}

export type FoundationChartCore = Pick<Chart, "conditions" | "allergies" | "medications" | "appointments">;

export async function readFoundationChartCore(sessionId: string, patientId: string): Promise<FoundationChartCore | null> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/core`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<FoundationChartCore>;
    if (!Array.isArray(body.conditions) || !Array.isArray(body.allergies) || !Array.isArray(body.medications) || !Array.isArray(body.appointments)) {
      return null;
    }
    return {
      conditions: body.conditions.filter((item) => item.id && item.display && item.code),
      allergies: body.allergies.filter((item) => item.id && item.display && item.reaction),
      medications: body.medications.filter((item) => item.id && item.display && item.dose),
      appointments: body.appointments.filter((item) => item.id && item.reason && item.startsAt),
    };
  } catch {
    return null;
  }
}

const TIMELINE_GROUPS = new Set<TimelineGroup>(["all", "results", "encounters", "problems", "allergies", "medications", "visits"]);

export async function readFoundationTimeline(sessionId: string, patientId: string, group: string): Promise<PatientTimeline | null> {
  if (!TIMELINE_GROUPS.has(group as TimelineGroup)) return null;
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/timeline?group=${encodeURIComponent(group)}`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<PatientTimeline>;
    if (body.patientId !== patientId || body.group !== group || !Array.isArray(body.events) || !Array.isArray(body.days) || !Array.isArray(body.changes)) {
      return null;
    }
    return body as PatientTimeline;
  } catch {
    return null;
  }
}

export async function listFoundationAppointments(sessionId: string): Promise<WorklistAppointment[] | null> {
  try {
    const response = await fetch(`${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/appointments`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as WorklistAppointment[];
    if (!Array.isArray(body)) return null;
    return body.filter((item) => item.id && item.patientId && item.patientName && item.mrn && item.startsAt);
  } catch {
    return null;
  }
}

export async function recordFoundationObservation(
  sessionId: string,
  patientId: string,
  input: { code: string; value: number; idempotencyKey: string; effectiveAt?: string },
): Promise<
  | {
      status: "ok";
      observation: {
        id: string;
        patientId: string;
        code: string;
        display: string;
        value: number;
        unit: string;
        codeSystem: string;
        codeSystemVersion: string;
        unitSystemVersion: string;
        bindingVersion: string;
        interpretation: Interpretation;
        thresholdText: string;
        effectiveAt: string;
      };
    }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "code" | "range" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/observations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "open" || status === "conflict") return { status: "unavailable" };
      return { status };
    }
    const observation = (await response.json()) as {
      id?: string;
      patientId?: string;
      code?: string;
      display?: string;
      value?: number;
      unit?: string;
      codeSystem?: string;
      codeSystemVersion?: string;
      unitSystemVersion?: string;
      bindingVersion?: string;
      interpretation?: Interpretation;
      thresholdText?: string;
      effectiveAt?: string;
    };
    const value = observation.value;
    if (
      !observation.id ||
      !observation.patientId ||
      !observation.code ||
      !observation.display ||
      value === undefined ||
      !Number.isFinite(value) ||
      !observation.unit ||
      !observation.codeSystem ||
      !observation.codeSystemVersion ||
      !observation.unitSystemVersion ||
      !observation.bindingVersion ||
      !observation.interpretation ||
      !INTERPRETATIONS.has(observation.interpretation) ||
      !observation.thresholdText ||
      !observation.effectiveAt
    ) {
      return { status: "unavailable" };
    }
    return {
      status: "ok",
      observation: {
        id: observation.id,
        patientId: observation.patientId,
        code: observation.code,
        display: observation.display,
        value,
        unit: observation.unit,
        codeSystem: observation.codeSystem,
        codeSystemVersion: observation.codeSystemVersion,
        unitSystemVersion: observation.unitSystemVersion,
        bindingVersion: observation.bindingVersion,
        interpretation: observation.interpretation,
        thresholdText: observation.thresholdText,
        effectiveAt: observation.effectiveAt,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function bookFoundationAppointment(
  sessionId: string,
  input: { patientId: string; reason: string; startsAt: string; endsAt: string; idempotencyKey: string },
): Promise<
  | { status: "ok"; appointment: { id: string; patientId: string; reason: string; status: string; startsAt: string; endsAt: string } }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "conflict" | "unavailable" }
> {
  try {
    const response = await fetch(`${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/appointments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "open" || status === "code" || status === "range") return { status: "invalid" };
      return { status };
    }
    const appointment = (await response.json()) as {
      id?: string;
      patientId?: string;
      reason?: string;
      status?: string;
      startsAt?: string;
      endsAt?: string;
    };
    if (!appointment.id || !appointment.patientId || !appointment.reason || appointment.status !== "booked" || !appointment.startsAt || !appointment.endsAt) {
      return { status: "unavailable" };
    }
    return {
      status: "ok",
      appointment: {
        id: appointment.id,
        patientId: appointment.patientId,
        reason: appointment.reason,
        status: appointment.status,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export type FoundationConditionChoice = { code: string; display: string; codeSystemLabel: string; codeSystemVersion: string };

export async function listFoundationConditionCatalog(sessionId: string): Promise<FoundationConditionChoice[] | null> {
  try {
    const response = await fetch(`${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/condition-catalog`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as FoundationConditionChoice[];
    if (!Array.isArray(body)) return null;
    return body.filter((item) => item.code && item.display && item.codeSystemVersion);
  } catch {
    return null;
  }
}

export async function recordFoundationLabOrder(
  sessionId: string,
  patientId: string,
  input: { code: string; idempotencyKey: string },
): Promise<
  | {
      status: "ok";
      order: { id: string; patientId: string; code: string; display: string; status: "requested"; createdAt: string };
    }
  | ChartWriteFailure
> {
  const recorded = await postChartRow<{ id: string; patientId: string; code: string; display: string; status: "requested"; createdAt: string }>(
    `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/lab-orders`,
    input,
    (row) => {
      if (!row.id || !row.patientId || !row.code || !row.display || row.status !== "requested" || !row.createdAt) return null;
      return {
        id: String(row.id),
        patientId: String(row.patientId),
        code: String(row.code),
        display: String(row.display),
        status: "requested",
        createdAt: String(row.createdAt),
      };
    },
  );
  if (recorded.status !== "ok") return recorded;
  return { status: "ok", order: recorded.value };
}

export async function recordFoundationSpecimen(
  sessionId: string,
  patientId: string,
  orderId: string,
  input: { idempotencyKey: string },
): Promise<
  | { status: "ok"; specimen: { id: string; orderId: string; patientId: string; collectedAt: string } }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "conflict" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/lab-orders/${encodeURIComponent(orderId)}/specimen`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "conflict" || status === "duplicate" || status === "forbidden" || status === "notfound" || status === "invalid") return { status };
      return { status: "unavailable" };
    }
    const row = (await response.json()) as { id?: string; orderId?: string; patientId?: string; collectedAt?: string };
    if (!row.id || row.orderId !== orderId || row.patientId !== patientId || !row.collectedAt) return { status: "unavailable" };
    return { status: "ok", specimen: { id: row.id, orderId, patientId, collectedAt: row.collectedAt } };
  } catch {
    return { status: "unavailable" };
  }
}

export async function recordFoundationLabResult(
  sessionId: string,
  patientId: string,
  orderId: string,
  input: { value: number; observationId: string; idempotencyKey: string },
): Promise<
  | { status: "ok"; result: { id: string; orderId: string; observationId: string; criticalFlag: "none" | "critical-low" | "critical-high"; ruleVersion: string | null; alertId: string | null } }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "conflict" | "code" | "range" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/lab-orders/${encodeURIComponent(orderId)}/result`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "conflict" || status === "duplicate" || status === "forbidden" || status === "notfound" || status === "invalid" || status === "code" || status === "range") {
        return { status };
      }
      return { status: "unavailable" };
    }
    const row = (await response.json()) as {
      id?: string;
      orderId?: string;
      observationId?: string;
      criticalFlag?: string;
      ruleVersion?: string | null;
      alertId?: string | null;
    };
    if (!row.id || row.orderId !== orderId || row.observationId !== input.observationId) return { status: "unavailable" };
    if (row.criticalFlag !== "none" && row.criticalFlag !== "critical-low" && row.criticalFlag !== "critical-high") return { status: "unavailable" };
    const alertId = row.alertId ?? null;
    if (row.criticalFlag === "none" && alertId) return { status: "unavailable" };
    if (row.criticalFlag !== "none" && !alertId) return { status: "unavailable" };
    return {
      status: "ok",
      result: {
        id: row.id,
        orderId,
        observationId: input.observationId,
        criticalFlag: row.criticalFlag,
        ruleVersion: row.ruleVersion ?? null,
        alertId,
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function acknowledgeFoundationLabAlert(
  sessionId: string,
  patientId: string,
  orderId: string,
  input: { idempotencyKey: string },
): Promise<
  | { status: "ok"; alert: { id: string; resultId: string; orderId: string; patientId: string; criticalFlag: "critical-low" | "critical-high"; status: "acknowledged" } }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "conflict" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/lab-orders/${encodeURIComponent(orderId)}/alert/acknowledge`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "conflict" || status === "duplicate" || status === "forbidden" || status === "notfound" || status === "invalid") return { status };
      return { status: "unavailable" };
    }
    const row = (await response.json()) as { id?: string; resultId?: string; orderId?: string; patientId?: string; criticalFlag?: string; status?: string };
    if (!row.id || !row.resultId || row.orderId !== orderId || row.patientId !== patientId || row.status !== "acknowledged") return { status: "unavailable" };
    if (row.criticalFlag !== "critical-low" && row.criticalFlag !== "critical-high") return { status: "unavailable" };
    return {
      status: "ok",
      alert: { id: row.id, resultId: row.resultId, orderId, patientId, criticalFlag: row.criticalFlag, status: "acknowledged" },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function proposeFoundationPrescription(
  sessionId: string,
  patientId: string,
  input: { formularyId: string; dose: string; idempotencyKey: string },
): Promise<
  | {
      status: "ok";
      order: {
        id: string;
        patientId: string;
        formularyId: string;
        display: string;
        dose: string;
        status: "proposed";
        warnings: { id: string; kind: string; severity: string; ruleId: string }[];
      };
    }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "conflict" | "code" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/prescriptions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "conflict" || status === "duplicate" || status === "forbidden" || status === "notfound" || status === "invalid" || status === "code") {
        return { status };
      }
      return { status: "unavailable" };
    }
    const row = (await response.json()) as {
      id?: string;
      patientId?: string;
      formularyId?: string;
      display?: string;
      dose?: string;
      status?: string;
      warnings?: { id?: string; kind?: string; severity?: string; ruleId?: string }[];
    };
    const warnings = Array.isArray(row.warnings) ? row.warnings : null;
    if (!row.id || row.patientId !== patientId || row.formularyId !== input.formularyId || !row.display || !row.dose || row.status !== "proposed" || !warnings) {
      return { status: "unavailable" };
    }
    if (warnings.some((item) => !item.id || !item.kind || !item.severity || !item.ruleId)) return { status: "unavailable" };
    return {
      status: "ok",
      order: {
        id: row.id,
        patientId,
        formularyId: input.formularyId,
        display: row.display,
        dose: row.dose,
        status: "proposed",
        warnings: warnings.map((item) => ({
          id: String(item.id),
          kind: String(item.kind),
          severity: String(item.severity),
          ruleId: String(item.ruleId),
        })),
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}

export async function recordFoundationPrescription(
  sessionId: string,
  patientId: string,
  orderId: string,
  input: { medicationId: string; idempotencyKey: string },
): Promise<
  | { status: "ok"; order: { id: string; patientId: string; medicationId: string; status: "active" } }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "conflict" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/prescriptions/${encodeURIComponent(orderId)}/record`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "conflict" || status === "duplicate" || status === "forbidden" || status === "notfound" || status === "invalid") return { status };
      return { status: "unavailable" };
    }
    const row = (await response.json()) as { id?: string; patientId?: string; medicationId?: string; status?: string };
    if (row.id !== orderId || row.patientId !== patientId || row.medicationId !== input.medicationId || row.status !== "active") return { status: "unavailable" };
    return { status: "ok", order: { id: orderId, patientId, medicationId: input.medicationId, status: "active" } };
  } catch {
    return { status: "unavailable" };
  }
}

export async function dispenseFoundationPrescription(
  sessionId: string,
  patientId: string,
  orderId: string,
  input: { quantity: number; idempotencyKey: string },
): Promise<
  | { status: "ok"; dispense: { id: string; orderId: string; patientId: string; quantity: number } }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "conflict" | "range" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/prescriptions/${encodeURIComponent(orderId)}/dispenses`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "conflict" || status === "duplicate" || status === "forbidden" || status === "notfound" || status === "invalid" || status === "range") {
        return { status };
      }
      return { status: "unavailable" };
    }
    const row = (await response.json()) as { id?: string; orderId?: string; patientId?: string; quantity?: number };
    if (!row.id || row.orderId !== orderId || row.patientId !== patientId || row.quantity !== input.quantity) return { status: "unavailable" };
    return { status: "ok", dispense: { id: row.id, orderId, patientId, quantity: input.quantity } };
  } catch {
    return { status: "unavailable" };
  }
}

export async function administerFoundationPrescription(
  sessionId: string,
  patientId: string,
  orderId: string,
  input: { idempotencyKey: string },
): Promise<
  | { status: "ok"; administration: { id: string; orderId: string; patientId: string } }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "conflict" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/prescriptions/${encodeURIComponent(orderId)}/administrations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "conflict" || status === "duplicate" || status === "forbidden" || status === "notfound" || status === "invalid") return { status };
      return { status: "unavailable" };
    }
    const row = (await response.json()) as { id?: string; orderId?: string; patientId?: string };
    if (!row.id || row.orderId !== orderId || row.patientId !== patientId) return { status: "unavailable" };
    return { status: "ok", administration: { id: row.id, orderId, patientId } };
  } catch {
    return { status: "unavailable" };
  }
}

export async function acknowledgeFoundationWarning(
  sessionId: string,
  patientId: string,
  orderId: string,
  warningId: string,
  input: { idempotencyKey: string },
): Promise<
  | { status: "ok"; warning: { id: string; orderId: string; patientId: string; severity: "high" | "moderate"; status: "acknowledged" } }
  | { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "conflict" | "unavailable" }
> {
  try {
    const response = await fetch(
      `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/prescriptions/${encodeURIComponent(orderId)}/warnings/${encodeURIComponent(warningId)}/acknowledge`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "conflict" || status === "duplicate" || status === "forbidden" || status === "notfound" || status === "invalid") return { status };
      return { status: "unavailable" };
    }
    const row = (await response.json()) as { id?: string; orderId?: string; patientId?: string; severity?: string; status?: string };
    if (row.id !== warningId || row.orderId !== orderId || row.patientId !== patientId || row.status !== "acknowledged") return { status: "unavailable" };
    if (row.severity !== "high" && row.severity !== "moderate") return { status: "unavailable" };
    return { status: "ok", warning: { id: warningId, orderId, patientId, severity: row.severity, status: "acknowledged" } };
  } catch {
    return { status: "unavailable" };
  }
}

export async function recordFoundationCondition(
  sessionId: string,
  patientId: string,
  input: { code: string; idempotencyKey: string },
): Promise<{ status: "ok"; condition: RecordedChartCondition } | ChartWriteFailure> {
  const recorded = await postChartRow<RecordedChartCondition>(
    `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/conditions`,
    input,
    (row) => {
      if (!row.id || !row.patientId || !row.code || !row.display || !row.codeSystem || !row.codeSystemVersion || row.clinicalStatus !== "active" || !row.recordedAt) return null;
      return {
        id: String(row.id),
        patientId: String(row.patientId),
        code: String(row.code),
        display: String(row.display),
        codeSystem: String(row.codeSystem),
        codeSystemVersion: String(row.codeSystemVersion),
        clinicalStatus: "active",
        recordedAt: String(row.recordedAt),
      };
    },
  );
  if (recorded.status !== "ok") return recorded;
  return { status: "ok", condition: recorded.value };
}

export async function recordFoundationAllergy(
  sessionId: string,
  patientId: string,
  input: { display: string; reaction: string; criticality: string; idempotencyKey: string },
): Promise<{ status: "ok"; allergy: RecordedChartAllergy } | ChartWriteFailure> {
  const recorded = await postChartRow<RecordedChartAllergy>(
    `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/allergies`,
    input,
    (row) => {
      if (!row.id || !row.patientId || !row.display || !row.reaction || (row.criticality !== "low" && row.criticality !== "high") || !row.recordedAt) return null;
      return {
        id: String(row.id),
        patientId: String(row.patientId),
        display: String(row.display),
        reaction: String(row.reaction),
        criticality: row.criticality,
        recordedAt: String(row.recordedAt),
      };
    },
  );
  if (recorded.status !== "ok") return recorded;
  return { status: "ok", allergy: recorded.value };
}

export async function recordFoundationMedication(
  sessionId: string,
  patientId: string,
  input: { display: string; dose: string; idempotencyKey: string },
): Promise<{ status: "ok"; medication: { id: string } } | ChartWriteFailure> {
  const recorded = await postChartRow<{ id: string }>(
    `${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/patients/${encodeURIComponent(patientId)}/medications`,
    input,
    (row) => {
      if (!row.id || row.status !== "active") return null;
      return { id: String(row.id) };
    },
  );
  if (recorded.status !== "ok") return recorded;
  return { status: "ok", medication: recorded.value };
}

type ChartWriteFailure = { status: "invalid" | "forbidden" | "duplicate" | "notfound" | "code" | "unavailable" };

type RecordedChartCondition = {
  id: string;
  patientId: string;
  code: string;
  display: string;
  codeSystem: string;
  codeSystemVersion: string;
  clinicalStatus: "active";
  recordedAt: string;
};

type RecordedChartAllergy = {
  id: string;
  patientId: string;
  display: string;
  reaction: string;
  criticality: "low" | "high";
  recordedAt: string;
};

async function postChartRow<T>(
  url: string,
  input: object,
  accept: (row: Record<string, unknown>) => T | null,
): Promise<{ status: "ok"; value: T } | ChartWriteFailure> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      const status = await foundationStatus(response);
      if (status === "open" || status === "conflict" || status === "range") return { status: "invalid" };
      return { status };
    }
    const row = (await response.json()) as Record<string, unknown>;
    const value = accept(row);
    if (!value) return { status: "unavailable" };
    return { status: "ok", value };
  } catch {
    return { status: "unavailable" };
  }
}

export async function endFoundationSession(sessionId: string) {
  try {
    await fetch(`${FOUNDATION_URL}/sessions/${encodeURIComponent(sessionId)}/end`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    return;
  }
}
