import { TERMINOLOGY_MAPPING_FIXTURE_ROLLBACK } from "../src/terminology-mapping-schema.ts";
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
import { registerCodeSystemRelease } from "../src/code-system-registry.ts";
import { listControlledValueSets, readControlledValueSet, registerControlledValueSet, validateControlledMembership, inspectUnitConversion } from "../src/terminology-validation.ts";
import { convertRestrictedQuantity, UNIT_PACK_VERSION } from "../src/unit-conversion.ts";
import { verifyAccessLedger } from "../src/access-ledger.ts";

process.env.CURASPHERE_ENV="local";process.env.CURASPHERE_DEV_DIRECTORY="local-test";process.env.CURASPHERE_DATA_CLASS="synthetic";process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE="true";
function fixture(file=":memory:"){const db=createDatabase(file);seed(db);seedDemoTenants(db);return db;}
function context(db:ReturnType<typeof fixture>,id:string=DEMO_GH.users.admin){return readSession(db,openSession(db,id).sessionId)!;}
const member={system:`urn:curasphere:synthetic:${DEMO_GH.organizationId}:lab-workflow`,version:"2026.11",code:"hba1c-review"};
const setInput={name:"Local laboratory workflow",version:"2026.11",members:[member],idempotencyKey:"value-set-first-command"};
function release(db:ReturnType<typeof fixture>,ctx:ReturnType<typeof context>){return registerCodeSystemRelease(db,ctx,{systemUri:member.system,name:"Laboratory workflow",version:member.version,edition:"Local simulation",rights:"synthetic",activeFrom:"2020-01-01",sourceUrl:"https://example.org/laboratory-workflow",sourceNote:"Locally authored synthetic workflow; no licensed clinical content.",concepts:[{code:member.code,display:"HbA1c review workflow"},{code:"cbc-review",display:"CBC review workflow"}],idempotencyKey:"lab-workflow-release"});}
const convert=(value:string,from:string,to:string,precision=3)=>convertRestrictedQuantity({value,from,to,precision,packVersion:UNIT_PACK_VERSION});

