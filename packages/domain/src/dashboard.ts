import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { get, all, type AppDatabase } from "./db";
import { ForbiddenError } from "./errors";
import { canReadChart, canReviewAudit } from "./session";

export type DashboardMetric = {
  label: string;
  href: string;
  count: number;
  detail: string;
};

export type DashboardSlice = {
  label: string;
  count: number;
};

export type DashboardRow = {
  id: string;
  primary: string;
  secondary: string;
  href: string | null;
};

export type DashboardView = {
  metrics: DashboardMetric[];
  mixTitle: string;
  mix: DashboardSlice[];
  listTitle: string;
  rows: DashboardRow[];
};

function tally(db: AppDatabase, sql: string, ...params: Array<string | null>) {
  return Number(get<{ c: number }>(db, sql, ...params)?.c ?? 0);
}

function scoped(db: AppDatabase, table: string, ctx: SessionContext, facility: boolean) {
  if (facility && ctx.facilityId) {
    return tally(db, `SELECT COUNT(*) AS c FROM ${table} WHERE organization_id = ? AND facility_id = ?`, ctx.organizationId, ctx.facilityId);
  }
  return tally(db, `SELECT COUNT(*) AS c FROM ${table} WHERE organization_id = ?`, ctx.organizationId);
}

function statusMix(db: AppDatabase, table: string, ctx: SessionContext, facility: boolean): DashboardSlice[] {
  const rows = facility && ctx.facilityId
    ? all<{ status: string; c: number }>(
        db,
        `SELECT status, COUNT(*) AS c FROM ${table} WHERE organization_id = ? AND facility_id = ? GROUP BY status ORDER BY status`,
        ctx.organizationId,
        ctx.facilityId,
      )
    : all<{ status: string; c: number }>(
        db,
        `SELECT status, COUNT(*) AS c FROM ${table} WHERE organization_id = ? GROUP BY status ORDER BY status`,
        ctx.organizationId,
      );
  return rows.map((row) => ({ label: row.status, count: Number(row.c) }));
}

function chartView(db: AppDatabase, ctx: SessionContext): DashboardView {
  if (!ctx.facilityId) throw new ForbiddenError();
  const facilityId = ctx.facilityId;
  const day = new Date().toISOString().slice(0, 10);
  const patients = scoped(db, "patients", ctx, true);
  const visits = tally(
    db,
    `SELECT COUNT(*) AS c FROM appointments WHERE organization_id = ? AND facility_id = ? AND status = 'booked' AND starts_at LIKE ?`,
    ctx.organizationId,
    facilityId,
    `${day}%`,
  );
  const openEncounters = tally(
    db,
    `SELECT COUNT(*) AS c FROM encounters WHERE organization_id = ? AND facility_id = ? AND status = 'in-progress'`,
    ctx.organizationId,
    facilityId,
  );
  const metrics: DashboardMetric[] = [
    { label: "Patients", href: "/patients", count: patients, detail: "On this facility record" },
    { label: "Appointments", href: "/worklist", count: visits, detail: "Booked on this UTC date" },
    { label: "Open encounters", href: "/worklist", count: openEncounters, detail: "Still in progress" },
    { label: "Results", href: "/patients", count: scoped(db, "observations", ctx, true), detail: "Stored observations" },
    { label: "Problems", href: "/patients", count: scoped(db, "conditions", ctx, true), detail: "Stored conditions" },
    { label: "Allergies", href: "/patients", count: scoped(db, "allergies", ctx, true), detail: "Stored allergies" },
    { label: "Medications", href: "/patients", count: scoped(db, "medications", ctx, true), detail: "Stored medication rows" },
    { label: "Lab orders", href: "/patients", count: scoped(db, "lab_orders", ctx, true), detail: "Stored lab orders" },
    { label: "Pharmacy orders", href: "/patients", count: scoped(db, "rx_orders", ctx, true), detail: "Stored medication orders" },
    { label: "Referrals", href: "/coordination", count: tally(db, `SELECT COUNT(*) AS c FROM care_referrals WHERE organization_id = ? AND (from_facility_id = ? OR to_facility_id = ?)`, ctx.organizationId, facilityId, facilityId), detail: "Sent or received here" },
    { label: "Care tasks", href: "/coordination", count: scoped(db, "care_tasks", ctx, true), detail: "Stored tasks" },
    { label: "Imaging studies", href: "/imaging", count: scoped(db, "imaging_studies", ctx, true), detail: "Stored studies" },
    { label: "Devices", href: "/devices", count: scoped(db, "devices", ctx, true), detail: "Stored device rows" },
    { label: "Agent runs", href: "/agents", count: scoped(db, "agent_runs", ctx, true), detail: "Runs at this facility" },
    { label: "Gateway attempts", href: "/gateway", count: scoped(db, "gateway_attempts", ctx, true), detail: "Attempts for this facility" },
    { label: "Operations counts", href: "/operations", count: scoped(db, "operations_inventory", ctx, true), detail: "On-hand inventory rows" },
    { label: "Note drafts", href: "/patients", count: scoped(db, "documentation_drafts", ctx, true), detail: "Documentation drafts" },
  ];
  const people = all<{ id: string; given_name: string; family_name: string; mrn: string }>(
    db,
    `SELECT id, given_name, family_name, mrn FROM patients WHERE organization_id = ? AND facility_id = ? ORDER BY family_name, given_name LIMIT 8`,
    ctx.organizationId,
    facilityId,
  );
  return {
    metrics,
    mixTitle: "Encounters",
    mix: statusMix(db, "encounters", ctx, true),
    listTitle: "Patients",
    rows: people.map((row) => ({
      id: row.id,
      primary: `${row.given_name} ${row.family_name}`,
      secondary: row.mrn,
      href: `/patients/${row.id}`,
    })),
  };
}

