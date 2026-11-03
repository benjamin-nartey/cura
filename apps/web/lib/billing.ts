import { createHash } from "node:crypto";

// Hash the complete tuple: long identifiers and reasons must not collide after truncation.
export function billingKey(parts: string[]) {
  return `bill-${createHash("sha256").update(JSON.stringify(parts)).digest("hex")}`;
}
