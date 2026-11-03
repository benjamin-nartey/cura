import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { clock, color, dayLabel, dayParts, firstName, greeting, lift, shadow, submissionKey } from "./theme";
import { Avatar, Banner, Button, Card, Empty, Field, Icon, IconBadge, Orbs, Pill, Section, type IconName } from "./ui";

type Entry = { principalId: string; displayName: string; patientId: string; organizationName: string; facilityName: string };

type Visit = { id: string; status: string; reason: string; startsAt: string; endsAt: string };

type Result = { display: string; value: number; unit: string; interpretation: string; at: string; explanation: string };

type PortalRecord = {
  givenName: string;
  familyName: string;
  mrn: string;
  birthDate: string;
  education: { id: string; body: string }[];
  allergies: { display: string; reaction: string }[];
  medications: { display: string; dose: string; status: string }[];
  appointments: Visit[];
  results: Result[];
  requests: { id: string; reason: string; status: string; startsAt: string | null }[];
  questions: { id: string; text: string; outcome: "stored" | "triage"; instruction: string | null }[];
  messages: { id: string; body: string; author: "patient" | "facility" }[];
  coverage: { payerName: string; memberId: string } | null;
  payments: { id: string; description: string; amountCents: number }[];
};

type Session = { sessionId: string; displayName: string; facilityName: string };

type Answer = { outcome: "stored" | "triage"; instruction: string | null; lines: string[] };

type Tab = "home" | "visits" | "health" | "messages";

const TABS: Array<{ id: Tab; label: string; icon: IconName; active: IconName }> = [
  { id: "home", label: "Home", icon: "home-variant-outline", active: "home-variant" },
  { id: "visits", label: "Visits", icon: "calendar-blank-outline", active: "calendar-heart" },
  { id: "health", label: "Health", icon: "heart-outline", active: "heart-pulse" },
  { id: "messages", label: "Messages", icon: "chat-outline", active: "chat-processing" },
];

const FAILURES: Record<string, string> = {
  signin: "Your session ended. Sign in again.",
  invalid: "Check what you entered and try again.",
  range: "Enter an amount in cents from 1 to 500000. Nothing is charged.",
  open: "You already have a visit request waiting for the clinic.",
  forbidden: "This action is not available for your record.",
  disabled: "Patient sign-in is not enabled on this server.",
};

function interpretationTone(value: string) {
  const text = value.toLowerCase();
  if (text.includes("high") || text.includes("critical") || text.includes("abnormal")) return { tint: color.danger, wash: color.dangerSoft };
  if (text.includes("low")) return { tint: color.accent, wash: color.accentSoft };
  return { tint: color.success, wash: color.successSoft };
}

