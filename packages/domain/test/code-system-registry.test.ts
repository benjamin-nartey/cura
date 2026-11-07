import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDatabase, get, run } from "../src/db.ts";
import { seed } from "../src/seed.ts";
import { seedDemoTenants, DEMO_GH, DEMO_EU } from "../src/tenancy.ts";
import { openSession, readSession } from "../src/session.ts";
import { CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK } from "../src/code-system-schema.ts";
import { listCodeSystemReleases, lookupControlledConcept, readCodeSystemRelease, registerCodeSystemRelease, type ReleaseInput } from "../src/code-system-registry.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";
import { verifyAccessLedger } from "../src/access-ledger.ts";

process.env.CURASPHERE_ENV = "local"; process.env.CURASPHERE_DEV_DIRECTORY = "local-test"; process.env.CURASPHERE_DATA_CLASS = "synthetic"; process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE = "true";
function fixture(file = ":memory:") { const db = createDatabase(file); seed(db); seedDemoTenants(db); return db; }
function context(db: ReturnType<typeof fixture>, id: string = DEMO_GH.users.admin) { return readSession(db, openSession(db,id).sessionId)!; }
function input(org = DEMO_GH.organizationId): ReleaseInput { return { systemUri: `urn:curasphere:synthetic:${org}:visit-types`, name: "Visit types", version: "2026.11", edition: "Local", activeFrom: "2020-01-01", activeTo: "2090-01-01", rights: "synthetic", sourceUrl: "https://example.org/curasphere/synthetic-visit-types", sourceNote: "Locally authored synthetic workflow concepts for reproducible testing.", concepts: [{ code: "follow-up", display: "Follow-up visit" }], idempotencyKey: "registry-first-command" }; }

