import {randomUUID} from "node:crypto";
import type {SessionContext} from "@curasphere/contracts";
import {writeAudit} from "./audit";
import {all,get,run,transaction,type AppDatabase} from "./db";
import {AppError,ConflictError,ValidationError} from "./errors";
import {assertLocalHealthcareSandbox} from "./experimental-healthcare";

type Pair = {promptId:string; promptVersion:number; modelId:string; modelVersion:string};
type Evaluation = {
  id:string; prompt_id:string; prompt_version:number; model_id:string; model_version:string;
  verdict:"passed"|"failed"; evidence_ref:string; created_at:string;
};
type Alias = {revision:number; evaluation_id:string|null};
type Registry = {kind:"prompt"|"model"; id:string; version:string; definition_json:string};
type Prompt = {id:string; version:number; name:string; purpose:string; status:string; output_schema_json:string};
type Model = {id:string; version:string; provider:string; status:string};
type Limits = {maxOutputCharacters:number; maxCitations:number};
const token = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const invalid = () => new ValidationError("invalid","Use the documented gateway lifecycle command.");
const unavailable = () => new AppError("forbidden","Gateway lifecycle access is unavailable in this workspace.");

function bounded(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function record(value: unknown, fields: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const data = value as Record<string,unknown>;
  if (Object.keys(data).some(key => !fields.includes(key))) throw invalid();
  return data;
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || !token.test(value)) throw invalid();
  return value;
}

function assertManager(db: AppDatabase, ctx: SessionContext, facility: string) {
  assertLocalHealthcareSandbox();
  if (ctx.role !== "admin" || ctx.purposeOfUse !== "OPERATIONS" || (ctx.facilityId && ctx.facilityId !== facility)) throw unavailable();
  const allowed = get(db, `
    SELECT u.id FROM users u
    JOIN organizations o ON o.id=u.organization_id AND o.status='active' AND o.jurisdiction='local-synthetic'
    JOIN organization_memberships m ON m.organization_id=o.id AND m.user_id=u.id AND m.status='active'
    JOIN facilities f ON f.organization_id=o.id AND f.id=? AND f.status='active'
    WHERE u.id=? AND o.id=? AND u.role='admin' AND u.account_status='active'
      AND (u.facility_id IS NULL OR u.facility_id=f.id)
  `, facility,ctx.userId,ctx.organizationId);
  if (!allowed) throw unavailable();
}

function alias(db:AppDatabase, org:string, facility:string) {
  return get<Alias>(db,"SELECT revision,evaluation_id FROM gateway_release_alias_events WHERE organization_id=? AND facility_id=? ORDER BY revision DESC LIMIT 1",org,facility);
}

function latestEvaluation(db:AppDatabase, org:string, facility:string, pair:Pair) {
  return get<Evaluation>(db,`
    SELECT id,prompt_id,prompt_version,model_id,model_version,verdict,evidence_ref,created_at
    FROM gateway_evaluations WHERE organization_id=? AND facility_id=? AND prompt_id=? AND prompt_version=?
      AND model_id=? AND model_version=? ORDER BY rowid DESC LIMIT 1
  `, org,facility,pair.promptId,pair.promptVersion,pair.modelId,pair.modelVersion);
}

function version(db:AppDatabase, org:string, facility:string, kind:Registry["kind"], id:string, versionId:string) {
  return get<Registry>(db,`
    SELECT kind,id,version,definition_json FROM gateway_registry_versions
    WHERE kind=? AND id=? AND version=? AND organization_id=? AND facility_id=?
  `,kind,id,versionId,org,facility);
}

function promptRow(db:AppDatabase, id:string, v:number) {
  return get<Prompt>(db,"SELECT id,version,name,purpose,status,output_schema_json FROM gateway_prompts WHERE id=? AND version=?",id,v);
}

