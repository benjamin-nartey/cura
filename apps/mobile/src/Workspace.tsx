import {NativeTwinInspection} from "./TwinInspection";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { Avatar, Banner, Button, Card, Empty, Field, Icon, MetricCard, Section, type IconName } from "./ui";
import { color, firstName, greeting } from "./theme";

type Identity = { userId: string; displayName: string; role: string; organizationName: string; facilityName: string | null };
type Session = { sessionId: string; displayName: string; facilityName: string | null; organizationName: string; permissions: string[] };
type Metric = { label: string; count: number; href: string; detail: string };
type Dashboard = { metrics: Metric[]; mixTitle: string; mix: { label: string; count: number }[] };
type RecordRow = { id: string; patient_id?:string; ends_at?:string; version?:number; sex?:string; registration_status?:string; given_name?: string; family_name?: string; mrn?: string; birth_date?: string; display?: string; status?: string; clinical_status?: string; verification_status?: string; finding?: string; category?: string; starts_at?: string; due_on?: string; parent_kind?: string; value_quantity?: number | null; unit_code?: string | null; effective_at?: string; currency?: string; total_minor?: number; components?: { display: string; value_quantity: number; unit_code: string }[] };
type Chart = { patient: RecordRow; superseded: boolean; survivorId?: string; sections: Record<string, unknown>; failures?: string[] };
type Tab = "home" | "patients" | "appointments" | "work" | "charges" | "account";
const TABS: { id: Tab; label: string; icon: IconName; permission?: string }[] = [
  { id: "home", label: "Home", icon: "view-dashboard-outline" },
  { id: "patients", label: "Patients", icon: "account-group-outline", permission: "patient.read" },
  { id: "appointments", label: "Visits", icon: "calendar-outline", permission: "appointment.read" },
  { id: "work", label: "Work", icon: "clipboard-check-outline", permission: "work.pending.read" },
  { id: "charges", label: "Charges", icon: "wallet-outline", permission: "billing.charge.read" },
  { id: "account", label: "Account", icon: "account-circle-outline" },
];
const SECTIONS: Record<string, string> = { conditions: "Conditions", allergies: "Allergies", observations: "Observations", medications: "Medication drafts", encounters: "Encounters", orders: "Department requests", plans: "Care plans", referrals: "Referrals", appointments: "Appointments", charges: "Charges", billingStatus: "Charge status" };
const failMessage: Record<string, string> = { signin: "Your session has ended. Sign in again.", forbidden: "Your current role cannot access this view.", notfound: "This record is not available at your facility.", disabled: "This connection is not enabled for the simulation workspace.", offline: "We couldn’t reach your workspace. Check the connection and try again.", unavailable: "This view is temporarily unavailable. Try again." };
class ApiError extends Error { constructor(public code: string) { super(code); } }