function auditorView(db: AppDatabase, ctx: SessionContext): DashboardView {
  const metrics: DashboardMetric[] = [
    { label: "Audit events", href: "/audit", count: scoped(db, "audit_events", ctx, false), detail: "Stored for this organization" },
    { label: "Analytics facts", href: "/analytics", count: scoped(db, "analytics_facts", ctx, false), detail: "Ingested facts" },
    { label: "Population builds", href: "/population", count: scoped(db, "population_state", ctx, false), detail: "Stored population rows" },
    { label: "Research workspaces", href: "/research", count: scoped(db, "research_workspaces", ctx, false), detail: "Stored workspaces" },
    { label: "Research datasets", href: "/research", count: scoped(db, "research_datasets", ctx, false), detail: "Stored datasets" },
    { label: "Evaluations", href: "/evaluation", count: scoped(db, "eval_runs", ctx, false), detail: "Stored evaluation runs" },
    { label: "Release dossiers", href: "/release-train", count: scoped(db, "release_dossiers", ctx, false), detail: "Stored dossiers" },
    { label: "Modules", href: "/modules", count: scoped(db, "ai_modules", ctx, false), detail: "Stored module rows" },
    { label: "Marketplace listings", href: "/marketplace", count: scoped(db, "marketplace_listings", ctx, false), detail: "Stored listings" },
  ];
  const events = all<{ id: string; action: string; resource_type: string; outcome: string }>(
    db,
    `SELECT id, action, resource_type, outcome FROM audit_events WHERE organization_id = ? ORDER BY created_at DESC LIMIT 8`,
    ctx.organizationId,
  );
  return {
    metrics,
    mixTitle: "Audit outcomes",
    mix: all<{ outcome: string; c: number }>(
      db,
      `SELECT outcome, COUNT(*) AS c FROM audit_events WHERE organization_id = ? GROUP BY outcome ORDER BY outcome`,
      ctx.organizationId,
    ).map((row) => ({ label: row.outcome, count: Number(row.c) })),
    listTitle: "Recent audit",
    rows: events.map((row) => ({
      id: row.id,
      primary: row.action,
      secondary: `${row.resource_type} · ${row.outcome}`,
      href: "/audit",
    })),
  };
}

function adminView(db: AppDatabase, ctx: SessionContext): DashboardView {
  const metrics: DashboardMetric[] = [
    { label: "Invoices", href: "/revenue", count: scoped(db, "revenue_invoices", ctx, false), detail: "Stored for this organization" },
    { label: "Payments", href: "/revenue", count: scoped(db, "revenue_payments", ctx, false), detail: "Stored payments" },
    { label: "Claims", href: "/revenue", count: scoped(db, "revenue_claims", ctx, false), detail: "Stored claims" },
    { label: "Eligibility checks", href: "/revenue", count: scoped(db, "revenue_eligibility", ctx, false), detail: "Stored checks" },
    { label: "Residency", href: "/enterprise", count: scoped(db, "enterprise_residency", ctx, false), detail: "Pinned region rows" },
    { label: "Federation", href: "/enterprise", count: scoped(db, "enterprise_federation", ctx, false), detail: "Federation rows" },
    { label: "Keys", href: "/enterprise", count: scoped(db, "enterprise_keys", ctx, false), detail: "Key rows" },
    { label: "Recovery drills", href: "/enterprise", count: scoped(db, "enterprise_drills", ctx, false), detail: "Stored drills" },
    { label: "Break-glass grants", href: "/enterprise", count: scoped(db, "enterprise_grants", ctx, false), detail: "Stored grants" },
    { label: "Marketplace listings", href: "/marketplace", count: scoped(db, "marketplace_listings", ctx, false), detail: "Stored listings" },
    { label: "Audit events", href: "/audit", count: scoped(db, "audit_events", ctx, false), detail: "Stored for this organization" },
  ];
  const invoices = all<{ id: string; service_label: string; amount_cents: number }>(
    db,
    `SELECT id, service_label, amount_cents FROM revenue_invoices WHERE organization_id = ? ORDER BY created_at DESC LIMIT 8`,
    ctx.organizationId,
  );
  return {
    metrics,
    mixTitle: "Revenue rows",
    mix: [
      { label: "Invoices", count: metrics[0]?.count ?? 0 },
      { label: "Payments", count: metrics[1]?.count ?? 0 },
      { label: "Claims", count: metrics[2]?.count ?? 0 },
      { label: "Eligibility", count: metrics[3]?.count ?? 0 },
    ],
    listTitle: "Invoices",
    rows: invoices.map((row) => ({
      id: row.id,
      primary: row.service_label,
      secondary: `${Number(row.amount_cents)} cents`,
      href: "/revenue",
    })),
  };
}

export function readDashboard(db: AppDatabase, ctx: SessionContext): DashboardView {
  const view = canReadChart(ctx) ? chartView(db, ctx) : ctx.role === "admin" ? adminView(db, ctx) : canReviewAudit(ctx) ? auditorView(db, ctx) : chartView(db, ctx);
  writeAudit(db, ctx, { action: "dashboard.read", resourceType: "Dashboard", resourceId: ctx.facilityId, outcome: "success" });
  return view;
}
