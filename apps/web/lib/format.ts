import type { Role, PurposeOfUse, Sex } from "@curasphere/contracts";

export function roleLabel(role: Role) {
  if (role === "clinician") return "Clinician";
  if (role === "nurse") return "Nurse";
  if (role === "auditor") return "Auditor";
  if (role === "patient") return "Patient";
  return "Administrator";
}

export function purposeLabel(purpose: PurposeOfUse) {
  if (purpose === "TREATMENT") return "Treatment";
  if (purpose === "OPERATIONS") return "Operations";
  if (purpose === "PATIENT") return "Patient access";
  return "Audit";
}

export function sexLabel(sex: Sex) {
  if (sex === "female") return "Female";
  if (sex === "male") return "Male";
  if (sex === "other") return "Other";
  return "Unknown";
}

export function formatDay(isoDate: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

export function formatWhen(iso: string) {
  const value = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(iso));
  return `${value} UTC`;
}

export function formatClock(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(new Date(iso));
}
