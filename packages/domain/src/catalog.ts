export function interpretEntry(entry: { unit: string; low: number | null; high: number | null }, value: number) {
  if (entry.high !== null && value > entry.high) {
    return { interpretation: "high" as const, thresholdText: `above ${entry.high} ${entry.unit}` };
  }
  if (entry.low !== null && value < entry.low) {
    return { interpretation: "low" as const, thresholdText: `below ${entry.low} ${entry.unit}` };
  }
  return { interpretation: "normal" as const, thresholdText: "inside the configured bounds" };
}

export function formatQuantity(value: number) {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}