export function Workspace({ base, onExit }: { base: string; onExit: () => void }) {
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const token = useRef<string | null>(null);
  const generation = useRef(0);
  const lastBase = useRef(base);
  const [tab, setTab] = useState<Tab>("home");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [work, setWork] = useState<Record<string, RecordRow[]> | null>(null);
  const [chart, setChart] = useState<Chart | null>(null);
  const [twinPatient,setTwinPatient]=useState<string|null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [synced, setSynced] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  function clearSession() {
    generation.current += 1; setTwinPatient(null); token.current = null; setSession(null); setDashboard(null); setRows([]); setWork(null); setChart(null); setQuery(""); setSynced(null); setLoading(false);
  }
  async function api<T>(path: string, method = "GET", body?: unknown, sid = token.current, timeoutMs = 12000): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}/api/mobile-workspace/${path}`, { method, signal: controller.signal, credentials: "omit", headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...(sid ? { authorization: `Bearer ${sid}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const data = await response.json();
      if (!response.ok) throw new ApiError(data?.error ?? "unavailable");
      return data as T;
    } catch (problem) { if (problem instanceof ApiError) throw problem; throw new ApiError("offline"); }
    finally { clearTimeout(timeout); }
  }
  async function twinRequest<T>(params:string):Promise<T>{const selectedToken=token.current,selectedGeneration=generation.current;try{return await api<T>(`twin?${params}`, "GET", undefined, selectedToken, 30000);}catch(problem){if(selectedToken===token.current&&selectedGeneration===generation.current){setChart(null);setRows([]);setWork(null);setDashboard(null);setSynced(null);fail(problem);}throw problem;}}
  function fail(problem: unknown) {
    const code = problem instanceof ApiError ? problem.code : "unavailable";
    if (code === "signin") clearSession();
    setError(failMessage[code] ?? failMessage.unavailable!);
  }
  async function directory() {
    const request = ++generation.current; setLoading(true); setError(null);
    try { const data = await api<{ entries: Identity[] }>("directory"); if (request === generation.current) setIdentities(data.entries); }
    catch (problem) { if (request === generation.current) fail(problem); }
    finally { if (request === generation.current) setLoading(false); }
  }
  useEffect(() => {
    if (lastBase.current !== base) { clearSession(); lastBase.current = base; }
    directory();
    // Invalidate late responses. On unmount the ref is collected with the view;
    // preserving it here also keeps development refresh from stranding a session.
    return () => { generation.current += 1; };
  }, [base]); // Reload only when the server address changes.

  async function load(next: Tab = tab, search = query) {
    if (!token.current) return;
    const request = ++generation.current; setTwinPatient(null); setTab(next); setChart(null); setRows([]); setWork(null); setError(null); setLoading(true); setSynced(null);
    if (next === "home") setDashboard(null);
    try {
      if (next === "home") { const data = await api<Dashboard>("dashboard"); if (request === generation.current) setDashboard(data); }
      else if (next === "work") { const data = await api<Record<string, RecordRow[]>>("work"); if (request === generation.current) setWork(data); }
      else if (next !== "account") { const data = await api<{ records: RecordRow[] }>(`${next}${next === "patients" ? `?q=${encodeURIComponent(search)}` : ""}`); if (request === generation.current) setRows(data.records); }
      if (request === generation.current) setSynced(new Date().toISOString());
    } catch (problem) { if (request === generation.current) fail(problem); }
    finally { if (request === generation.current) setLoading(false); }
  }
  async function signIn(identity: Identity) {
    if (signingIn) return;
    const request = ++generation.current; setSigningIn(true); setLoading(true); setError(null);
    try {
      const next = await api<Session>("session", "POST", { userId: identity.userId }, null);
      if (request !== generation.current) { await api("signout", "POST", undefined, next.sessionId).catch(() => null); return; }
      token.current = next.sessionId; setSession(next); setTab("home"); setQuery(""); await load("home", "");
    } catch (problem) { if (request === generation.current) fail(problem); }
    finally { setSigningIn(false); setLoading(false); }
  }
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true); setError(null);
    try { await api("signout", "POST"); clearSession(); await directory(); }
    catch (problem) { fail(problem); }
    finally { setSigningOut(false); }
  }
  async function openChart(id: string) {
    const request = ++generation.current; setChart(null); setRows([]); setLoading(true); setError(null);
    try { const data = await api<Chart>(`chart/${encodeURIComponent(id)}`); if (request === generation.current) setChart(data); }
    catch (problem) { if (request === generation.current) fail(problem); }
    finally { if (request === generation.current) setLoading(false); }
  }
  async function openWeb(path: string) {
    try { await Linking.openURL(`${base}${path}`); } catch { setError("The workspace link could not be opened."); }
  }
  function openMetric(metric:Metric) {
    const target=metric.href==="/patients"?"patients":metric.href==="/appointments"||metric.label==="Appointments"?"appointments":metric.href==="/work"?"work":metric.href==="/billing"?"charges":null;
    const option=TABS.find(item=>item.id===target);
    if(option&&(!option.permission||session?.permissions.includes(option.permission)))void load(option.id,"");
    else void openWeb(metric.href);
  }
  const name = (row: RecordRow) => row.given_name ? `${row.given_name} ${row.family_name}` : row.display ?? row.category ?? row.parent_kind ?? row.id;
  function record(row: RecordRow, index: number, clickable = false) {
    if(row.starts_at&&row.id.startsWith("apt_")){const date=new Date(row.starts_at),valid=Number.isFinite(date.getTime());return <Card key={row.id} style={styles.visitCard}><View style={styles.row}><View style={styles.visitDate}><Text style={styles.visitMonth}>{valid?new Intl.DateTimeFormat("en-GB",{month:"short",timeZone:"UTC"}).format(date):"Date"}</Text><Text style={styles.visitDay}>{valid?new Intl.DateTimeFormat("en-GB",{day:"2-digit",timeZone:"UTC"}).format(date):"—"}</Text></View><View style={styles.flex}><Text style={styles.recordTitle}>{row.category?.replaceAll("-"," ")??"Appointment"}</Text><Text style={styles.meta}>{valid?new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:"UTC"}).format(date):"Time unavailable"} · UTC</Text><Text style={styles.visitState}>{row.status}</Text></View></View><Text style={styles.small}>Patient reference · {row.patient_id??"Not recorded"}</Text><Button label="View appointment details" icon="open-in-new" tone="quiet" onPress={()=>void openWeb(`/appointments/${row.id}`)}/></Card>;}
    return <Card key={row.id ?? index} style={styles.record} onPress={clickable ? () => openChart(row.id) : undefined}>
      <View style={styles.row}>{clickable ? <Avatar name={name(row)} size={40} /> : <View style={styles.recordDot} />}<View style={styles.flex}><Text style={styles.recordTitle}>{name(row)}</Text>{row.mrn ? <Text style={styles.meta}>{row.mrn} · {row.birth_date}</Text> : null}{row.status || row.clinical_status || row.verification_status ? <Text style={styles.meta}>{[row.status, row.clinical_status, row.verification_status].filter(Boolean).join(" · ")}</Text> : null}{row.starts_at || row.effective_at || row.due_on ? <Text style={styles.meta}>{row.starts_at ?? row.effective_at ?? `Due ${row.due_on}`}{row.starts_at || row.effective_at ? " UTC" : ""}</Text> : null}{row.value_quantity !== null && row.value_quantity !== undefined ? <Text style={styles.value}>{row.value_quantity} {row.unit_code}</Text> : null}{row.components?.map(c => <Text style={styles.value} key={c.display}>{c.display}: {c.value_quantity} {c.unit_code}</Text>)}{row.total_minor !== undefined ? <Text style={styles.value}>{row.currency} {(row.total_minor / 100).toFixed(2)}</Text> : null}</View>{clickable ? <Icon name="chevron-right" tint={color.muted} /> : null}</View>
    </Card>;
  }
  if (!session) return <View style={styles.screen}><StatusBar style="light" /><View style={styles.hero}><Pressable accessibilityRole="button" accessibilityLabel="Back to welcome" onPress={onExit}><Icon name="arrow-left" tint="#fff" /></Pressable><Text style={styles.kicker}>CURASPHERE WORKSPACE</Text><Text style={styles.heroTitle}>Welcome back.</Text><Text style={styles.heroBody}>Your team. Your facility. One connected view.</Text></View><ScrollView contentContainerStyle={styles.content}>{error ? <Banner tone="error" text={error} /> : null}<Text style={styles.sectionTitle}>Choose your workspace identity</Text><Text style={styles.meta}>Simulation access uses synthetic records. Your role and facility are verified by the server.</Text>{loading ? <ActivityIndicator accessibilityLabel="Loading workspace" color={color.primary} /> : null}{identities.map(person => <Card key={person.userId} style={styles.record} onPress={signingIn ? undefined : () => signIn(person)}><View style={styles.row}><Avatar name={person.displayName} size={44} /><View style={styles.flex}><Text style={styles.recordTitle}>{person.displayName}</Text><Text style={styles.meta}>{person.role} · {person.facilityName ?? person.organizationName}</Text></View><Icon name="arrow-right" tint={color.primary} /></View></Card>)}{error ? <Button label="Retry connection" icon="refresh" onPress={directory} tone="quiet" /> : null}</ScrollView></View>;
  if(twinPatient) return <View style={styles.screen}><StatusBar style="dark"/><NativeTwinInspection key={`${base}-${session.sessionId}-${twinPatient}`} patient={twinPatient} request={twinRequest} onSourceTools={()=>{void openWeb(`/patients/${twinPatient}/twin/sources`);}} onBack={()=>{setTwinPatient(null);void load("patients");}}/></View>;
  return <View style={styles.screen}><StatusBar style="light" /><View style={styles.header}><View style={styles.flex}><Text style={styles.kicker}>CURASPHERE</Text><Text style={styles.facility}>{session.facilityName ?? session.organizationName}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Refresh workspace" onPress={() => load()}><Icon name="refresh" tint="#e6efdc" /></Pressable></View>
    <ScrollView horizontal accessibilityRole="tablist" accessibilityLabel="Workspace sections" style={styles.tabs} contentContainerStyle={styles.tabContent} showsHorizontalScrollIndicator={false}>{TABS.filter(t => !t.permission || session.permissions.includes(t.permission)).map(item => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} accessibilityLabel={item.label} key={item.id} onPress={() => load(item.id, "")} style={[styles.tab, tab === item.id && styles.activeTab]}><Icon name={item.icon} size={19} tint={tab === item.id ? color.primary : color.muted} /><Text style={[styles.tabText, tab === item.id && styles.activeText]}>{item.label}</Text></Pressable>)}</ScrollView>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => chart ? openChart(chart.patient.id) : load()} tintColor={color.primary} />}>
      {error ? <Banner tone="error" text={error} /> : null}
      {loading ? <ActivityIndicator accessibilityLabel="Loading records" color={color.primary} /> : null}
      {chart && !loading ? <><Button label="Back to patients" icon="arrow-left" tone="quiet" onPress={() => load("patients")} /><View style={styles.chartIdentity}><Avatar name={name(chart.patient)} size={54} /><View style={styles.flex}><Text style={styles.title}>{name(chart.patient)}</Text><Text style={styles.meta}>{chart.patient.mrn} · {chart.patient.birth_date}</Text><Text style={styles.meta}>Simulation record · Not for live clinical use</Text></View></View><Card style={styles.identityPanel}><Text style={styles.sectionTitle}>Identity record</Text><View style={styles.identityGrid}>{[["Birth date",chart.patient.birth_date],["Sex",chart.patient.sex],["Registration",chart.patient.registration_status],["Record version",chart.patient.version]].map(([label,value])=><View key={label} style={styles.identityFact}><Text style={styles.meta}>{label}</Text><Text style={styles.recordTitle}>{value??"Not recorded"}</Text></View>)}</View><Button label="Open complete identity record" icon="open-in-new" tone="quiet" onPress={()=>void openWeb(`/patients/${chart.patient.id}/identity`)}/></Card><Button label="Evidence claims on web" icon="file-document-outline" tone="quiet" onPress={()=>void openWeb(`/patients/${chart.patient.id}/evidence`)}/><Button label="Open patient Twin" icon="file-document-outline" tone="quiet" onPress={()=>{const id=chart.patient.id;setChart(null);setRows([]);setWork(null);setDashboard(null);setTwinPatient(id);}}/>{chart.superseded ? <Banner tone="notice" text="This record has been superseded. Open the surviving record in the web workspace." /> : null}{Object.entries(SECTIONS).map(([key, label]) => { const section = chart.sections[key]; if (!section) return null; const values = Array.isArray(section) ? section as RecordRow[] : null; return <View key={key}><Section title={label} />{values ? values.length ? values.map((r,i) => record(r,i)) : <Text style={styles.meta}>No {label.toLowerCase()} recorded.</Text> : <Text style={styles.meta}>{(section as { denied?: boolean }).denied ? "This section is restricted for your role." : "This section is unavailable. Pull to refresh."}</Text>}</View>; })}<Text style={styles.meta}>Financial amounts are shown only when your role permits access.</Text><WebAction label="Open full chart" path={`/patients/${chart.patient.id}/chart`} onOpen={openWeb} /></> : null}
      {!chart && !loading && !error && tab === "home" && dashboard ? <><Text style={styles.kickerDark}>{greeting()}, {firstName(session.displayName)}</Text><Text style={styles.title}>Your day, connected.</Text><Text style={styles.meta}>Current activity from your facility’s records.</Text><View style={styles.metrics}>{dashboard.metrics.slice(0,4).map((metric,index) => <MetricCard key={metric.label} label={metric.label} value={metric.count} detail={metric.detail} icon={metric.label.toLowerCase().includes("patient")?"account-group-outline":metric.label.toLowerCase().includes("appointment")?"calendar-outline":metric.label.toLowerCase().includes("encounter")?"stethoscope":"chart-box-outline"} index={index} onPress={()=>openMetric(metric)}/>)}</View><Section title="Activity overview" />{dashboard.metrics.map(metric => <View key={metric.label} style={styles.total}><Text style={styles.recordTitle}>{metric.label}</Text><Text style={styles.value}>{metric.count}</Text></View>)}{dashboard.metrics.length === 0 ? <Empty icon="shield-account-outline" text="No activity views are available for your current permissions." /> : null}{dashboard.mix.length ? <><Section title={dashboard.mixTitle} />{dashboard.mix.map(item => <View style={styles.total} key={item.label}><Text style={styles.meta}>{item.label}</Text><Text style={styles.value}>{item.count}</Text></View>)}</> : null}<WebAction label="Open web workspace" path="/dashboard" onOpen={openWeb} /></> : null}
      {!chart && tab === "patients" ? <><Section title="Patient directory" /><Field icon="magnify" accessibilityLabel="Search patients" placeholder="Name or MRN" value={query} onChangeText={setQuery} /><Button label="Search patients" icon="magnify" onPress={() => load("patients")} tone="quiet" />{rows.map((row,i) => record(row,i,true))}{!loading && !error && !rows.length ? <Empty icon="account-search-outline" text="No patients match this search at your facility." /> : null}<Text style={styles.small}>Up to 50 matches. Refine your search to find a specific record.</Text>{session.permissions.includes("patient.register") ? <WebAction label="Register a patient on web" path="/patients" onOpen={openWeb} /> : null}</> : null}
      {!chart && !loading && !error && (tab === "appointments" || tab === "charges") ? <><Section title={tab === "appointments" ? "Appointments" : "Charges"} />{rows.length ? rows.map((row,i) => record(row,i)) : <Empty icon="clipboard-outline" text="No records are available for this view." />}{tab === "appointments" ? <Text style={styles.small}>Showing up to 50 appointments, ordered by start time.</Text> : null}<WebAction label={tab === "appointments" ? "Manage visits on web" : "Manage charges on web"} path={tab === "appointments" ? "/appointments" : "/billing"} onOpen={openWeb} /></> : null}
      {!chart && !loading && !error && tab === "work" && work ? <>{Object.entries(work).filter(([,value]) => Array.isArray(value)).map(([key,value]) => <View key={key}><Section title={SECTIONS[key] ?? key} />{value.length ? value.map((row,i) => record(row,i)) : <Text style={styles.meta}>No pending {key}.</Text>}</View>)}<WebAction label="Manage work on web" path="/work" onOpen={openWeb} /></> : null}
      {!chart && tab === "account" ? <><Section title="Account & workspace" /><Card><Text style={styles.recordTitle}>{session.displayName}</Text><Text style={styles.meta}>{session.facilityName ?? session.organizationName}</Text><Text style={styles.meta}>This isolated workspace contains synthetic clinical and operational records. External orders, prescriptions, claims transmission, and payment collection remain disabled.</Text><Text style={styles.meta}>Records are loaded on demand and are not stored for offline access. Signing out revokes the server session.</Text></Card><WebAction label="Account settings on web" path="/account" onOpen={openWeb} />{session.permissions.includes("terminology.read") ? <WebAction label="Terminology registry on web" path="/terminology" onOpen={openWeb} /> : null}<Button label={signingOut ? "Signing out…" : "Sign out"} icon="logout" onPress={signOut} busy={signingOut} tone="dark" /></> : null}
      {synced && !loading && !chart ? <Text style={styles.sync}>Updated {synced.slice(11,19)} UTC · Source records</Text> : null}
      {error && session ? <Button label="Try again" icon="refresh" tone="quiet" onPress={() => load()} /> : null}
    </ScrollView>
  </View>;
}
function WebAction({ label, path, onOpen }: { label: string; path: string; onOpen: (path: string) => void }) {
  return <View style={styles.webAction}><Button label={label} icon="open-in-new" tone="quiet" onPress={() => onOpen(path)} /><Text style={styles.small}>Editing opens the full workspace in your browser. You may need to sign in.</Text></View>;
}
const styles = StyleSheet.create({
  visitCard:{gap:14,marginTop:8},visitDate:{width:54,height:60,borderRadius:12,borderWidth:1,borderColor:"#d6e6e0",backgroundColor:"#edf6f1",alignItems:"center",justifyContent:"center",gap:3},visitMonth:{fontSize:11,fontWeight:"600",color:color.primary,textTransform:"uppercase"},visitDay:{fontSize:22,fontWeight:"600",color:color.ink},visitState:{alignSelf:"flex-start",marginTop:6,fontSize:11,fontWeight:"600",color:color.primary,backgroundColor:"#eaf4ee",paddingHorizontal:8,paddingVertical:4,borderRadius:5,textTransform:"capitalize"},identityPanel:{gap:17},identityGrid:{flexDirection:"row",flexWrap:"wrap",gap:16},identityFact:{width:"46%",gap:5},
  screen: { flex:1, backgroundColor:color.canvas }, flex:{flex:1}, row:{flexDirection:"row",alignItems:"center",gap:12},
  hero:{backgroundColor:color.ink,padding:28,paddingTop:55,gap:10}, kicker:{color:"#c8d9bd",fontSize:10,fontWeight:"700",letterSpacing:2,marginTop:12}, heroTitle:{color:"#faf9ec",fontSize:38,fontWeight:"500",letterSpacing:-1},heroBody:{color:"#c0d3c5",fontSize:14,lineHeight:22},
  header:{backgroundColor:color.ink,paddingTop:50,paddingBottom:22,paddingHorizontal:24,flexDirection:"row",alignItems:"center",gap:12},facility:{color:"#faf9ec",fontSize:17,fontWeight:"500",marginTop:6},
  tabs:{flexGrow:0,flexShrink:0,height:76,backgroundColor:color.surface,borderBottomWidth:1,borderBottomColor:color.hairline},tabContent:{paddingHorizontal:16,gap:6},tab:{padding:15,alignItems:"center",gap:6,minWidth:68,borderBottomWidth:3,borderBottomColor:"transparent"},activeTab:{borderBottomColor:color.primary},tabText:{fontSize:12,color:color.muted},activeText:{color:color.primary,fontWeight:"700"},
  content:{padding:22,gap:14,paddingBottom:45,width:"100%",maxWidth:920,alignSelf:"center"},title:{fontSize:28,fontWeight:"600",color:color.ink,letterSpacing:-.8},sectionTitle:{fontSize:19,fontWeight:"600",color:color.ink},kickerDark:{fontSize:11,fontWeight:"600",color:color.primary,letterSpacing:1},meta:{color:color.muted,fontSize:12,lineHeight:20},small:{color:color.muted,fontSize:12,lineHeight:19},
  record:{marginTop:8},recordTitle:{fontSize:14,fontWeight:"600",color:color.ink},recordDot:{height:7,width:7,backgroundColor:color.primary,borderRadius:4},value:{fontSize:15,fontWeight:"600",color:color.ink,marginTop:3},
  metrics:{flexDirection:"row",flexWrap:"wrap",gap:12,marginTop:14},metric:{width:"47%",gap:8,minWidth:120},metricValue:{fontSize:36,fontWeight:"500",color:color.ink,letterSpacing:-1},total:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",paddingVertical:12,borderBottomWidth:1,borderBottomColor:color.hairline},chartIdentity:{flexDirection:"row",alignItems:"center",gap:12,marginTop:16},sync:{textAlign:"center",fontSize:10,color:color.muted,marginTop:12},webAction:{gap:8,marginTop:20},
});