function modelRow(db:AppDatabase, id:string, v:string) {
  return get<Model>(db,"SELECT id,version,provider,status FROM gateway_models WHERE id=? AND version=?",id,v);
}

function approvedPair(db:AppDatabase, org:string, facility:string, pair:Pair): Limits | null {
  const prompt = version(db,org,facility,"prompt",pair.promptId,String(pair.promptVersion));
  const model = version(db,org,facility,"model",pair.modelId,pair.modelVersion);
  if (!prompt || !model || prompt.definition_json !== JSON.stringify(promptRow(db,pair.promptId,pair.promptVersion))) return null;
  const definition = JSON.parse(model.definition_json) as {model:Model; limits:Limits};
  if (JSON.stringify(definition.model) !== JSON.stringify(modelRow(db,pair.modelId,pair.modelVersion))
      || !bounded(definition.limits?.maxOutputCharacters,1,2000) || !bounded(definition.limits?.maxCitations,1,32)) return null;
  return definition.limits;
}

function activeRelease(db:AppDatabase, org:string, facility:string) {
  const active = alias(db,org,facility);
  if (!active?.evaluation_id) return null;
  const evaluated = get<Evaluation>(db,
    "SELECT * FROM gateway_evaluations WHERE id=? AND organization_id=? AND facility_id=?",
    active.evaluation_id,org,facility,
  );
  if (evaluated?.verdict !== "passed") return null;
  const pair = {
    promptId:evaluated.prompt_id,promptVersion:evaluated.prompt_version,
    modelId:evaluated.model_id,modelVersion:evaluated.model_version,
  };
  if (latestEvaluation(db,org,facility,pair)?.id !== evaluated.id) return null;
  const limits = approvedPair(db,org,facility,pair);
  return limits ? {pair,limits,evaluationId:evaluated.id} : null;
}

export function gatewayReleaseLimits(db:AppDatabase, ctx:SessionContext, pair:Pair) {
  if (!ctx.facilityId) return null;
  const release = activeRelease(db,ctx.organizationId,ctx.facilityId);
  if (!release || release.pair.promptId !== pair.promptId || release.pair.promptVersion !== pair.promptVersion
      || release.pair.modelId !== pair.modelId || release.pair.modelVersion !== pair.modelVersion) return null;
  return release.limits;
}

function registerPrompt(db:AppDatabase, ctx:SessionContext, facility:string, input:Record<string,unknown>) {
  const id = identifier(input.id);
  const v = input.version;
  if (!bounded(v,1,10000) || typeof input.name !== "string" || !/^[\w .-]{1,80}$/.test(input.name)) throw invalid();
  const schema = record(input.schema,["required","citationsMin","dispatchPolicy"]);
  if (!Array.isArray(schema.required) || !schema.required.includes("citations")
      || schema.required.some(key => key !== "citations" && key !== "text")
      || new Set(schema.required).size !== schema.required.length || !bounded(schema.citationsMin,1,32)) throw invalid();
  const policy = record(schema.dispatchPolicy,["version","dataClass","organizationId","facilityId","jurisdiction","purpose","provider","modelId","modelVersion","approvedInputs"]);
  if (policy.version !== 1 || policy.dataClass !== "synthetic" || policy.organizationId !== ctx.organizationId
      || policy.facilityId !== facility || policy.jurisdiction !== "local-synthetic" || policy.purpose !== "TREATMENT"
      || !Array.isArray(policy.approvedInputs) || policy.approvedInputs.length < 1 || policy.approvedInputs.length > 8
      || policy.approvedInputs.some(text => typeof text !== "string" || text.length < 1 || text.length > 240)) throw invalid();
  for (const key of ["provider","modelId","modelVersion"]) identifier(policy[key]);
  const definition:Prompt = {id,version:v,name:input.name,purpose:"control-plane",status:"active",output_schema_json:JSON.stringify(schema)};
  const existing = promptRow(db,id,v);
  if (existing && JSON.stringify(existing) !== JSON.stringify(definition)) throw new ConflictError("conflict","That prompt version is already defined.");
  if (!existing) run(db,"INSERT INTO gateway_prompts(id,version,name,purpose,status,output_schema_json) VALUES(?,?,?,?,?,?)",
    id,v,definition.name,definition.purpose,definition.status,definition.output_schema_json);
  seal(db,ctx,facility,"prompt",id,String(v),definition);
  return {id,version:v};
}

