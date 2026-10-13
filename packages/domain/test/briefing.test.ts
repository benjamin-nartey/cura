import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURES, createDatabase, getChart, openSession, readSession, seed } from "../src/index.ts";

const SOURCE_TABLES = ["encounters", "conditions", "allergies", "medications", "observations", "appointments"];

test("elena's briefing cites only results stored after the finished encounter", () => {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, FIXTURES.amira);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  const chart = getChart(db, ctx, FIXTURES.elena, new Date("2026-10-08T12:00:00.000Z"));
  if (!chart) throw new Error("chart missing");
  assert.equal(chart.patient.ageYears, 67);
  assert.equal(chart.briefing.since, "2026-09-01T16:00:00.000Z");
  const text = chart.briefing.items.map((item) => item.text).join("\n");
  assert.match(text, /Potassium · 5\.4 mmol\/L · above 5 mmol\/L/);
  assert.match(text, /BNP · 480 pg\/mL/);
  assert.doesNotMatch(text, /4\.2/);
  assert.doesNotMatch(text, /recommend|should start|likely has/i);
  for (const item of chart.briefing.items) {
    assert.ok(chart.timeline.some((event) => event.sourceId === item.sourceId));
  }
  const sourceIds = new Set([
    ...chart.observations,
    ...chart.conditions,
    ...chart.allergies,
    ...chart.medications,
    ...chart.encounters,
  ].map((item) => item.id));
  for (const event of chart.timeline) {
    assert.ok(SOURCE_TABLES.includes(event.sourceTable));
    if (event.sourceTable !== "appointments") assert.ok(sourceIds.has(event.sourceId));
  }
  assert.ok(chart.timeline.some((event) => event.sourceId === FIXTURES.obsPotassiumNormal));
});

test("without a finished encounter the briefing does not replay the whole history", () => {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, FIXTURES.amira);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  const chart = getChart(db, ctx, FIXTURES.mateo);
  if (!chart) throw new Error("chart missing");
  assert.equal(chart.briefing.since, null);
  assert.equal(chart.briefing.items.length, 1);
  assert.match(chart.briefing.items[0].text, /Open encounter · Wheeze since yesterday/);
  assert.ok(chart.timeline.length > chart.briefing.items.length);
});
