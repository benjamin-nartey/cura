import { ConflictError } from "@curasphere/domain";
import { failureCode } from "@/lib/http";

export function scheduleError(error: unknown) {
  if (error instanceof ConflictError) {
    if (error.message.includes("already reserved")) return "slot";
    if (error.message.includes("changed")) return "stale";
    if (error.message.includes("window")) return "window";
    return "conflict";
  }
  return failureCode(error);
}

export function clockLabel(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function commandKey(prefix: string, parts: string[]) {
  const key = `${prefix}-${parts.join("-")}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return key.length >= 8 ? key : `${prefix}-schedule`;
}
