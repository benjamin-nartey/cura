import assert from "node:assert/strict";
import test from "node:test";
import {correctObservation,recordObservation} from "../src/clinical-source";
import {readGroundedCopilotSummary} from "../src/copilot-summary";
import {readGraphClaims,recordGraphClaim} from "../src/evidence-graph";
import {inspectTwinProjectionSource,rebuildTwinProjection} from "../src/twin-projection";
import {sourceScenario} from "./fhir-source-fixtures";

test("versioned summary cites authorized source assertions and withholds unsupported or stale material", () => {
  const {db,doctor,nurse,foreign,common} = sourceScenario();
  const patient = common.patientId;
  try {
    assert.throws(() => readGroundedCopilotSummary(db,nurse,patient),{code:"forbidden"});
    assert.throws(() => readGroundedCopilotSummary(db,foreign,patient),{code:"notfound"});
    assert.equal(readGroundedCopilotSummary(db,doctor,patient).status,"not-built");
    const observation = recordObservation(db,doctor,{
      ...common,code:"syn-temp",valueQuantity:37.2,unit:"Cel",status:"preliminary",
      effectiveAt:new Date().toISOString(),idempotencyKey:"copilot-summary-temperature",
    });
    const graph = readGraphClaims(db,doctor,patient);
    recordGraphClaim(db,doctor,{
      patient,commandKey:"copilot-summary-unsupported",expectedVersion:0,
      type:"hypothesis",text:"Unsupported narrative marker",sources:[],sourceHash:graph.sourceHash,
    });
    rebuildTwinProjection(db,doctor,patient,"copilot-summary-build");
    const summary = readGroundedCopilotSummary(db,doctor,patient);
    assert.equal(summary.status,"current");
    assert.ok(summary.buildId);
    assert.deepEqual(summary.sections.map(section => section.section),["issues","medications","allergies","observations","pending"]);
    for (const section of summary.sections) assert.ok(section.claims.length > 0,section.section);
    const result = summary.sections.find(section => section.section === "observations")!.claims[0]!;
    assert.match(result.text,/37\.2 Cel/);
    assert.equal(result.certainty,"review");
    const source = inspectTwinProjectionSource(db,doctor,patient,summary.buildId,result.citation.factId);
    assert.equal(source.pointer.recordId,observation.id);
    assert.equal(source.pointer.sha256,result.citation.sha256);
    assert.equal(source.pointer.version,result.citation.version);
    assert.equal(JSON.stringify(summary).includes("Unsupported narrative marker"),false);
    assert.ok(readGroundedCopilotSummary(db,doctor,"pat_gh_kofi_b").sections.every(section => section.claims.length === 0));
    correctObservation(db,doctor,observation.id,{
      expectedVersion:1,valueQuantity:37.4,reason:"entry-correction",idempotencyKey:"copilot-summary-correct",
    });
    const stale = readGroundedCopilotSummary(db,doctor,patient);
    assert.equal(stale.status,"stale");
    assert.ok(stale.sections.every(section => section.claims.length === 0));
    assert.throws(() => inspectTwinProjectionSource(db,doctor,patient,summary.buildId!,result.citation.factId),{code:"conflict"});
  } finally { db.close(); }
});
