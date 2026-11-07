import assert from "node:assert/strict";
import test from "node:test";
import {readCopilotContext} from "../src/copilot-context";
import {correctObservation,setSourceDependency} from "../src/clinical-source";
import {rebuildTwinProjection} from "../src/twin-projection";
import {sourceScenario} from "./fhir-source-fixtures";

test("copilot context withholds unauthorized and unavailable sources and exposes only bounded references", () => {
  const {db,doctor,nurse,foreign,common,records} = sourceScenario();
  try {
    assert.throws(() => readCopilotContext(db,nurse,common.patientId),{code:"forbidden"});
    assert.throws(() => readCopilotContext(db,{...nurse,role:"clinician"},common.patientId),{code:"forbidden"});
    assert.throws(() => readCopilotContext(db,foreign,common.patientId),{code:"notfound"});
    const first = readCopilotContext(db,doctor,common.patientId);
    assert.equal(first.sources.twin.status,"not-built");
    assert.equal(first.sources.timeline.status,"available");
    assert.equal(first.sources.evidence.status,"available");
    rebuildTwinProjection(db,doctor,common.patientId,"copilot-context-twin");
    const current = readCopilotContext(db,doctor,common.patientId);
    assert.equal(current.sources.twin.status,"available");
    for (const source of Object.values(current.sources)) {
      assert.ok(source.references.length > 0 && source.references.length <= 24);
      for (const reference of source.references) {
        assert.deepEqual(Object.keys(reference).sort(),["reference","version"]);
        assert.match(reference.reference,/^[a-f0-9]{64}$/);
      }
    }
    const payload = JSON.stringify(current);
    for (const record of records) assert.equal(payload.includes(record.id),false);
    assert.equal(payload.includes("37.1"),false);
    const other = readCopilotContext(db,doctor,"pat_gh_kofi_b");
    assert.ok(Object.values(other.sources).every(source => source.references.length === 0));
    const observation = records.find(record => record.type === "Observation")!;
    correctObservation(db,doctor,observation.id,{
      expectedVersion:1,valueQuantity:37.5,reason:"entry-correction",idempotencyKey:"copilot-context-correction",
    });
    const stale = readCopilotContext(db,doctor,common.patientId);
    assert.equal(stale.sources.twin.status,"stale");
    assert.deepEqual(stale.sources.twin.references,[]);
    assert.notDeepEqual(stale.sources.timeline.references,current.sources.timeline.references);
    setSourceDependency(db,"unavailable");
    const degraded = readCopilotContext(db,doctor,common.patientId);
    assert.equal(degraded.sources.timeline.status,"unavailable");
    assert.deepEqual(degraded.sources.timeline.references,[]);
  } finally { db.close(); }
});