function registerModel(db:AppDatabase, ctx:SessionContext, facility:string, input:Record<string,unknown>) {
  const id = identifier(input.id);
  const v = identifier(input.version);
  const provider = identifier(input.provider);
  if (!bounded(input.maxOutputCharacters,1,2000) || !bounded(input.maxCitations,1,32)) throw invalid();
  const model:Model = {id,version:v,provider,status:"active"};
  const existing = modelRow(db,id,v);
  if (existing && JSON.stringify(existing) !== JSON.stringify(model)) throw new ConflictError("conflict","That model version is already defined.");
  if (!existing) run(db,"INSERT INTO gateway_models(id,version,provider,status) VALUES(?,?,?,?)",id,v,provider,model.status);
  seal(db,ctx,facility,"model",id,v,{model,limits:{maxOutputCharacters:input.maxOutputCharacters,maxCitations:input.maxCitations}});
  return {id,version:v};
}

function seal(db:AppDatabase, ctx:SessionContext, facility:string, kind:Registry["kind"], id:string, v:string, definition:unknown) {
  const existing = get(db,"SELECT id FROM gateway_registry_versions WHERE kind=? AND id=? AND version=?",kind,id,v);
  if (existing) throw new ConflictError("conflict","That gateway version is already registered.");
  run(db,"INSERT INTO gateway_registry_versions VALUES(?,?,?,?,?,?,?,?)",
    kind,id,v,ctx.organizationId,facility,JSON.stringify(definition),ctx.userId,new Date().toISOString());
}

function evaluate(db:AppDatabase, ctx:SessionContext, facility:string, input:Record<string,unknown>) {
  if (!bounded(input.promptVersion,1,10000) || (input.verdict !== "passed" && input.verdict !== "failed")) throw invalid();
  const pair = {promptId:identifier(input.promptId),promptVersion:input.promptVersion,modelId:identifier(input.modelId),modelVersion:identifier(input.modelVersion)};
  const limits = approvedPair(db,ctx.organizationId,facility,pair);
  if (!limits) throw unavailable();
  const prompt = promptRow(db,pair.promptId,pair.promptVersion)!;
  const model = modelRow(db,pair.modelId,pair.modelVersion)!;
  const schema = JSON.parse(prompt.output_schema_json);
  const policy = schema.dispatchPolicy;
  if (policy.modelId !== model.id || policy.modelVersion !== model.version || policy.provider !== model.provider
      || schema.citationsMin > limits.maxCitations) throw invalid();
  const evidenceRef = identifier(input.evidenceRef);
  const prior = get<{id:string;verdict:string}>(db,`
    SELECT id,verdict FROM gateway_evaluations WHERE organization_id=? AND facility_id=? AND prompt_id=?
      AND prompt_version=? AND model_id=? AND model_version=? AND evidence_ref=?
  `,ctx.organizationId,facility,pair.promptId,pair.promptVersion,pair.modelId,pair.modelVersion,evidenceRef);
  if (prior) {
    if (prior.verdict !== input.verdict) throw new ConflictError("conflict","That evidence reference already has a verdict.");
    return {evaluationId:prior.id};
  }
  const id = `gwe_${randomUUID()}`;
  run(db,"INSERT INTO gateway_evaluations VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    id,ctx.organizationId,facility,pair.promptId,pair.promptVersion,pair.modelId,pair.modelVersion,
    input.verdict,evidenceRef,ctx.userId,new Date().toISOString());
  return {evaluationId:id};
}

