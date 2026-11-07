import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { clock, color, dayLabel, firstName, greeting, isoDay, lift, shadow, shiftDay, submissionKey } from "./theme";
import { Avatar, Banner, Button, Card, Empty, Field, Icon, IconBadge, Orbs, Pill, Section, type IconName } from "./ui";

type Person = { userId: string; displayName: string; role: string; organizationName: string; facilityName: string | null };
type Patient = { id: string; mrn: string; givenName: string; familyName: string; ageYears: number };
type Appointment = { id: string; patientId: string; patientName: string; mrn: string; reason: string; startsAt: string };
type CatalogItem = { code: string; display: string; unit: string };
type ProblemChoice = { code: string; display: string; codeSystemVersion: string };
type Condition = { id: string; display: string; code: string; clinicalStatus: string };
type Allergy = { id: string; display: string; reaction: string };
type Medication = { id: string; display: string; dose: string };
type Observation = { id: string; code: string; display: string; value: number; unit: string; interpretation: string };
type OpenEncounter = { id: string; patientId: string; patientName: string; mrn: string; reason: string; startedAt: string; version: number };
type TimelineEvent = { id: string; at: string; kind: string; title: string; detail: string; sourceId: string; sourceTable: string; abnormal: boolean };
type ChartTimeline = { since: string | null; days: { day: string; events: TimelineEvent[] }[]; changes: { text: string; sourceId: string; abnormal: boolean }[] };

const TIMELINE_GROUPS = [
  ["all", "All"],
  ["results", "Results"],
  ["encounters", "Encounters"],
  ["problems", "Problems"],
  ["allergies", "Allergies"],
  ["medications", "Medicines"],
  ["visits", "Visits"],
] as const;
type Session = { sessionId: string; displayName: string; facilityName: string | null; role: string };

const CLINIC_ERRORS: { [code: string]: string } = {
  open: "This chart already has an open encounter.",
  conflict: "That encounter changed. Open the chart again.",
  forbidden: "This role cannot do that at this facility.",
  invalid: "Check what you entered and try again.",
  range: "That result is outside the accepted entry range.",
  code: "That code is not on this facility catalog.",
  notfound: "That record is not at this facility.",
  signin: "Your session ended. Sign in again.",
  duplicate: "That submission was already used for a different request.",
};

class ServiceError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const ROLE_ICON: { [role: string]: IconName } = {
  clinician: "stethoscope",
  nurse: "needle",
  admin: "shield-account-outline",
  auditor: "clipboard-search-outline",
};

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ServiceError("offline");
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new ServiceError(payload?.error ?? "invalid");
  return payload as T;
}

function clinicError(problem: unknown, fallback: string) {
  if (!(problem instanceof ServiceError)) return fallback;
  if (problem.code === "offline") return fallback;
  return CLINIC_ERRORS[problem.code] ?? fallback;
}

function tone(interpretation: string) {
  const text = interpretation.toLowerCase();
  if (text.includes("high") || text.includes("critical")) return { tint: color.danger, wash: color.dangerSoft };
  if (text.includes("low")) return { tint: color.accent, wash: color.accentSoft };
  return { tint: color.success, wash: color.successSoft };
}

