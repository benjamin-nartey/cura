import { createHash } from "node:crypto";
import type { BriefingItem, ChartEncounter, SourceTable, TimelineEvent, TimelineGroup } from "@curasphere/contracts";
import { formatQuantity } from "./catalog";

export function canonicalHash(value: unknown) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function ageInYears(birthDate: string, now = new Date()) {
  const [year, month, day] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - year;
  const nowMonth = now.getUTCMonth() + 1;
  const nowDay = now.getUTCDate();
  if (nowMonth < month || (nowMonth === month && nowDay < day)) age -= 1;
  return age;
}

export function utcDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

type TimelineInput = {
  encounters: { id: string; status: string; reason: string; startedAt: string; authorName: string }[];
  conditions: { id: string; display: string; clinicalStatus: string; recordedAt: string }[];
  allergies: { id: string; display: string; reaction: string; recordedAt: string }[];
  medications: { id: string; display: string; dose: string; status: string; recordedAt: string }[];
  observations: {
    id: string;
    display: string;
    value: number;
    unit: string;
    interpretation: "normal" | "high" | "low";
    effectiveAt: string;
    authorName: string;
  }[];
  appointments: { id: string; reason: string; startsAt: string; status: string }[];
  deviceReadings?: {
    id: string;
    display: string;
    value: number;
    unit: string;
    interpretation: "normal" | "high" | "low";
    effectiveAt: string;
    authorName: string;
  }[];
};

export function projectTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const item of input.encounters) {
    events.push({
      id: `tl-${item.id}`,
      at: item.startedAt,
      kind: "encounter",
      title: `Encounter · ${item.reason}`,
      detail: `${item.status} · recorded by ${item.authorName}`,
      sourceId: item.id,
      sourceTable: "encounters",
      abnormal: false,
    });
  }
  for (const item of input.conditions) {
    events.push({
      id: `tl-${item.id}`,
      at: item.recordedAt,
      kind: "condition",
      title: `Condition · ${item.display}`,
      detail: item.clinicalStatus,
      sourceId: item.id,
      sourceTable: "conditions",
      abnormal: false,
    });
  }
  for (const item of input.allergies) {
    events.push({
      id: `tl-${item.id}`,
      at: item.recordedAt,
      kind: "allergy",
      title: `Allergy recorded · ${item.display}`,
      detail: item.reaction,
      sourceId: item.id,
      sourceTable: "allergies",
      abnormal: false,
    });
  }
  for (const item of input.medications) {
    events.push({
      id: `tl-${item.id}`,
      at: item.recordedAt,
      kind: "medication",
      title: `Medication · ${item.display}`,
      detail: `${item.dose} · ${item.status}`,
      sourceId: item.id,
      sourceTable: "medications",
      abnormal: false,
    });
  }
  for (const item of input.observations) {
    events.push({
      id: `tl-${item.id}`,
      at: item.effectiveAt,
      kind: "observation",
      title: `${item.display} · ${formatQuantity(item.value)} ${item.unit}`,
      detail: `Recorded by ${item.authorName}`,
      sourceId: item.id,
      sourceTable: "observations",
      abnormal: item.interpretation !== "normal",
    });
  }
  for (const item of input.deviceReadings ?? []) {
    events.push({
      id: `tl-${item.id}`,
      at: item.effectiveAt,
      kind: "observation",
      title: `${item.display} · ${formatQuantity(item.value)} ${item.unit}`,
      detail: `Recorded by ${item.authorName}`,
      sourceId: item.id,
      sourceTable: "device_readings",
      abnormal: item.interpretation !== "normal",
    });
  }
  for (const item of input.appointments) {
    events.push({
      id: `tl-${item.id}`,
      at: item.startsAt,
      kind: "appointment",
      title: `Appointment · ${item.reason}`,
      detail: item.status,
      sourceId: item.id,
      sourceTable: "appointments",
      abnormal: false,
    });
  }
  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));
}

const GROUP_KINDS: Record<Exclude<TimelineGroup, "all">, TimelineEvent["kind"]> = {
  results: "observation",
  encounters: "encounter",
  problems: "condition",
  allergies: "allergy",
  medications: "medication",
  visits: "appointment",
};

const GROUPS = new Set(["all", "results", "encounters", "problems", "allergies", "medications", "visits"]);

export function isTimelineGroup(value: string): value is TimelineGroup {
  return GROUPS.has(value);
}

export function filterTimeline(events: TimelineEvent[], group: TimelineGroup) {
  if (group === "all") return events;
  const kind = GROUP_KINDS[group];
  return events.filter((event) => event.kind === kind);
}

export function groupTimelineByDay(events: TimelineEvent[]) {
  const days: { day: string; events: TimelineEvent[] }[] = [];
  for (const event of events) {
    const day = event.at.slice(0, 10);
    const current = days[days.length - 1];
    if (!current || current.day !== day) days.push({ day, events: [event] });
    else current.events.push(event);
  }
  return days;
}

type BriefingInput = {
  encounters: Pick<ChartEncounter, "id" | "status" | "reason" | "startedAt" | "endedAt">[];
  observations: {
    id: string;
    display: string;
    value: number;
    unit: string;
    interpretation: "normal" | "high" | "low";
    thresholdText: string;
    effectiveAt: string;
  }[];
  conditions: { id: string; display: string; clinicalStatus: string; recordedAt: string }[];
};

export function buildBriefing(input: BriefingInput): { since: string | null; items: BriefingItem[] } {
  const finished = input.encounters.filter((item) => item.status === "finished" && item.endedAt);
  const since = finished.reduce<string | null>((latest, item) => {
    if (!item.endedAt) return latest;
    if (!latest || item.endedAt > latest) return item.endedAt;
    return latest;
  }, null);
  const open = input.encounters
    .filter((item) => item.status === "in-progress")
    .map((item) => ({
      at: item.startedAt,
      text: `Open encounter · ${item.reason}`,
      sourceId: item.id,
      sourceTable: "encounters" as SourceTable,
      abnormal: false,
    }));
  if (!since) return { since: null, items: open };
  const sinceMs = Date.parse(since);
  const items: BriefingItem[] = [...open];
  for (const item of input.observations) {
    if (Date.parse(item.effectiveAt) <= sinceMs) continue;
    const flag = item.interpretation === "normal" ? "" : ` · ${item.thresholdText}`;
    items.push({
      at: item.effectiveAt,
      text: `${item.display} · ${formatQuantity(item.value)} ${item.unit}${flag}`,
      sourceId: item.id,
      sourceTable: "observations",
      abnormal: item.interpretation !== "normal",
    });
  }
  for (const item of input.conditions) {
    if (Date.parse(item.recordedAt) <= sinceMs) continue;
    items.push({
      at: item.recordedAt,
      text: `Condition recorded · ${item.display} · ${item.clinicalStatus}`,
      sourceId: item.id,
      sourceTable: "conditions",
      abnormal: false,
    });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return { since, items };
}