test("P05-F01-S01 release metadata, system/code/version and provenance persist across reopen", () => {
 const file=path.join(mkdtempSync(path.join(tmpdir(),"cura-terms-")),"terms.sqlite");let db=fixture(file);const ctx=context(db);const created=registerCodeSystemRelease(db,ctx,input());db.close();db=createDatabase(file);
 const row=readCodeSystemRelease(db,ctx,created.id);assert.equal(row.version,"2026.11");assert.equal(row.edition,"Local");assert.equal(row.concept_count,1);assert.match(row.manifest_sha256,/^[a-f0-9]{64}$/);const concept=lookupControlledConcept(db,ctx,input().systemUri,"2026.11","follow-up");assert.equal(concept.code,"follow-up");assert.equal(concept.provenance.manifestSha256,row.manifest_sha256);db.close();
});
test("P05-F01-S02 complete-payload idempotency and immutable registration reject conflicting changes", () => {
 const db=fixture();const ctx=context(db);const value=input();const created=registerCodeSystemRelease(db,ctx,value);assert.deepEqual(registerCodeSystemRelease(db,ctx,value),{id:created.id,replayed:true});assert.throws(()=>registerCodeSystemRelease(db,ctx,{...value,edition:"Changed"}),ConflictError);assert.throws(()=>registerCodeSystemRelease(db,ctx,{...value,idempotencyKey:"different-command"}),ConflictError);
 const row=readCodeSystemRelease(db,ctx,created.id);assert.throws(()=>run(db,"UPDATE terminology_releases SET source_note = 'changed provenance' WHERE id = ?",created.id),/immutable/);assert.throws(()=>run(db,"DELETE FROM terminology_releases WHERE id = ?",created.id),/immutable/);assert.throws(()=>run(db,"UPDATE code_systems SET version = 'rewritten' WHERE id = ?",row.code_system_id),/immutable/);assert.throws(()=>run(db,"UPDATE concepts SET display = 'rewritten' WHERE code_system_id = ?",row.code_system_id),/immutable/);assert.equal(get<{c:number}>(db,"SELECT COUNT(*) c FROM outbox WHERE event_type = 'terminology.release.registered.v1'")!.c,1);db.close();
});
test("P05-F01-S03 roles, foreign tenants, foreign synthetic namespaces and suspended accounts fail closed", () => {
 const db=fixture();const admin=context(db);const clinician=context(db,DEMO_GH.users.doctor);const foreign=context(db,DEMO_EU.users.admin);const created=registerCodeSystemRelease(db,admin,input());assert.equal(listCodeSystemReleases(db,clinician).length,1);assert.throws(()=>registerCodeSystemRelease(db,clinician,input()),ForbiddenError);assert.deepEqual(listCodeSystemReleases(db,foreign),[]);assert.throws(()=>readCodeSystemRelease(db,foreign,created.id),NotFoundError);assert.throws(()=>registerCodeSystemRelease(db,foreign,input()),ForbiddenError);run(db,"UPDATE users SET account_status = 'suspended' WHERE id = ?",admin.userId);assert.throws(()=>listCodeSystemReleases(db,admin),ForbiddenError);db.close();
});
test("P05-F01-S04 official content cannot be imported, looked up or enabled through reference metadata", () => {
 const db=fixture();const ctx=context(db);const reference={...input(),systemUri:"http://loinc.org",name:"LOINC",version:"metadata-reference",rights:"reference-only" as const,concepts:[]};const created=registerCodeSystemRelease(db,ctx,reference);assert.equal(readCodeSystemRelease(db,ctx,created.id).concept_count,0);assert.throws(()=>lookupControlledConcept(db,ctx,reference.systemUri,reference.version,"8480-6"),ForbiddenError);assert.throws(()=>registerCodeSystemRelease(db,ctx,{...reference,version:"other",concepts:[{code:"8480-6",display:"Copied content"}]}),ForbiddenError);assert.throws(()=>registerCodeSystemRelease(db,ctx,{...reference,version:"third",rights:"synthetic",concepts:input().concepts}),ForbiddenError);db.close();
});
test("P05-F01-S05 unknown codes, versions and ineffective intervals are rejected", () => {
 const db=fixture();const ctx=context(db);registerCodeSystemRelease(db,ctx,input());assert.throws(()=>lookupControlledConcept(db,ctx,input().systemUri,"missing","follow-up"),ValidationError);assert.throws(()=>lookupControlledConcept(db,ctx,input().systemUri,input().version,"unknown"),ValidationError);registerCodeSystemRelease(db,ctx,{...input(),version:"expired",activeFrom:"2000-01-01",activeTo:"2001-01-01",idempotencyKey:"expired-release"});assert.throws(()=>lookupControlledConcept(db,ctx,input().systemUri,"expired","follow-up"),ValidationError);db.close();
});
test("P05-F01-S06 validation and transaction failure leave no partial rows or events", () => {
 const db=fixture();const ctx=context(db);
 for(const patch of [{activeFrom:"2026-02-30"},{activeTo:"2010-01-01"},{sourceUrl:"javascript:alert(1)"},{sourceUrl:"https://user:secret@example.org/private"},{sourceUrl:"https://example.org/file?token=secret"},{edition:"   "},{concepts:[...input().concepts!,...input().concepts!]}]) assert.throws(()=>registerCodeSystemRelease(db,ctx,{...input(),...patch}));
 db.exec("CREATE TRIGGER registry_outbox_failure BEFORE INSERT ON outbox WHEN NEW.event_type = 'terminology.release.registered.v1' BEGIN SELECT RAISE(ABORT,'outbox unavailable'); END;");assert.throws(()=>registerCodeSystemRelease(db,ctx,input()),/outbox unavailable/);assert.equal(listCodeSystemReleases(db,ctx).length,0);assert.equal(get<{c:number}>(db,"SELECT COUNT(*) c FROM terminology_registry_commands")!.c,0);assert.equal(get(db,"SELECT id FROM code_systems WHERE uri = ?",input().systemUri),undefined);db.close();
});
test("P05-F01-S07 committed pins cannot be extended and audit chain remains verifiable", () => {
 const db=fixture();const ctx=context(db);const created=registerCodeSystemRelease(db,ctx,input());const row=readCodeSystemRelease(db,ctx,created.id);const code=get<{id:string}>(db,"SELECT id FROM concepts WHERE code_system_id = ?",row.code_system_id)!;assert.throws(()=>run(db,"INSERT INTO terminology_release_concepts (release_id,concept_id) VALUES (?,?)",created.id,code.id),/restricted or sealed/);assert.equal(verifyAccessLedger(db,ctx.organizationId).intact,true);db.close();
});
test("P05-F01-S08 schema 43 upgrades atomically, failed 44 leaves no marker, and repair recovers", () => {
 const file=path.join(mkdtempSync(path.join(tmpdir(),"cura-terms-upgrade-")),"terms.sqlite");let db=fixture(file);const patients=get<{c:number}>(db,"SELECT COUNT(*) c FROM patients")!.c;db.exec(CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK);db.exec("CREATE TABLE terminology_releases (unexpected TEXT)");db.close();assert.throws(()=>createDatabase(file),/already exists/);const raw=new DatabaseSync(file);assert.equal((raw.prepare("SELECT MAX(version) v FROM schema_migrations").get() as {v:number}).v,43);assert.equal(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'terminology_registry_commands'").get(),undefined);raw.exec("DROP TABLE terminology_releases");raw.close();db=createDatabase(file);assert.equal(get<{v:number}>(db,"SELECT MAX(version) v FROM schema_migrations")!.v,63);assert.equal(get<{c:number}>(db,"SELECT COUNT(*) c FROM patients")!.c,patients);db.close();
});
test("P05-F01-S09 dependency failure and protected environments cannot register content", () => {
 const db=fixture();const ctx=context(db);run(db,"UPDATE terminology_registry_controls SET value = 'unavailable'");assert.throws(()=>listCodeSystemReleases(db,ctx),/unavailable/);run(db,"UPDATE terminology_registry_controls SET value = 'available'");const before=process.env.CURASPHERE_ENV;try { process.env.CURASPHERE_ENV="production";assert.throws(()=>registerCodeSystemRelease(db,ctx,input()),ForbiddenError); } finally {process.env.CURASPHERE_ENV=before;}db.close();
});