export function ClinicApp({ root, onExit }: { root: string; onExit: () => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [day, setDay] = useState(isoDay(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [encounters, setEncounters] = useState<OpenEncounter[]>([]);
  const [timeline, setTimeline] = useState<ChartTimeline | null>(null);
  const [timelineGroup, setTimelineGroup] = useState<(typeof TIMELINE_GROUPS)[number][0]>("all");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [problems, setProblems] = useState<ProblemChoice[]>([]);
  const [code, setCode] = useState("");
  const [problemCode, setProblemCode] = useState("");
  const [substance, setSubstance] = useState("");
  const [reaction, setReaction] = useState("");
  const [criticality, setCriticality] = useState<"low" | "high">("low");
  const [value, setValue] = useState("");
  const [encounterReason, setEncounterReason] = useState("");
  const [visitReason, setVisitReason] = useState("");
  const [visitStart, setVisitStart] = useState("");
  const [visitEnd, setVisitEnd] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<"female" | "male" | "other" | "unknown">("female");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [lane, setLane] = useState<"visits" | "patients">("visits");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();

  async function loadDirectory() {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      setPeople(await readJson<Person[]>(`${root}/directory`));
    } catch {
      setPeople(null);
      setError(`The clinic service is not reachable at ${root}. It runs on this computer at port 8081.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDirectory();
    // Reload the directory when its server address changes.
  }, [root]);

  async function loadVisits(sessionId: string, onDay: string) {
    setAppointments(await readJson<Appointment[]>(`${root}/sessions/${sessionId}/appointments?day=${onDay}`));
  }

  async function loadEncounters(sessionId: string) {
    setEncounters(await readJson<OpenEncounter[]>(`${root}/sessions/${sessionId}/encounters`));
  }

  async function signIn(person: Person) {
    setError(null);
    try {
      const opened = await readJson<{ sessionId: string }>(`${root}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: person.userId }),
      });
      const next = { sessionId: opened.sessionId, displayName: person.displayName, facilityName: person.facilityName, role: person.role };
      const [roster, pins, choices] = await Promise.all([
        readJson<Patient[]>(`${root}/sessions/${next.sessionId}/patients`),
        readJson<CatalogItem[]>(`${root}/sessions/${next.sessionId}/catalog`),
        readJson<ProblemChoice[]>(`${root}/sessions/${next.sessionId}/condition-catalog`),
        loadVisits(next.sessionId, day),
        loadEncounters(next.sessionId),
      ]);
      setSession(next);
      setPatient(null);
      setQuery("");
      setPatients(roster);
      setCatalog(pins);
      setProblems(choices);
      setCode(pins[0]?.code ?? "");
      setProblemCode(choices[0]?.code ?? "");
    } catch (problem) {
      setError(problem instanceof ServiceError && problem.code === "offline" ? `The clinic service is not reachable at ${root}. It runs on this computer at port 8081.` : "This directory entry cannot read charts at a facility.");
    }
  }

  async function signOut() {
    if (session) await readJson(`${root}/sessions/${session.sessionId}/end`, { method: "POST" }).catch(() => null);
    setSession(null);
    setPatient(null);
    setQuery("");
    setEncounters([]);
    loadDirectory();
  }

  async function moveDay(by: number) {
    if (!session) return;
    const next = shiftDay(day, by);
    setDay(next);
    try {
      await loadVisits(session.sessionId, next);
    } catch {
      setError("The visit board could not be loaded.");
    }
  }

  async function openChart(item: Patient) {
    if (!session) return;
    setError(null);
    setNotice(null);
    setPatient(item);
    try {
      const [core, results] = await Promise.all([
        readJson<{ conditions: Condition[]; allergies: Allergy[]; medications: Medication[] }>(`${root}/sessions/${session.sessionId}/patients/${item.id}/core`),
        readJson<Observation[]>(`${root}/sessions/${session.sessionId}/patients/${item.id}/observations`),
      ]);
      setConditions(core.conditions);
      setAllergies(core.allergies);
      setMedications(core.medications);
      setObservations(results);
      setTimelineGroup("all");
      setTimeline(await readJson<ChartTimeline>(`${root}/sessions/${session.sessionId}/patients/${item.id}/timeline`));
    } catch {
      setError("This chart could not be read.");
    }
  }

  async function showTimeline(group: (typeof TIMELINE_GROUPS)[number][0]) {
    if (!session || !patient) return;
    setTimelineGroup(group);
    try {
      setTimeline(await readJson<ChartTimeline>(`${root}/sessions/${session.sessionId}/patients/${patient.id}/timeline?group=${group}`));
    } catch (problem) {
      setError(clinicError(problem, "The timeline could not be read."));
    }
  }

  async function record() {
    if (!session || !patient || !code) return;
    const numeric = Number(value);
    if (!value.trim() || !Number.isFinite(numeric)) {
      setError("Enter a numeric result.");
      return;
    }
    setError(null);
    try {
      const response = await fetch(`${root}/sessions/${session.sessionId}/patients/${patient.id}/observations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, value: numeric, idempotencyKey: submissionKey("mob") }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error === "range" ? "That result is outside the accepted entry range." : "The result was not stored.");
        return;
      }
      setValue("");
      setNotice("Result added to the source record.");
      await openChart(patient);
      await loadEncounters(session.sessionId);
    } catch (problem) {
      setError(clinicError(problem, "The result was not stored."));
    }
  }

  async function startEncounter() {
    if (!session || !patient) return;
    setBusy("encounter");
    setError(null);
    setNotice(null);
    try {
      await readJson(`${root}/sessions/${session.sessionId}/encounters`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patientId: patient.id, reason: encounterReason, idempotencyKey: submissionKey("enc") }),
      });
      setEncounterReason("");
      setNotice("Encounter opened on this chart.");
      await loadEncounters(session.sessionId);
    } catch (problem) {
      setError(clinicError(problem, "The encounter was not opened."));
    } finally {
      setBusy(null);
    }
  }

  async function finishEncounter(item: OpenEncounter) {
    if (!session) return;
    setBusy("finish");
    setError(null);
    setNotice(null);
    try {
      await readJson(`${root}/sessions/${session.sessionId}/encounters/${item.id}/finish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: item.version, idempotencyKey: submissionKey("fin") }),
      });
      setNotice("Encounter marked finished. The end time is stored. This does not direct care.");
      await loadEncounters(session.sessionId);
    } catch (problem) {
      setError(clinicError(problem, "The encounter was not finished."));
    } finally {
      setBusy(null);
    }
  }

  async function bookVisit() {
    if (!session || !patient) return;
    const startsAt = visitStart.trim();
    const endsAt = visitEnd.trim();
    if (!startsAt.endsWith("Z") || !endsAt.endsWith("Z") || !(Date.parse(endsAt) > Date.parse(startsAt))) {
      setError("Enter a start and an end in UTC, with the end after the start. Example: 2026-10-20T15:00:00.000Z");
      return;
    }
    setBusy("book");
    setError(null);
    setNotice(null);
    try {
      const booked = await readJson<{ startsAt: string }>(`${root}/sessions/${session.sessionId}/appointments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          patientId: patient.id,
          reason: visitReason,
          startsAt,
          endsAt,
          idempotencyKey: submissionKey("apt"),
        }),
      });
      const bookedDay = booked.startsAt.slice(0, 10);
      setVisitReason("");
      setVisitStart("");
      setVisitEnd("");
      setDay(bookedDay);
      await loadVisits(session.sessionId, bookedDay);
      await openChart(patient);
      setNotice("Visit booked on this facility record. Nothing was billed.");
    } catch (problem) {
      setError(clinicError(problem, "The visit was not booked."));
    } finally {
      setBusy(null);
    }
  }

  async function addProblem() {
    if (!session || !patient || !problemCode) return;
    setBusy("problem");
    setError(null);
    setNotice(null);
    try {
      await readJson(`${root}/sessions/${session.sessionId}/patients/${patient.id}/conditions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: problemCode, idempotencyKey: submissionKey("con") }),
      });
      await openChart(patient);
      setNotice("Problem added from the facility catalog. This does not diagnose.");
    } catch (problem) {
      setError(clinicError(problem, "The problem was not stored."));
    } finally {
      setBusy(null);
    }
  }

  async function addAllergy() {
    if (!session || !patient) return;
    setBusy("allergy");
    setError(null);
    setNotice(null);
    try {
      await readJson(`${root}/sessions/${session.sessionId}/patients/${patient.id}/allergies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display: substance,
          reaction,
          criticality,
          idempotencyKey: submissionKey("all"),
        }),
      });
      setSubstance("");
      setReaction("");
      await openChart(patient);
      setNotice("Allergy stored as entered. Nothing was graded beyond the criticality selected.");
    } catch (problem) {
      setError(clinicError(problem, "The allergy was not stored."));
    } finally {
      setBusy(null);
    }
  }

  async function registerPatient() {
    if (!session) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) {
      setError("Enter the date of birth as YYYY-MM-DD.");
      return;
    }
    setBusy("register");
    setError(null);
    setNotice(null);
    try {
      const created = await readJson<Patient>(`${root}/sessions/${session.sessionId}/patients`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          givenName,
          familyName,
          birthDate: birthDate.trim(),
          sex,
          idempotencyKey: submissionKey("reg"),
        }),
      });
      const roster = await readJson<Patient[]>(`${root}/sessions/${session.sessionId}/patients`);
      setPatients(roster);
      setGivenName("");
      setFamilyName("");
      setBirthDate("");
      setNotice(`${created.givenName} ${created.familyName} is on this facility record. MRN ${created.mrn}.`);
      await openChart(created);
    } catch (problem) {
      setError(clinicError(problem, "The patient was not registered."));
    } finally {
      setBusy(null);
    }
  }

  const latest = new Map<string, Observation>();
  for (const item of observations) {
    if (!latest.has(item.code)) latest.set(item.code, item);
  }
  const visitCards = appointments.filter((item) => `${item.patientName} ${item.mrn} ${item.reason}`.toLowerCase().includes(needle));
  const roster = patients.filter((item) => `${item.givenName} ${item.familyName} ${item.mrn}`.toLowerCase().includes(needle));
  const today = isoDay(new Date());

  if (!session) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.signTop}>
          <Orbs />
          <Pressable onPress={onExit} style={styles.ghostBack} hitSlop={8}>
            <Icon name="chevron-left" size={24} tint="#ffffff" />
          </Pressable>
          <Text style={styles.signTitle}>Open a{"\n"}clinic day</Text>
          <Text style={styles.signLede}>Sign in with your clinic role. Your facility comes from the directory.</Text>
        </View>
        <ScrollView contentContainerStyle={styles.signBody}>
          {error ? <Banner tone="error" text={error} /> : null}
          {loading ? <ActivityIndicator color={color.accent} style={styles.spinner} /> : null}
          {(people ?? []).map((person) => (
            <Card key={person.userId} style={styles.row} onPress={() => signIn(person)}>
              <Avatar name={person.displayName} tint={color.accent} wash={color.accentSoft} />
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{person.displayName}</Text>
                <View style={styles.inline}>
                  <Icon name={ROLE_ICON[person.role] ?? "account-outline"} size={14} tint={color.faint} />
                  <Text style={styles.meta}>
                    {person.role} · {person.facilityName ?? person.organizationName}
                  </Text>
                </View>
              </View>
              <Icon name="chevron-right" size={22} tint={color.faint} />
            </Card>
          ))}
          {error ? <Button label="Try again" icon="refresh" tone="quiet" onPress={loadDirectory} /> : null}
        </ScrollView>
      </View>
    );
  }

  if (patient) {
    const fullName = `${patient.givenName} ${patient.familyName}`;
    const open = encounters.find((item) => item.patientId === patient.id) ?? null;
    return (
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <StatusBar style="light" />
        <ScrollView contentContainerStyle={styles.chartContent} keyboardShouldPersistTaps="handled">
          <View style={styles.chartTop}>
            <Orbs />
            <View style={styles.chartBar}>
              <Pressable onPress={() => setPatient(null)} style={styles.ghostBack} hitSlop={8}>
                <Icon name="chevron-left" size={24} tint="#ffffff" />
              </Pressable>
              <Text style={styles.chartBarText}>Chart</Text>
              <View style={styles.ghostSpacer} />
            </View>
            <View style={styles.chartHead}>
              <Avatar name={fullName} size={72} tint={color.ink} wash="#ffffff" />
              <View style={styles.flex}>
                <Text style={styles.chartName}>{fullName}</Text>
                <Text style={styles.chartMeta}>
                  {patient.mrn} · {patient.ageYears} years
                </Text>
                <Text style={styles.chartMeta}>{session.facilityName}</Text>
              </View>
            </View>
          </View>
          <View style={styles.pad}>
            {error ? <Banner tone="error" text={error} /> : null}
            {notice ? <Banner tone="notice" text={notice} /> : null}
            <Section title="Encounter" />
            {open ? (
              <Card>
                <View style={styles.row}>
                  <IconBadge name="stethoscope" tint={color.accent} wash={color.accentSoft} size={42} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{open.reason}</Text>
                    <Text style={styles.meta}>
                      Open · {clock(open.startedAt)} UTC · version {open.version}
                    </Text>
                  </View>
                </View>
                <Button label="Mark finished" icon="check" tone="dark" busy={busy === "finish"} onPress={() => finishEncounter(open)} />
              </Card>
            ) : (
              <Card>
                <Text style={styles.meta}>Opening an encounter stores the reason and the start time. It does not direct care.</Text>
                <Field icon="text-box-outline" value={encounterReason} onChangeText={setEncounterReason} placeholder="Reason for the visit" maxLength={200} />
                <Button label="Open encounter" icon="plus" busy={busy === "encounter"} onPress={startEncounter} />
              </Card>
            )}
            <Section title="Timeline" />
            <Text style={styles.meta}>Every line is a source row. A group only hides other rows. Nothing here is generated.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {TIMELINE_GROUPS.map(([id, label]) => {
                const on = timelineGroup === id;
                return (
                  <Pressable key={id} style={[styles.chip, on ? styles.chipOn : null]} onPress={() => showTimeline(id)}>
                    <Text style={on ? styles.chipOnText : styles.chipText}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {timeline && timeline.changes.length > 0 ? (
              <Card style={styles.noteCard}>
                <Text style={styles.rowTitle}>Since the last finished encounter</Text>
                <Text style={styles.meta}>{timeline.since ? `Compared with ${dayLabel(timeline.since)}. This note does not direct care.` : "No finished encounter yet."}</Text>
                {timeline.changes.map((item) => (
                  <Text key={`${item.sourceId}-${item.text}`} style={styles.changeLine}>
                    {item.text}
                  </Text>
                ))}
              </Card>
            ) : null}
            {(timeline?.days ?? []).length === 0 ? <Empty icon="timeline-clock-outline" text="No source rows in this group." /> : null}
            {(timeline?.days ?? []).map((day) => (
              <View key={day.day}>
                <Text style={styles.dayLabel}>{dayLabel(`${day.day}T12:00:00.000Z`)}</Text>
                {day.events.map((event) => (
                  <Card key={event.id} style={[styles.row, event.abnormal ? styles.abnormal : null]}>
                    <IconBadge name={event.abnormal ? "alert-circle-outline" : "source-branch"} tint={event.abnormal ? color.danger : color.accent} wash={event.abnormal ? color.dangerSoft : color.accentSoft} size={40} />
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>{event.title}</Text>
                      <Text style={styles.meta}>
                        {clock(event.at)} UTC · {event.detail}
                      </Text>
                      <Text style={styles.provenance}>
                        {event.sourceTable} · {event.sourceId}
                      </Text>
                    </View>
                  </Card>
                ))}
              </View>
            ))}
            <View style={styles.stats}>
              <Stat icon="clipboard-pulse-outline" value={conditions.length} label="Problems" tint={color.violet} wash={color.violetSoft} />
              <Stat icon="pill" value={medications.length} label="Medicines" tint={color.primaryDeep} wash={color.primaryWash} />
              <Stat icon="chart-line-variant" value={latest.size} label="Results" tint={color.accent} wash={color.accentSoft} />
            </View>
            <Section title="Allergies" />
            {allergies.length === 0 ? <Empty icon="shield-check-outline" text="No allergies on this record." /> : null}
            {allergies.map((item) => (
              <Card key={item.id} style={styles.row}>
                <IconBadge name="alert-octagon-outline" tint={color.danger} wash={color.dangerSoft} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{item.display}</Text>
                  <Text style={styles.meta}>{item.reaction}</Text>
                </View>
              </Card>
            ))}
            <Section title="Problems" />
            {conditions.length === 0 ? <Empty icon="clipboard-check-outline" text="No problems on this record." /> : null}
            {conditions.map((item) => (
              <Card key={item.id} style={styles.row}>
                <IconBadge name="clipboard-pulse-outline" tint={color.violet} wash={color.violetSoft} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{item.display}</Text>
                  <Text style={styles.meta}>{item.code}</Text>
                </View>
                <Pill label={item.clinicalStatus} tint={color.violet} wash={color.violetSoft} />
              </Card>
            ))}
            <Section title="Medicines" />
            {medications.length === 0 ? <Empty icon="pill" text="No medicines on this record." /> : null}
            {medications.map((item) => (
              <Card key={item.id} style={styles.row}>
                <IconBadge name="pill" tint={color.primaryDeep} wash={color.primarySoft} size={40} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{item.display}</Text>
                  <Text style={styles.meta}>{item.dose}</Text>
                </View>
              </Card>
            ))}
            <Section title="Latest results" />
            {latest.size === 0 ? <Empty icon="test-tube-empty" text="No results on this record." /> : null}
            {[...latest.values()].map((item) => {
              const shade = tone(item.interpretation);
              return (
                <Card key={item.id} style={styles.row}>
                  <IconBadge name="water-outline" tint={shade.tint} wash={shade.wash} size={40} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{item.display}</Text>
                    <Text style={styles.value}>
                      {item.value} <Text style={styles.meta}>{item.unit}</Text>
                    </Text>
                  </View>
                  <Pill label={item.interpretation} tint={shade.tint} wash={shade.wash} />
                </Card>
              );
            })}
            <Section title="Add a source result" />
            <Card>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {catalog.map((item) => {
                  const on = code === item.code;
                  return (
                    <Pressable key={item.code} style={[styles.chip, on ? styles.chipOn : null]} onPress={() => setCode(item.code)}>
                      <Text style={on ? styles.chipOnText : styles.chipText}>
                        {item.display} · {item.unit}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Field icon="numeric" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="Value" />
              <Button label="Add to the record" icon="plus-circle-outline" onPress={record} />
            </Card>
            {session.role === "clinician" || session.role === "admin" ? (
              <>
                <Section title="Book a visit" />
                <Card>
                  <Text style={styles.meta}>Times are UTC. This stores a booked visit. It does not diagnose, and nothing is billed.</Text>
                  <Field icon="calendar-text-outline" value={visitReason} onChangeText={setVisitReason} placeholder="Reason" />
                  <Field icon="clock-start" value={visitStart} onChangeText={setVisitStart} placeholder="2026-10-20T15:00:00.000Z" autoCapitalize="none" />
                  <Field icon="clock-end" value={visitEnd} onChangeText={setVisitEnd} placeholder="2026-10-20T15:20:00.000Z" autoCapitalize="none" />
                  <Button label={busy === "book" ? "Booking" : "Book visit"} icon="calendar-check-outline" onPress={bookVisit} busy={busy === "book"} />
                </Card>
              </>
            ) : null}
            {problems.length > 0 ? (
              <>
                <Section title="Add a problem" />
                <Card>
                  <Text style={styles.meta}>The name is copied from the ICD-10-CM pin. This does not diagnose.</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {problems.map((item) => {
                      const on = problemCode === item.code;
                      return (
                        <Pressable key={item.code} style={[styles.chip, on ? styles.chipOn : null]} onPress={() => setProblemCode(item.code)}>
                          <Text style={on ? styles.chipOnText : styles.chipText}>{item.display}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Button label="Add to the problem list" icon="clipboard-plus-outline" onPress={addProblem} busy={busy === "problem"} />
                </Card>
              </>
            ) : null}
            <Section title="Record an allergy" />
            <Card>
              <Text style={styles.meta}>Stores the substance and reaction entered here. The criticality is the one selected.</Text>
              <Field icon="alert-octagon-outline" value={substance} onChangeText={setSubstance} placeholder="Substance" maxLength={80} />
              <Field icon="allergy" value={reaction} onChangeText={setReaction} placeholder="Reaction" maxLength={80} />
              <View style={styles.chips}>
                {(["low", "high"] as const).map((item) => {
                  const on = criticality === item;
                  return (
                    <Pressable key={item} style={[styles.chip, on ? styles.chipOn : null]} onPress={() => setCriticality(item)}>
                      <Text style={on ? styles.chipOnText : styles.chipText}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button label="Store allergy" icon="shield-plus-outline" onPress={addAllergy} busy={busy === "allergy"} />
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Avatar name={session.displayName} size={46} tint={color.accent} wash={color.accentSoft} />
          <View style={styles.flex}>
            <Text style={styles.hello}>{greeting()},</Text>
            <Text style={styles.name}>{firstName(session.displayName)}</Text>
          </View>
          <Pressable style={styles.roundButton} onPress={signOut} hitSlop={6}>
            <Icon name="logout-variant" size={20} tint={color.ink} />
          </Pressable>
        </View>
        {error ? <Banner tone="error" text={error} /> : null}
        <View style={styles.dayCard}>
          <Orbs />
          <View style={styles.inline}>
            <Icon name="hospital-building" size={15} tint="#cbd5e1" />
            <Text style={styles.dayFacility}>{session.facilityName ?? "No facility on this directory entry"}</Text>
          </View>
          <View style={styles.dayRow}>
            <Pressable style={styles.dayStep} onPress={() => moveDay(-1)} hitSlop={6}>
              <Icon name="chevron-left" size={22} tint="#ffffff" />
            </Pressable>
            <View style={styles.dayCenter}>
              <Text style={styles.dayText}>{dayLabel(`${day}T12:00:00.000Z`)}</Text>
              <Text style={styles.dayCount}>
                {appointments.length} {appointments.length === 1 ? "visit" : "visits"} booked
              </Text>
            </View>
            <Pressable style={styles.dayStep} onPress={() => moveDay(1)} hitSlop={6}>
              <Icon name="chevron-right" size={22} tint="#ffffff" />
            </Pressable>
          </View>
          {day !== today ? (
            <Pressable
              style={styles.todayLink}
              onPress={() => {
                setDay(today);
                loadVisits(session.sessionId, today).catch(() => setError("The visit board could not be loaded."));
              }}
            >
              <Icon name="calendar-today" size={14} tint={color.primary} />
              <Text style={styles.todayText}>Back to today</Text>
            </Pressable>
          ) : null}
        </View>
        {encounters.length > 0 ? <Section title="Open encounters" /> : null}
        {encounters.map((item) => {
          const match = patients.find((person) => person.id === item.patientId);
          return (
            <Card key={item.id} style={styles.row} onPress={() => match && openChart(match)}>
              <IconBadge name="stethoscope" tint={color.accent} wash={color.accentSoft} size={42} />
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>{item.patientName}</Text>
                <Text style={styles.meta}>
                  {item.reason} · {clock(item.startedAt)} UTC
                </Text>
              </View>
              <Icon name="chevron-right" size={22} tint={color.faint} />
            </Card>
          );
        })}
        <View style={styles.searchWrap}>
          <Field icon="magnify" value={query} onChangeText={setQuery} placeholder="Search patients, MRN or reason" />
        </View>
        <View style={styles.laneRow}>
          <Lane on={lane === "visits"} icon="calendar-account-outline" label={`Visits · ${appointments.length}`} onPress={() => setLane("visits")} />
          <Lane on={lane === "patients"} icon="account-group-outline" label={`Patients · ${patients.length}`} onPress={() => setLane("patients")} />
        </View>
        {lane === "visits" ? (
          visitCards.length === 0 ? (
            <Empty icon="calendar-blank-outline" text="No appointments on this UTC date." />
          ) : (
            visitCards.map((item, index) => {
              const match = patients.find((person) => person.id === item.patientId);
              if (index === 0) {
                return (
                  <Pressable key={item.id} style={styles.feature} onPress={() => match && openChart(match)}>
                    <Orbs />
                    <View style={styles.flex}>
                      <View style={styles.featureChip}>
                        <Icon name="clock-outline" size={13} tint="#ffffff" />
                        <Text style={styles.featureChipText}>{clock(item.startsAt)} UTC · first visit</Text>
                      </View>
                      <Text style={styles.featureName}>{item.patientName}</Text>
                      <Text style={styles.featureMeta}>{item.reason}</Text>
                      <Text style={styles.featureMeta}>{item.mrn}</Text>
                    </View>
                    <Avatar name={item.patientName} size={64} tint="#ffffff" wash="rgba(255,255,255,0.22)" />
                  </Pressable>
                );
              }
              return (
                <Card key={item.id} style={styles.row} onPress={() => match && openChart(match)}>
                  <View style={styles.timeTile}>
                    <Text style={styles.timeText}>{clock(item.startsAt)}</Text>
                    <Text style={styles.timeZone}>UTC</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{item.patientName}</Text>
                    <Text style={styles.meta}>
                      {item.reason} · {item.mrn}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={22} tint={color.faint} />
                </Card>
              );
            })
          )
        ) : (
          roster.map((item) => (
            <Card key={item.id} style={styles.row} onPress={() => openChart(item)}>
              <Avatar name={`${item.givenName} ${item.familyName}`} />
              <View style={styles.flex}>
                <Text style={styles.rowTitle}>
                  {item.givenName} {item.familyName}
                </Text>
                <Text style={styles.meta}>
                  {item.mrn} · {item.ageYears} years
                </Text>
              </View>
              <Icon name="chevron-right" size={22} tint={color.faint} />
            </Card>
          ))
        )}
        {lane === "patients" && (session.role === "clinician" || session.role === "admin") ? (
          <View>
            <Section title="Register a patient" />
            <Card>
              <Text style={styles.meta}>The server assigns the MRN and the facility. Both stay on this record.</Text>
              <Field icon="account-outline" value={givenName} onChangeText={setGivenName} placeholder="Given name" maxLength={80} />
              <Field icon="account-outline" value={familyName} onChangeText={setFamilyName} placeholder="Family name" maxLength={80} />
              <Field icon="calendar-outline" value={birthDate} onChangeText={setBirthDate} placeholder="Date of birth, YYYY-MM-DD" autoCapitalize="none" maxLength={10} />
              <View style={[styles.chips, styles.sexRow]}>
                {(["female", "male", "other", "unknown"] as const).map((item) => {
                  const on = sex === item;
                  return (
                    <Pressable key={item} style={[styles.chip, on ? styles.chipOn : null]} onPress={() => setSex(item)}>
                      <Text style={on ? styles.chipOnText : styles.chipText}>{item}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button label="Register" icon="account-plus-outline" busy={busy === "register"} onPress={registerPatient} />
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Lane({ on, icon, label, onPress }: { on: boolean; icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable style={[styles.lane, on ? styles.laneOn : null]} onPress={onPress}>
      <Icon name={icon} size={16} tint={on ? "#ffffff" : color.body} />
      <Text style={on ? styles.laneOnText : styles.laneText}>{label}</Text>
    </Pressable>
  );
}

function Stat({ icon, value, label, tint, wash }: { icon: IconName; value: number; label: string; tint: string; wash: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: wash }]}>
      <Icon name={icon} size={20} tint={tint} />
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1 },
  pad: { padding: 20 },
  inline: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  spinner: { marginVertical: 24 },
  signTop: { backgroundColor: color.ink, paddingTop: 64, paddingBottom: 36, paddingHorizontal: 24, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden" },
  ghostBack: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginBottom: 22 },
  ghostSpacer: { width: 40 },
  signTitle: { color: "#ffffff", fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 38 },
  signLede: { color: "#cbd5e1", marginTop: 10, lineHeight: 21, maxWidth: 300 },
  signBody: { padding: 20, paddingBottom: 48 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  rowTitle: { color: color.ink, fontWeight: "700", fontSize: 15 },
  meta: { color: color.muted, fontSize: 13, textTransform: "none" },
  value: { color: color.ink, fontWeight: "800", fontSize: 18, marginTop: 2 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  hello: { color: color.muted, fontSize: 14 },
  name: { color: color.ink, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.surface, alignItems: "center", justifyContent: "center", ...shadow },
  dayCard: { backgroundColor: color.ink, borderRadius: 28, padding: 18, overflow: "hidden" },
  dayFacility: { color: "#cbd5e1", fontWeight: "600" },
  dayRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  dayStep: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  dayCenter: { flex: 1, alignItems: "center" },
  dayText: { color: "#ffffff", fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  dayCount: { color: "#94a3b8", marginTop: 2, fontWeight: "600" },
  todayLink: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center", marginTop: 12 },
  todayText: { color: color.primary, fontWeight: "700" },
  searchWrap: { marginTop: 16 },
  laneRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  lane: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, backgroundColor: color.surface, paddingHorizontal: 14, paddingVertical: 10 },
  laneOn: { backgroundColor: color.ink },
  laneText: { color: color.body, fontWeight: "700" },
  laneOnText: { color: "#ffffff", fontWeight: "700" },
  feature: { backgroundColor: color.primary, borderRadius: 28, padding: 20, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, overflow: "hidden", ...lift },
  featureChip: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  featureChipText: { color: "#ffffff", fontWeight: "700", fontSize: 12 },
  featureName: { color: "#ffffff", fontSize: 22, fontWeight: "800", marginTop: 10 },
  featureMeta: { color: color.primarySoft, marginTop: 4, lineHeight: 19 },
  timeTile: { width: 58, height: 54, borderRadius: 18, backgroundColor: color.primaryWash, alignItems: "center", justifyContent: "center" },
  timeText: { color: color.primaryDeep, fontWeight: "800", fontSize: 15 },
  timeZone: { color: color.primary, fontSize: 10, fontWeight: "700" },
  chartContent: { paddingBottom: 48 },
  chartTop: { backgroundColor: color.ink, paddingTop: 56, paddingBottom: 28, paddingHorizontal: 20, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden" },
  chartBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  chartBarText: { color: "#ffffff", fontWeight: "800", fontSize: 16, marginBottom: 22 },
  chartHead: { flexDirection: "row", alignItems: "center", gap: 16 },
  chartName: { color: "#ffffff", fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  chartMeta: { color: "#cbd5e1", marginTop: 3 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, borderRadius: 22, padding: 14, gap: 4 },
  statValue: { fontSize: 26, fontWeight: "800", marginTop: 4 },
  statLabel: { color: color.body, fontSize: 12, fontWeight: "600" },
  chips: { flexDirection: "row", gap: 8, marginBottom: 14 },
  sexRow: { flexWrap: "wrap" },
  dayLabel: { color: color.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginTop: 8, marginBottom: 8 },
  provenance: { color: color.faint, fontSize: 11, marginTop: 4 },
  changeLine: { color: color.body, marginTop: 8, lineHeight: 20 },
  noteCard: { marginBottom: 12 },
  abnormal: { borderWidth: 1, borderColor: "#fecdd3" },
  chip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: color.canvas },
  chipOn: { backgroundColor: color.ink },
  chipText: { color: color.body, fontWeight: "600" },
  chipOnText: { color: "#ffffff", fontWeight: "700" },
});
