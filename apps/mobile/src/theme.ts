export const color = {
  ink: "#18353b",
  body: "#425860",
  muted: "#566b74",
  faint: "#5e747a",
  hairline: "#dce5e8",
  canvas: "#f2f5f7",
  surface: "#ffffff",
  primary: "#196b60",
  primaryDeep: "#125348",
  primarySoft: "#e8f3ee",
  primaryWash: "#f0f6f4",
  accent: "#216f80",
  accentSoft: "#e5f1f2",
  success: "#28654c",
  successSoft: "#dcfce7",
  danger: "#e11d48",
  dangerSoft: "#ffe4e6",
  violet: "#7c3aed",
  violetSoft: "#ede9fe",
};

export const shadow = {
  shadowColor: "#193e32",
  shadowOpacity: 0.045,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 5 },
  elevation: 3,
};

export const lift = {
  shadowColor: "#125348",
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