test("P05-F02-S01 persisted sets pin system/code/version and digest across restart",()=>{
 const file=path.join(mkdtempSync(path.join(tmpdir(),"cura-valueset-")),"test.sqlite");let db=fixture(file);const ctx=context(db);release(db,ctx);const saved=registerControlledValueSet(db,ctx,setInput);db.close();db=createDatabase(file);
 const row=readControlledValueSet(db,ctx,saved.id);assert.equal(row.member_count,1);assert.match(row.manifest_sha256,/^[a-f0-9]{64}$/);assert.equal(row.members[0].version,member.version);assert.equal(validateControlledMembership(db,ctx,{...member,valueSetId:saved.id}).valid,true);assert.equal(verifyAccessLedger(db,ctx.organizationId).intact,true);db.close();
});
test("P05-F02-S02 retries, conflicts, immutable members and sealed pins",()=>{
 const db=fixture();const ctx=context(db);release(db,ctx);const saved=registerControlledValueSet(db,ctx,setInput);assert.deepEqual(registerControlledValueSet(db,ctx,setInput),{...saved,replayed:true});assert.throws(()=>registerControlledValueSet(db,ctx,{...setInput,name:"Changed set"}),/different/);assert.throws(()=>registerControlledValueSet(db,ctx,{...setInput,idempotencyKey:"new-command-for-existing"}),/already exists/);
 assert.throws(()=>run(db,"UPDATE terminology_value_sets SET version = 'changed' WHERE id = ?",saved.id),/immutable/);assert.throws(()=>run(db,"DELETE FROM terminology_value_set_members WHERE value_set_id = ?",saved.id),/immutable/);
 const pin=get<{release_id:string;concept_id:string}>(db,"SELECT release_id,concept_id FROM terminology_release_concepts LIMIT 1")!;assert.throws(()=>run(db,"INSERT INTO terminology_value_set_members VALUES(?,?,?)",saved.id,pin.release_id,pin.concept_id),/sealed/);db.close();
});
test("P05-F02-S03 tenant, role and suspended-account restrictions",()=>{
 const db=fixture();const ctx=context(db);release(db,ctx);const saved=registerControlledValueSet(db,ctx,setInput);const foreign=context(db,DEMO_EU.users.admin);assert.equal(listControlledValueSets(db,foreign).length,0);assert.throws(()=>readControlledValueSet(db,foreign,saved.id),/not available/);assert.throws(()=>validateControlledMembership(db,foreign,{...member,valueSetId:saved.id}));const doctor=context(db,DEMO_GH.users.doctor);assert.equal(validateControlledMembership(db,doctor,{...member,valueSetId:saved.id}).valid,true);assert.throws(()=>registerControlledValueSet(db,doctor,setInput));run(db,"UPDATE users SET account_status='suspended' WHERE id=?",doctor.userId);assert.throws(()=>inspectUnitConversion(db,doctor,{value:"70",from:"kg",to:"g",precision:0,packVersion:UNIT_PACK_VERSION}));db.close();
});
test("P05-F02-S04 unknown, nonmember, wrong-version and expired release fail safely",()=>{
 const db=fixture();const ctx=context(db);release(db,ctx);const saved=registerControlledValueSet(db,ctx,setInput);
 for(const patch of [{code:"unknown"},{code:"cbc-review"},{version:"unknown"},{system:"urn:unknown"}]) assert.throws(()=>validateControlledMembership(db,ctx,{...member,...patch,valueSetId:saved.id}));
 registerCodeSystemRelease(db,ctx,{systemUri:member.system,name:"Laboratory workflow",version:"expired",edition:"Old",rights:"synthetic",activeFrom:"2000-01-01",activeTo:"2001-01-01",sourceUrl:"https://example.org/workflow",sourceNote:"Locally authored historical test workflow content.",concepts:[{code:member.code,display:"HbA1c review workflow"}],idempotencyKey:"expired-code-system"});assert.throws(()=>registerControlledValueSet(db,ctx,{...setInput,version:"expired-test",idempotencyKey:"expired-value-set-test",members:[{...member,version:"expired"}]}),/not effective/);
 assert.throws(()=>registerControlledValueSet(db,ctx,{...setInput,members:[member,member]}),/duplicate/);db.close();
});
test("P05-F02-S05 exact scale, offset and deterministic rounding golden oracles",()=>{
 for(const [value,from,to,expected] of [["72.45","kg","g","72450.000"],["165","cm","m","1.650"],["1500","mL","L","1.500"],["98.6","[degF]","Cel","37.000"],["0","Cel","K","273.150"],["100","mg/dL","g/L","1.000"],["5","mmol/L","mol/L","0.005"]]) assert.equal(convert(value,from,to).output.value,expected);
 assert.equal(convert("1.005","g","g",2).output.value,"1.01");assert.equal(convert("-1.005","g","g",2).output.value,"-1.01");assert.equal(convert("-0.0001","g","g",2).output.value,"0.00");assert.equal(convert("1","kg","g",0).output.value,"1000");assert.equal(convert("0","Cel","[degF]",6).output.value,"32.000000");assert.equal(convert("100","mg/dL","g/L").canonical.unit,"g/L");
});
test("P05-F02-S06 dimensions, aliases, input bounds and unsupported pack fail closed",()=>{
 for(const [from,to] of [["kg","L"],["mg/dL","mmol/L"],["U","g"],["ml","L"],["toString","g"],["__proto__","kg"],["mmHg","K"]]) assert.throws(()=>convert("1",from,to));
 for(const value of ["NaN","Infinity","1e3","1,5"," 1","+1","01","1.0000000001","1000000000000",""]) assert.throws(()=>convert(value,"kg","g"));
 assert.throws(()=>convert("-273.151","Cel","K"),/absolute zero/);assert.throws(()=>convert("1","g","g",7));assert.throws(()=>convertRestrictedQuantity({value:"1",from:"g",to:"g",precision:2,packVersion:"unknown"}));
});
test("P05-F02-S07 failed outbox write leaves no partial set, receipt or members",()=>{
 const db=fixture();const ctx=context(db);release(db,ctx);db.exec("CREATE TRIGGER fail_set_outbox BEFORE INSERT ON outbox WHEN NEW.event_type='terminology.valueset.registered.v1' BEGIN SELECT RAISE(ABORT,'outbox unavailable'); END");assert.throws(()=>registerControlledValueSet(db,ctx,setInput),/outbox unavailable/);assert.equal(listControlledValueSets(db,ctx).length,0);assert.equal(get<{n:number}>(db,"SELECT COUNT(*) n FROM terminology_value_set_commands")!.n,0);assert.equal(get<{n:number}>(db,"SELECT COUNT(*) n FROM terminology_value_set_members")!.n,0);db.close();
});
test("P05-F02-S08 schema 44 upgrade failure rolls back and repair preserves patients and releases",()=>{
 const file=path.join(mkdtempSync(path.join(tmpdir(),"cura-valueset-upgrade-")),"test.sqlite");let db=fixture(file);const ctx=context(db);const saved=release(db,ctx);const count=get<{n:number}>(db,"SELECT COUNT(*) n FROM patients")!.n;
 db.exec(TERMINOLOGY_MAPPING_FIXTURE_ROLLBACK);db.exec("DROP TABLE terminology_value_set_commands; DROP TABLE terminology_value_set_members; DROP TABLE terminology_value_sets; DELETE FROM schema_migrations WHERE version=45; CREATE TABLE terminology_value_sets(unexpected TEXT)");db.close();assert.throws(()=>createDatabase(file),/already exists/);const raw=new DatabaseSync(file);assert.equal((raw.prepare("SELECT MAX(version) v FROM schema_migrations").get() as {v:number}).v,44);assert.equal(raw.prepare("SELECT name FROM sqlite_master WHERE name='terminology_value_set_commands'").get(),undefined);raw.exec("DROP TABLE terminology_value_sets");raw.close();db=createDatabase(file);assert.equal(get<{v:number}>(db,"SELECT MAX(version) v FROM schema_migrations")!.v,63);assert.equal(get<{n:number}>(db,"SELECT COUNT(*) n FROM patients")!.n,count);assert.ok(get(db,"SELECT id FROM terminology_releases WHERE id=?",saved.id));db.close();
});
test("P05-F02-S09 dependency outage and production deny inspection and ledger remains intact",()=>{
 const db=fixture();const ctx=context(db);const input={value:"70",from:"kg",to:"g",precision:0,packVersion:UNIT_PACK_VERSION};assert.equal(inspectUnitConversion(db,ctx,input).output.value,"70000");assert.throws(()=>inspectUnitConversion(db,ctx,{...input,to:"L"}));assert.equal(verifyAccessLedger(db,ctx.organizationId).intact,true);run(db,"UPDATE terminology_registry_controls SET value='unavailable'");assert.throws(()=>inspectUnitConversion(db,ctx,input),/unavailable/);run(db,"UPDATE terminology_registry_controls SET value='available'");const env=process.env.CURASPHERE_ENV;try{process.env.CURASPHERE_ENV="production";assert.throws(()=>inspectUnitConversion(db,ctx,input));}finally{process.env.CURASPHERE_ENV=env;}db.close();
});