function statusTone(value: string) {
  if (value === "accepted" || value === "booked" || value === "fulfilled") return { tint: color.success, wash: color.successSoft };
  if (value === "declined" || value === "cancelled") return { tint: color.danger, wash: color.dangerSoft };
  return { tint: color.primaryDeep, wash: color.primarySoft };
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

class ApiError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export function PatientApp({ base, onExit }: { base: string; onExit: () => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [record, setRecord] = useState<PortalRecord | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [payer, setPayer] = useState("");
  const [memberId, setMemberId] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [paymentCents, setPaymentCents] = useState("");
  const fade = useRef(new Animated.Value(1)).current;

  async function api<T>(path: string, init: { method?: string; body?: unknown; sessionId?: string } = {}): Promise<T> {
    const headers: { [name: string]: string } = { accept: "application/json" };
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const sid = init.sessionId ?? session?.sessionId;
    if (sid) headers.authorization = `Bearer ${sid}`;
    let response: Response;
    try {
      response = await fetch(`${base}/api/patient-app/${path}`, {
        method: init.method ?? "GET",
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new ApiError("offline");
    }
    const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok) throw new ApiError(payload?.error ?? "invalid");
    return payload as T;
  }

  function fail(problem: unknown) {
    const code = problem instanceof ApiError ? problem.code : "invalid";
    if (code === "offline") setError(`The patient service is not reachable at ${base}. It runs on this computer at port 3000.`);
    else setError(FAILURES[code] ?? FAILURES.invalid!);
    if (code === "signin") {
      setSession(null);
      setRecord(null);
    }
  }

  async function loadEntries() {
    setLoading(true);
    setError(null);
    try {
      setEntries(await api<Entry[]>("directory"));
    } catch (problem) {
      fail(problem);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
    // Reload the directory when its server address changes.
  }, [base]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [tab, fade]);

  async function refresh(sessionId = session?.sessionId) {
    if (!sessionId) return;
    const opened = await api<{ record: PortalRecord }>("record", { sessionId });
    setRecord(opened.record);
  }

  async function signIn(entry: Entry) {
    setBusy(entry.principalId);
    setError(null);
    try {
      const opened = await api<Session>("session", { method: "POST", body: { principalId: entry.principalId } });
      setSession(opened);
      setTab("home");
      await refresh(opened.sessionId);
    } catch (problem) {
      fail(problem);
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    if (session) await api("signout", { method: "POST" }).catch(() => null);
    setSession(null);
    setRecord(null);
    setAnswer(null);
    setNotice(null);
  }

  async function act(name: string, path: string, body: object, done: string) {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      const result = await api<Answer>(path, { method: "POST", body: { ...body, idempotencyKey: submissionKey("pa") } });
      if (name === "ask") setAnswer(result);
      setNotice(done);
      await refresh();
      return true;
    } catch (problem) {
      fail(problem);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function onRefresh() {
    setLoading(true);
    try {
      await refresh();
    } catch (problem) {
      fail(problem);
    } finally {
      setLoading(false);
    }
  }

  if (!session || !record) {
    return (
      <View style={styles.screen}>
        <StatusBar style="light" />
        <View style={styles.signTop}>
          <Orbs />
          <Pressable onPress={onExit} style={styles.ghostBack} hitSlop={8}>
            <Icon name="chevron-left" size={24} tint="#ffffff" />
          </Pressable>
          <Text style={styles.signTitle}>Your health,{"\n"}in one place</Text>
          <Text style={styles.signLede}>Choose your record. The clinic that holds it comes from the directory.</Text>
        </View>
        <ScrollView contentContainerStyle={styles.signBody}>
          {error ? <Banner tone="error" text={error} /> : null}
          {loading && !entries ? <ActivityIndicator color={color.primary} style={styles.spinner} /> : null}
          {(entries ?? []).map((entry) => (
            <Card key={entry.principalId} style={styles.entry} onPress={() => signIn(entry)}>
              <Avatar name={entry.displayName} />
              <View style={styles.flex}>
                <Text style={styles.entryName}>{entry.displayName}</Text>
                <View style={styles.inline}>
                  <Icon name="hospital-building" size={14} tint={color.faint} />
                  <Text style={styles.meta}>{entry.facilityName}</Text>
                </View>
              </View>
              {busy === entry.principalId ? <ActivityIndicator color={color.primary} /> : <Icon name="chevron-right" size={22} tint={color.faint} />}
            </Card>
          ))}
          {entries && entries.length === 0 ? <Empty icon="account-search-outline" text="No patient records are open for sign-in on this server." /> : null}
          {error ? <Button label="Try again" icon="refresh" tone="quiet" onPress={loadEntries} /> : null}
        </ScrollView>
      </View>
    );
  }

  const name = `${record.givenName} ${record.familyName}`;
  const now = Date.now();
  const upcoming = record.appointments.filter((visit) => Date.parse(visit.startsAt) >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = record.appointments.filter((visit) => Date.parse(visit.startsAt) < now).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const next = upcoming[0] ?? null;
  const pending = record.requests.filter((item) => item.status === "requested");

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={color.primary} />}
      >
        <View style={styles.header}>
          <Avatar name={name} size={46} />
          <View style={styles.flex}>
            <Text style={styles.hello}>{greeting()},</Text>
            <Text style={styles.name}>{firstName(name)}</Text>
          </View>
          <Pressable onPress={signOut} style={styles.roundButton} hitSlop={6}>
            <Icon name="logout-variant" size={20} tint={color.ink} />
          </Pressable>
        </View>
        {error ? <Banner tone="error" text={error} /> : null}
        {notice ? <Banner tone="notice" text={notice} /> : null}
        <Animated.View style={{ opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
          {tab === "home" ? (
            <View>
              <View style={styles.hero}>
                <Orbs />
                <View style={styles.heroTop}>
                  <View style={styles.heroChip}>
                    <Icon name="calendar-clock" size={14} tint="#ffffff" />
                    <Text style={styles.heroChipText}>{next ? "Next visit" : "No visit booked"}</Text>
                  </View>
                  <Icon name="stethoscope" size={26} tint="rgba(255,255,255,0.85)" />
                </View>
                {next ? (
                  <>
                    <Text style={styles.heroDate}>{dayLabel(next.startsAt)}</Text>
                    <Text style={styles.heroTime}>
                      {clock(next.startsAt)} – {clock(next.endsAt)} UTC
                    </Text>
                    <Text style={styles.heroReason}>{next.reason}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.heroDate}>{pending.length > 0 ? "Request sent" : "Plan your next visit"}</Text>
                    <Text style={styles.heroReason}>
                      {pending.length > 0 ? `The clinic is reviewing: ${pending[0]!.reason}` : "Ask the clinic for a time and they will confirm it here."}
                    </Text>
                  </>
                )}
                <View style={styles.heroFoot}>
                  <Icon name="hospital-building" size={15} tint={color.primarySoft} />
                  <Text style={styles.heroFootText}>{session.facilityName}</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Action icon="calendar-plus" label="Book" tint={color.accent} wash={color.accentSoft} onPress={() => setTab("visits")} />
                <Action icon="message-text-outline" label="Message" tint={color.violet} wash={color.violetSoft} onPress={() => setTab("messages")} />
                <Action icon="pill" label="Medicines" tint={color.primaryDeep} wash={color.primarySoft} onPress={() => setTab("health")} />
                <Action icon="test-tube" label="Results" tint={color.success} wash={color.successSoft} onPress={() => setTab("health")} />
              </View>
              <View style={styles.stats}>
                <Stat icon="pill" value={record.medications.length} label="Medicines" tint={color.primaryDeep} wash={color.primaryWash} />
                <Stat icon="chart-line-variant" value={record.results.length} label="Results" tint={color.accent} wash={color.accentSoft} />
                <Stat icon="alert-octagon-outline" value={record.allergies.length} label="Allergies" tint={color.danger} wash={color.dangerSoft} />
              </View>
              <Section title="Latest results" action={record.results.length > 0 ? "See all" : undefined} onAction={() => setTab("health")} />
              {record.results.length === 0 ? <Empty icon="test-tube-empty" text="No results have been released to your record." /> : null}
              {record.results.slice(0, 2).map((item) => (
                <ResultCard key={`${item.display}-${item.at}`} item={item} />
              ))}
              {record.education.length > 0 ? <Section title="From your care team" /> : null}
              {record.education.map((item) => (
                <Card key={item.id} style={styles.note}>
                  <IconBadge name="book-open-page-variant-outline" tint={color.violet} wash={color.violetSoft} size={40} />
                  <Text style={styles.noteText}>{item.body}</Text>
                </Card>
              ))}
            </View>
          ) : null}

          {tab === "visits" ? (
            <View>
              <Text style={styles.title}>Visits</Text>
              <Text style={styles.subtitle}>Booked times come from the clinic schedule.</Text>
              <Section title="Upcoming" />
              {upcoming.length === 0 ? <Empty icon="calendar-blank-outline" text="No upcoming visits are booked." /> : null}
              {upcoming.map((visit) => (
                <VisitCard key={visit.id} visit={visit} />
              ))}
              <Section title="Request a visit" />
              <Card>
                <View style={styles.formHead}>
                  <IconBadge name="calendar-plus" tint={color.accent} wash={color.accentSoft} size={40} />
                  <Text style={styles.formTitle}>Tell the clinic what the visit is for</Text>
                </View>
                <Field icon="text-box-outline" value={reason} onChangeText={setReason} placeholder="Follow-up on blood pressure" maxLength={200} />
                <Button
                  label="Send request"
                  icon="send"
                  busy={busy === "request"}
                  onPress={async () => {
                    if (await act("request", "request", { reason }, "Your request was sent. The clinic will confirm a time.")) setReason("");
                  }}
                />
              </Card>
              {record.requests.length > 0 ? <Section title="Your requests" /> : null}
              {record.requests.map((item) => {
                const tone = statusTone(item.status);
                return (
                  <Card key={item.id} style={styles.row}>
                    <IconBadge name="clipboard-text-clock-outline" tint={tone.tint} wash={tone.wash} size={42} />
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>{item.reason}</Text>
                      <Text style={styles.meta}>{item.startsAt ? `${dayLabel(item.startsAt)} · ${clock(item.startsAt)} UTC` : "Waiting for a time"}</Text>
                    </View>
                    <Pill label={item.status} tint={tone.tint} wash={tone.wash} />
                  </Card>
                );
              })}
              {past.length > 0 ? <Section title="Past visits" /> : null}
              {past.map((visit) => (
                <VisitCard key={visit.id} visit={visit} past />
              ))}
            </View>
          ) : null}

          {tab === "health" ? (
            <View>
              <Text style={styles.title}>Health record</Text>
              <Text style={styles.subtitle}>
                {record.mrn} · born {record.birthDate}
              </Text>
              <Section title="Medicines" />
              {record.medications.length === 0 ? <Empty icon="pill" text="No medicines on your record." /> : null}
              {record.medications.map((item) => (
                <Card key={`${item.display}-${item.dose}`} style={styles.row}>
                  <IconBadge name="pill" tint={color.primaryDeep} wash={color.primarySoft} size={42} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{item.display}</Text>
                    <Text style={styles.meta}>{item.dose}</Text>
                  </View>
                  <Pill label={item.status} tint={color.success} wash={color.successSoft} />
                </Card>
              ))}
              <Section title="Results" />
              {record.results.length === 0 ? <Empty icon="test-tube-empty" text="No results have been released to your record." /> : null}
              {record.results.map((item) => (
                <ResultCard key={`${item.display}-${item.at}`} item={item} />
              ))}
              {record.results.length > 0 ? (
                <Button
                  label="Keep the stored explanation"
                  icon="text-box-check-outline"
                  tone="quiet"
                  busy={busy === "explain"}
                  onPress={() => act("explain", "explain", {}, "The explanation already stored on each result was kept. Nothing was generated. This does not diagnose.")}
                />
              ) : null}
              <Section title="Allergies" />
              {record.allergies.length === 0 ? <Empty icon="shield-check-outline" text="No allergies on your record." /> : null}
              {record.allergies.map((item) => (
                <Card key={item.display} style={styles.row}>
                  <IconBadge name="alert-octagon-outline" tint={color.danger} wash={color.dangerSoft} size={42} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{item.display}</Text>
                    <Text style={styles.meta}>{item.reaction}</Text>
                  </View>
                </Card>
              ))}
              <Section title="Coverage and payments" />
              <Card style={styles.row}>
                <IconBadge name="shield-account-outline" tint={color.accent} wash={color.accentSoft} size={42} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>{record.coverage?.payerName ?? "No coverage on file"}</Text>
                  <Text style={styles.meta}>{record.coverage ? `Member ${record.coverage.memberId}. Nothing was billed.` : "A member id is not a card number."}</Text>
                </View>
              </Card>
              {record.payments.map((item) => (
                <Card key={item.id} style={styles.row}>
                  <IconBadge name="credit-card-check-outline" tint={color.success} wash={color.successSoft} size={42} />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{item.description}</Text>
                    <Text style={styles.meta}>Recorded · nothing was charged</Text>
                  </View>
                  <Text style={styles.amount}>{money(item.amountCents)}</Text>
                </Card>
              ))}
              <Card>
                <View style={styles.formHead}>
                  <IconBadge name="shield-account-outline" tint={color.accent} wash={color.accentSoft} size={40} />
                  <Text style={styles.formTitle}>Store coverage. Nothing is billed.</Text>
                </View>
                <Field icon="domain" value={payer} onChangeText={setPayer} placeholder="Payer" maxLength={80} />
                <Field icon="card-account-details-outline" value={memberId} onChangeText={setMemberId} placeholder="Member id" autoCapitalize="none" maxLength={40} />
                <Button
                  label="Store coverage"
                  icon="shield-check-outline"
                  tone="quiet"
                  busy={busy === "coverage"}
                  onPress={async () => {
                    if (await act("coverage", "coverage", { payerName: payer, memberId }, "Coverage is stored. Nothing was billed.")) {
                      setPayer("");
                      setMemberId("");
                    }
                  }}
                />
              </Card>
              <Card>
                <View style={styles.formHead}>
                  <IconBadge name="cash-check" tint={color.success} wash={color.successSoft} size={40} />
                  <Text style={styles.formTitle}>Record an amount in cents. Nothing is charged.</Text>
                </View>
                <Field icon="text-box-outline" value={paymentDescription} onChangeText={setPaymentDescription} placeholder="Description" maxLength={120} />
                <Field icon="currency-usd" value={paymentCents} onChangeText={setPaymentCents} placeholder="Amount in cents" keyboardType="number-pad" maxLength={6} />
                <Button
                  label="Record amount"
                  icon="check"
                  busy={busy === "payment"}
                  onPress={async () => {
                    if (await act("payment", "payment", { description: paymentDescription, amountCents: Number(paymentCents) }, "The amount is recorded. Nothing was charged.")) {
                      setPaymentDescription("");
                      setPaymentCents("");
                    }
                  }}
                />
              </Card>
            </View>
          ) : null}

          {tab === "messages" ? (
            <View>
              <Text style={styles.title}>Care team</Text>
              <Text style={styles.subtitle}>Messages go to {session.facilityName}. For an emergency, call your local emergency number.</Text>
              <Card style={styles.thread}>
                {record.messages.length === 0 ? <Empty icon="chat-outline" text="No messages yet. Write to your care team below." /> : null}
                {record.messages.map((item) => {
                  const mine = item.author === "patient";
                  return (
                    <View key={item.id} style={[styles.bubbleRow, mine ? styles.bubbleRowMine : null]}>
                      {!mine ? (
                        <View style={styles.teamDot}>
                          <Icon name="doctor" size={16} tint={color.accent} />
                        </View>
                      ) : null}
                      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTeam]}>
                        <Text style={mine ? styles.bubbleMineText : styles.bubbleText}>{item.body}</Text>
                      </View>
                    </View>
                  );
                })}
                <View style={styles.composer}>
                  <View style={styles.flex}>
                    <Field value={draft} onChangeText={setDraft} placeholder="Write a message" maxLength={1000} multiline />
                  </View>
                  <Pressable
                    style={styles.send}
                    onPress={async () => {
                      if (await act("message", "message", { body: draft }, "Message sent to your care team.")) setDraft("");
                    }}
                  >
                    {busy === "message" ? <ActivityIndicator color="#ffffff" /> : <Icon name="send" size={20} tint="#ffffff" />}
                  </Pressable>
                </View>
              </Card>
              <Section title="Ask about your record" />
              <Card>
                <View style={styles.formHead}>
                  <IconBadge name="help-circle-outline" tint={color.success} wash={color.successSoft} size={40} />
                  <Text style={styles.formTitle}>Answers come only from your own record. This does not diagnose.</Text>
                </View>
                <Field icon="magnify" value={question} onChangeText={setQuestion} placeholder="When is my next visit?" maxLength={500} />
                <Button
                  label="Ask"
                  icon="text-search"
                  tone="dark"
                  busy={busy === "ask"}
                  onPress={async () => {
                    if (await act("ask", "ask", { text: question }, "Your question was saved to your record.")) setQuestion("");
                  }}
                />
                {answer?.instruction ? (
                  <View style={styles.triage}>
                    <Icon name="alarm-light-outline" size={22} tint={color.danger} />
                    <Text style={styles.triageText}>{answer.instruction}</Text>
                  </View>
                ) : null}
                {answer && !answer.instruction ? (
                  <View style={styles.answer}>
                    {answer.lines.length === 0 ? <Text style={styles.meta}>Nothing on your record answers that yet. Your care team can see the question.</Text> : null}
                    {answer.lines.map((line) => (
                      <View key={line} style={styles.answerLine}>
                        <Icon name="check-circle" size={16} tint={color.success} />
                        <Text style={styles.answerText}>{line}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Card>
              {record.questions.length > 0 ? <Section title="Earlier questions" /> : null}
              {record.questions.map((item) => (
                <Card key={item.id} style={styles.row}>
                  <IconBadge
                    name={item.outcome === "triage" ? "alarm-light-outline" : "comment-question-outline"}
                    tint={item.outcome === "triage" ? color.danger : color.muted}
                    wash={item.outcome === "triage" ? color.dangerSoft : color.canvas}
                    size={40}
                  />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{item.text}</Text>
                    {item.instruction ? <Text style={styles.triageSmall}>{item.instruction}</Text> : null}
                  </View>
                </Card>
              ))}
            </View>
          ) : null}
        </Animated.View>
      </ScrollView>
      <View style={styles.tabBar}>
        {TABS.map((item) => {
          const on = tab === item.id;
          return (
            <Pressable key={item.id} onPress={() => setTab(item.id)} style={[styles.tab, on ? styles.tabOn : null]}>
              <Icon name={on ? item.active : item.icon} size={22} tint={on ? "#ffffff" : color.muted} />
              {on ? <Text style={styles.tabText}>{item.label}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </KeyboardAvoidingView>
  );
}

function Action({ icon, label, tint, wash, onPress }: { icon: IconName; label: string; tint: string; wash: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed ? { opacity: 0.8 } : null]}>
      <View style={[styles.actionIcon, { backgroundColor: wash }]}>
        <Icon name={icon} size={24} tint={tint} />
      </View>
      <Text style={styles.actionText}>{label}</Text>
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

function ResultCard({ item }: { item: Result }) {
  const tone = interpretationTone(item.interpretation);
  return (
    <Card style={styles.result}>
      <View style={styles.resultHead}>
        <IconBadge name="water-outline" tint={tone.tint} wash={tone.wash} size={40} />
        <View style={styles.flex}>
          <Text style={styles.rowTitle}>{item.display}</Text>
          <Text style={styles.meta}>{dayLabel(item.at)}</Text>
        </View>
        <Pill label={item.interpretation} tint={tone.tint} wash={tone.wash} />
      </View>
      <View style={styles.resultValue}>
        <Text style={styles.valueBig}>{item.value}</Text>
        <Text style={styles.valueUnit}>{item.unit}</Text>
      </View>
      <Text style={styles.explain}>{item.explanation}</Text>
    </Card>
  );
}

function VisitCard({ visit, past = false }: { visit: Visit; past?: boolean }) {
  const parts = dayParts(visit.startsAt);
  const tone = statusTone(visit.status);
  return (
    <Card style={[styles.row, past ? styles.pastCard : null]}>
      <View style={[styles.dateTile, past ? styles.dateTilePast : null]}>
        <Text style={[styles.dateMonth, past ? styles.dateMuted : null]}>{parts.month}</Text>
        <Text style={[styles.dateDay, past ? styles.dateMuted : null]}>{parts.day}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{visit.reason}</Text>
        <View style={styles.inline}>
          <Icon name="clock-outline" size={14} tint={color.faint} />
          <Text style={styles.meta}>
            {parts.weekday} · {clock(visit.startsAt)} UTC
          </Text>
        </View>
      </View>
      <Pill label={visit.status} tint={tone.tint} wash={tone.wash} />
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1 },
  inline: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  spinner: { marginVertical: 24 },
  signTop: { backgroundColor: color.primary, paddingTop: 64, paddingBottom: 36, paddingHorizontal: 24, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden" },
  ghostBack: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 22 },
  signTitle: { color: "#ffffff", fontSize: 32, fontWeight: "800", letterSpacing: -0.8, lineHeight: 38 },
  signLede: { color: color.primarySoft, marginTop: 10, lineHeight: 21, maxWidth: 300 },
  signBody: { padding: 20, paddingBottom: 48 },
  entry: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 12 },
  entryName: { color: color.ink, fontWeight: "800", fontSize: 16 },
  meta: { color: color.muted, fontSize: 13 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 130 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  hello: { color: color.muted, fontSize: 14 },
  name: { color: color.ink, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.surface, alignItems: "center", justifyContent: "center", ...shadow },
  hero: { backgroundColor: color.primary, borderRadius: 30, padding: 22, overflow: "hidden", ...lift },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  heroChipText: { color: "#ffffff", fontWeight: "700", fontSize: 12 },
  heroDate: { color: "#ffffff", fontSize: 28, fontWeight: "800", letterSpacing: -0.6, marginTop: 18 },
  heroTime: { color: "#ffffff", fontWeight: "700", marginTop: 4, opacity: 0.92 },
  heroReason: { color: color.primarySoft, marginTop: 8, lineHeight: 20 },
  heroFoot: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.22)" },
  heroFootText: { color: color.primarySoft, fontWeight: "600" },
  actions: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  action: { alignItems: "center", gap: 8, width: "23%" },
  actionIcon: { width: 60, height: 60, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  actionText: { color: color.body, fontWeight: "700", fontSize: 12 },
  stats: { flexDirection: "row", gap: 10, marginTop: 22 },
  stat: { flex: 1, borderRadius: 22, padding: 14, gap: 4 },
  statValue: { fontSize: 26, fontWeight: "800", marginTop: 4 },
  statLabel: { color: color.body, fontSize: 12, fontWeight: "600" },
  note: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 10 },
  noteText: { flex: 1, color: color.body, lineHeight: 20 },
  title: { color: color.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { color: color.muted, marginTop: 4, lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  rowTitle: { color: color.ink, fontWeight: "700", fontSize: 15 },
  amount: { color: color.ink, fontWeight: "800", fontSize: 15 },
  pastCard: { opacity: 0.78 },
  dateTile: { width: 54, height: 58, borderRadius: 18, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  dateTilePast: { backgroundColor: color.canvas },
  dateMonth: { color: color.primarySoft, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  dateDay: { color: "#ffffff", fontSize: 22, fontWeight: "800" },
  dateMuted: { color: color.muted },
  formHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  formTitle: { flex: 1, color: color.ink, fontWeight: "700", lineHeight: 20 },
  result: { marginBottom: 10 },
  resultHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  resultValue: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 14 },
  valueBig: { color: color.ink, fontSize: 34, fontWeight: "800", letterSpacing: -1 },
  valueUnit: { color: color.muted, fontWeight: "700", marginBottom: 6 },
  explain: { color: color.body, lineHeight: 20, marginTop: 6 },
  thread: { gap: 10 },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  bubbleRowMine: { justifyContent: "flex-end" },
  teamDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: color.accentSoft, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "78%", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  bubbleMine: { backgroundColor: color.primary, borderBottomRightRadius: 6 },
  bubbleTeam: { backgroundColor: color.canvas, borderBottomLeftRadius: 6 },
  bubbleText: { color: color.ink, lineHeight: 20 },
  bubbleMineText: { color: "#ffffff", lineHeight: 20 },
  composer: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 8 },
  send: { width: 50, height: 50, borderRadius: 18, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" },
  triage: { flexDirection: "row", gap: 10, backgroundColor: color.dangerSoft, borderRadius: 18, padding: 14, marginTop: 14 },
  triageText: { flex: 1, color: "#9f1239", fontWeight: "700", lineHeight: 20 },
  triageSmall: { color: color.danger, marginTop: 4, lineHeight: 18, fontSize: 13 },
  answer: { backgroundColor: color.canvas, borderRadius: 18, padding: 14, marginTop: 14, gap: 8 },
  answerLine: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  answerText: { flex: 1, color: color.body, lineHeight: 20 },
  tabBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    height: 68,
    borderRadius: 34,
    backgroundColor: color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    ...shadow,
    shadowOpacity: 0.12,
  },
  tab: { height: 52, minWidth: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, paddingHorizontal: 14 },
  tabOn: { backgroundColor: color.ink },
  tabText: { color: "#ffffff", fontWeight: "700", fontSize: 13 },
});
