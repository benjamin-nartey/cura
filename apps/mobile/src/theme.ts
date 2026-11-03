export const color = {
  ink: "#173f3b",
  body: "#425557",
  muted: "#617267",
  faint: "#607361",
  hairline: "#dce5d8",
  canvas: "#f6f7f0",
  surface: "#fffefa",
  primary: "#235f54",
  primaryDeep: "#174a40",
  primarySoft: "#e5eee0",
  primaryWash: "#f0f4e8",
  accent: "#29695e",
  accentSoft: "#e0eee5",
  success: "#28654c",
  successSoft: "#dcfce7",
  danger: "#e11d48",
  dangerSoft: "#ffe4e6",
  violet: "#7c3aed",
  violetSoft: "#ede9fe",
};

export const shadow = {
  shadowColor: "#193e32",
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

export const lift = {
  shadowColor: "#174a40",
  shadowOpacity: 0.3,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 12 },
  elevation: 8,
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function clock(iso: string) {
  return iso.slice(11, 16);
}

export function dayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return `${DAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function dayParts(iso: string) {
  const date = new Date(iso);
  return { day: String(date.getUTCDate()), month: MONTHS[date.getUTCMonth()] ?? "", weekday: DAYS[date.getUTCDay()] ?? "" };
}

export function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function shiftDay(day: string, by: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + by);
  return isoDay(date);
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}

export function submissionKey(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.slice(0, 40);
}
