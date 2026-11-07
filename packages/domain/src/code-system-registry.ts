import { createHash, randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { authorize, effectivePermissions } from "./authorization";
import { writeAudit } from "./audit";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { assertLocalHealthcareSandbox } from "./experimental-healthcare";

export type ReleaseInput = { systemUri: string; name: string; version: string; edition: string; activeFrom: string; activeTo?: string | null; rights: "synthetic" | "reference-only"; sourceUrl: string; sourceNote: string; concepts?: { code: string; display: string }[]; idempotencyKey: string };
export type ControlledRelease = { id: string; organization_id: string; code_system_id: string; edition: string; active_from: string; active_to: string | null; rights_kind: ReleaseInput["rights"]; source_url: string; source_note: string; manifest_sha256: string; created_by: string; created_at: string; uri: string; name: string; version: string; concept_count: number };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const releaseSelect = `SELECT r.*, c.uri, c.name, c.version, (SELECT COUNT(*) FROM terminology_release_concepts p WHERE p.release_id = r.id) AS concept_count FROM terminology_releases r JOIN code_systems c ON c.id = r.code_system_id`;

export function assertTerminologyAccess(db: AppDatabase, ctx: SessionContext, permission: "terminology.read" | "terminology.manage" | "terminology.review" | "facility.catalog.manage") {
  assertLocalHealthcareSandbox();
  if (get<{ value: string }>(db, "SELECT value FROM terminology_registry_controls WHERE name = 'dependency'")?.value !== "available") throw new AppError("unavailable", "The terminology registry is unavailable.");
  const user = get<{ account_status: string }>(db, "SELECT account_status FROM users WHERE id = ?", ctx.userId);
  const access = effectivePermissions(db, ctx.userId, ctx.organizationId, ctx.facilityId);
  const decision = authorize(db, { principalId: ctx.userId, accountActive: user?.account_status === "active" }, permission, { type: "TerminologyRelease", organizationId: ctx.organizationId, facilityId: ctx.facilityId, sensitivity: "administrative" }, { purpose: ctx.purposeOfUse, assurance: "directory", sessionActive: Boolean(ctx.sessionId), activeFacilityId: ctx.facilityId });
  if (!decision.allow || !access.permissions.includes(permission)) {
    writeAudit(db, ctx, { action: permission, resourceType: "TerminologyRelease", resourceId: null, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function normalize(ctx: SessionContext, input: ReleaseInput) {
  const { systemUri, name, version, edition, activeFrom, sourceUrl, sourceNote, rights } = input;
  if (![systemUri,name,version,edition,activeFrom,sourceUrl,sourceNote].every(v => typeof v === "string") || !["synthetic","reference-only"].includes(rights)) throw new ValidationError();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey) || name.trim().length < 2 || name.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(version) || edition.trim().length < 1 || edition.length > 100 || sourceNote.trim().length < 10 || sourceNote.length > 500 || systemUri.length > 300) throw new ValidationError();
  if (!date(activeFrom) || input.activeTo && (!date(input.activeTo) || input.activeTo <= activeFrom)) throw new ValidationError("invalid", "Enter a valid release interval.");
  let source: URL;
  try { source = new URL(sourceUrl); } catch { throw new ValidationError(); }
  if (source.protocol !== "https:" || source.username || source.password || source.search || source.hash || sourceUrl.length > 500) throw new ValidationError("invalid", "Use an HTTPS provenance URL without credentials or query tokens.");
  const localPrefix = `urn:curasphere:synthetic:${ctx.organizationId}:`;
  if (rights === "synthetic" && (!systemUri.startsWith(localPrefix) || !/^[A-Za-z0-9:._-]+$/.test(systemUri))) throw new ForbiddenError("license", "Synthetic concepts require your organization’s synthetic namespace.");
  if (rights === "reference-only" && !/^https?:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~:/-]*)?$/.test(systemUri)) throw new ValidationError("invalid", "Use a canonical code-system URI for reference metadata.");
  if (input.concepts !== undefined && !Array.isArray(input.concepts)) throw new ValidationError();
  const concepts = input.concepts ?? [];
  if (concepts.length > 100 || rights === "reference-only" && concepts.length > 0) throw new ForbiddenError("license", "Official terminology content is not enabled by a metadata registration.");
  if (rights === "synthetic" && concepts.length === 0) throw new ValidationError("invalid", "Add at least one synthetic concept.");
  const seen = new Set<string>();
  for (const concept of concepts) {
    if (!concept || typeof concept.code !== "string" || typeof concept.display !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(concept.code) || concept.display.trim().length < 2 || concept.display.length > 200 || seen.has(concept.code)) throw new ValidationError("code", "Concept codes must be unique and have a description.");
    seen.add(concept.code);
  }
  return { systemUri, name: name.trim(), version, edition: edition.trim(), activeFrom, activeTo: input.activeTo || null, rights, sourceUrl: source.href, sourceNote: sourceNote.trim(), concepts: concepts.map(c => ({ code: c.code, display: c.display.trim() })).sort((a,b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0) };
}

export function registerCodeSystemRelease(db: AppDatabase, ctx: SessionContext, input: ReleaseInput) {
  assertTerminologyAccess(db, ctx, "terminology.manage");
  const value = normalize(ctx, input);
  const requestHash = digest({ actor: ctx.userId, ...value });
  return transaction(db, () => {
    const prior = get<{ request_hash: string; release_id: string }>(db, "SELECT request_hash, release_id FROM terminology_registry_commands WHERE organization_id = ? AND command_key = ?", ctx.organizationId, input.idempotencyKey);
    if (prior) {
      if (prior.request_hash !== requestHash) throw new ConflictError("duplicate", "This submission key belongs to different release metadata.");
      return { id: prior.release_id, replayed: true };
    }
    let system = get<{ id: string; name: string }>(db, "SELECT id, name FROM code_systems WHERE uri = ? AND version = ?", value.systemUri, value.version);
    if (system && system.name !== value.name) throw new ConflictError("conflict", "The canonical system and version already have a different name.");
    if (!system) {
      system = { id: `cs_${randomUUID()}`, name: value.name };
      run(db, "INSERT INTO code_systems (id, uri, name, version) VALUES (?, ?, ?, ?)", system.id, value.systemUri, value.name, value.version);
    }
    if (get(db, "SELECT id FROM terminology_releases WHERE organization_id = ? AND code_system_id = ?", ctx.organizationId, system.id)) throw new ConflictError("conflict", "This system version is already registered. Create a new version to change its metadata.");
    const id = `tr_${randomUUID()}`;
    const now = new Date().toISOString();
    run(db, `INSERT INTO terminology_releases (id, organization_id, code_system_id, edition, active_from, active_to, rights_kind, source_url, source_note, manifest_sha256, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, id, ctx.organizationId, system.id, value.edition, value.activeFrom, value.activeTo, value.rights, value.sourceUrl, value.sourceNote, digest(value), ctx.userId, now);
    for (const concept of value.concepts) {
      const existing = get<{ id: string; display: string }>(db, "SELECT id, display FROM concepts WHERE code_system_id = ? AND code = ?", system.id, concept.code);
      if (existing && existing.display !== concept.display) throw new ConflictError("conflict", "A concept already has a different description for this version.");
      const conceptId = existing?.id ?? `tc_${randomUUID()}`;
      if (!existing) run(db, "INSERT INTO concepts (id, code_system_id, code, display) VALUES (?, ?, ?, ?)", conceptId, system.id, concept.code, concept.display);
      run(db, "INSERT INTO terminology_release_concepts (release_id, concept_id) VALUES (?, ?)", id, conceptId);
    }
    run(db, "INSERT INTO terminology_registry_commands (organization_id, command_key, request_hash, release_id) VALUES (?, ?, ?, ?)", ctx.organizationId, input.idempotencyKey, requestHash, id);
    run(db, "INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'terminology.release.registered.v1', ?, ?)", randomUUID(), ctx.organizationId, JSON.stringify({ contractVersion: 1, releaseId: id, system: value.systemUri, version: value.version, manifestSha256: digest(value), rights: value.rights }), now);
    writeAudit(db, ctx, { action: "terminology.release.register", resourceType: "TerminologyRelease", resourceId: id, outcome: "success" });
    return { id, replayed: false };
  });
}

export function listCodeSystemReleases(db: AppDatabase, ctx: SessionContext, query = "") {
  assertTerminologyAccess(db, ctx, "terminology.read");
  const needle = query.trim().slice(0,80).toLowerCase().replace(/[%_]/g, "");
  writeAudit(db, ctx, { action: "terminology.release.list", resourceType: "TerminologyRelease", resourceId: null, outcome: "success" });
  return all<ControlledRelease>(db, `${releaseSelect} WHERE r.organization_id = ? AND (? = '' OR lower(c.name) LIKE ? OR lower(c.uri) LIKE ?) ORDER BY r.created_at DESC, r.id LIMIT 100`, ctx.organizationId, needle, `%${needle}%`, `%${needle}%`);
}
export function readCodeSystemRelease(db: AppDatabase, ctx: SessionContext, id: string) {
  assertTerminologyAccess(db, ctx, "terminology.read");
  const row = get<ControlledRelease>(db, `${releaseSelect} WHERE r.organization_id = ? AND r.id = ?`, ctx.organizationId, id);
  if (!row) throw new NotFoundError("That terminology release is not available.");
  const concepts = all<{ code: string; display: string }>(db, "SELECT c.code, c.display FROM terminology_release_concepts p JOIN concepts c ON c.id = p.concept_id WHERE p.release_id = ? ORDER BY c.code", row.id);
  writeAudit(db, ctx, { action: "terminology.release.read", resourceType: "TerminologyRelease", resourceId: row.id, outcome: "success" });
  return { ...row, concepts };
}
export function lookupControlledConcept(db: AppDatabase, ctx: SessionContext, system: string, version: string, code: string) {
  assertTerminologyAccess(db, ctx, "terminology.read");
  const release = get<ControlledRelease>(db, `${releaseSelect} WHERE r.organization_id = ? AND c.uri = ? AND c.version = ?`, ctx.organizationId, system, version);
  if (!release) throw new ValidationError("code", "The system and version are not registered.");
  if (release.rights_kind !== "synthetic") throw new ForbiddenError("license", "This is reference metadata. Terminology content is not enabled.");
  const today = new Date().toISOString().slice(0,10);
  if (release.active_from > today || release.active_to && release.active_to <= today) throw new ValidationError("code", "This release is not effective on the current date.");
  const concept = get<{ code: string; display: string }>(db, "SELECT c.code, c.display FROM terminology_release_concepts p JOIN concepts c ON c.id = p.concept_id WHERE p.release_id = ? AND c.code = ?", release.id, code);
  if (!concept) throw new ValidationError("code", "That code is not present in the registered version.");
  writeAudit(db, ctx, { action: "terminology.concept.lookup", resourceType: "TerminologyRelease", resourceId: release.id, outcome: "success" });
  return { system, version, code: concept.code, display: concept.display, edition: release.edition, releaseId: release.id, provenance: { sourceUrl: release.source_url, manifestSha256: release.manifest_sha256 }, synthetic: true };
}