function moveAlias(db:AppDatabase, ctx:SessionContext, facility:string, input:Record<string,unknown>) {
  if (!bounded(input.expectedRevision,0,1000000)) throw invalid();
  const current = alias(db,ctx.organizationId,facility)?.revision ?? 0;
  if (input.expectedRevision !== current) throw new ConflictError("conflict","Refresh the release alias before changing it.");
  const target = input.evaluationId === null ? null : identifier(input.evaluationId);
  if (target) {
    const evaluated = get<Evaluation>(db,"SELECT * FROM gateway_evaluations WHERE id=? AND organization_id=? AND facility_id=?",target,ctx.organizationId,facility);
    if (!evaluated || evaluated.verdict !== "passed") throw unavailable();
    const pair = {promptId:evaluated.prompt_id,promptVersion:evaluated.prompt_version,modelId:evaluated.model_id,modelVersion:evaluated.model_version};
    if (latestEvaluation(db,ctx.organizationId,facility,pair)?.id !== target || !approvedPair(db,ctx.organizationId,facility,pair)) throw unavailable();
  }
  const revision = current + 1;
  run(db,"INSERT INTO gateway_release_alias_events VALUES(?,?,?,?,?,?)",
    ctx.organizationId,facility,revision,target,ctx.userId,new Date().toISOString());
  return {revision,evaluationId:target};
}

const commandFields = {
  "register-prompt":["id","version","name","schema"],
  "register-model":["id","version","provider","maxOutputCharacters","maxCitations"],
  evaluate:["promptId","promptVersion","modelId","modelVersion","verdict","evidenceRef"],
  alias:["expectedRevision","evaluationId"],
} as const;

export function commandGatewayLifecycle(db:AppDatabase, ctx:SessionContext, command:unknown) {
  const action = (command as {action?:unknown}|null)?.action;
  if (typeof action !== "string" || !Object.hasOwn(commandFields,action)) throw invalid();
  const kind = action as keyof typeof commandFields;
  const input = record(command,["action","facilityId",...commandFields[kind]]);
  const facility = identifier(input.facilityId);
  return transaction(db,() => {
    assertManager(db,ctx,facility);
    const result = kind === "register-prompt" ? registerPrompt(db,ctx,facility,input)
      : kind === "register-model" ? registerModel(db,ctx,facility,input)
      : kind === "evaluate" ? evaluate(db,ctx,facility,input)
      : moveAlias(db,ctx,facility,input);
    writeAudit(db,ctx,{action:`gateway.lifecycle.${kind}`,resourceType:"GatewayRegistry",resourceId:facility,outcome:"success"});
    return result;
  });
}

export function readGatewayLifecycle(db:AppDatabase, ctx:SessionContext, facilityId:string) {
  const facility = identifier(facilityId);
  assertManager(db,ctx,facility);
  return {
    facilityId:facility,
    alias:alias(db,ctx.organizationId,facility) ?? {revision:0,evaluation_id:null},
    activeRelease:activeRelease(db,ctx.organizationId,facility),
    versions:all<Omit<Registry,"definition_json">>(db,"SELECT kind,id,version FROM gateway_registry_versions WHERE organization_id=? AND facility_id=? ORDER BY created_at DESC LIMIT 100",ctx.organizationId,facility),
    evaluations:all<Evaluation>(db,"SELECT id,prompt_id,prompt_version,model_id,model_version,verdict,evidence_ref,created_at FROM gateway_evaluations WHERE organization_id=? AND facility_id=? ORDER BY rowid DESC LIMIT 100",ctx.organizationId,facility),
    aliasHistory:all<Alias>(db,"SELECT revision,evaluation_id FROM gateway_release_alias_events WHERE organization_id=? AND facility_id=? ORDER BY revision DESC LIMIT 50",ctx.organizationId,facility),
  };
}
