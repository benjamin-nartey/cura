import { ensureAgentPolicy } from "./agents";
import { registerObservationRecorded } from "./chart";
import { ensureDocumentationPolicy } from "./documentation";
import { ensureCoordinationPolicy } from "./coordination";
import { ensurePatientPolicy } from "./portal";
import { registerAgents, registerCoordination, registerDocumentation, registerGateway, registerLab, registerPatient, registerRx, registerSeed, registerTerminology } from "./db";
import { ensureLabPolicy } from "./lab";
import { ensureRxPolicy } from "./rx";
import { ensureGatewayPolicy } from "./gateway";
import { seed } from "./seed";
import { queueObservationNotifications } from "./subscriptions";
import { ensureTerminology } from "./terminology";

registerSeed(seed);
registerTerminology(ensureTerminology);
registerGateway(ensureGatewayPolicy);
registerAgents(ensureAgentPolicy);
registerDocumentation(ensureDocumentationPolicy);
registerLab(ensureLabPolicy);
registerRx(ensureRxPolicy);
registerCoordination(ensureCoordinationPolicy);
registerPatient(ensurePatientPolicy);
registerObservationRecorded(queueObservationNotifications);

export { formatQuantity } from "./catalog";
export { TERMINOLOGY, codeSystemLabel, listFacilityObservationCatalog } from "./terminology";
export { buildBriefing, filterTimeline, groupTimelineByDay, isTimelineGroup, projectTimeline, ageInYears } from "./briefing";
export { createDatabase, getDb } from "./db";
export { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
export { noteDenial } from "./audit";
export { canReadChart, canRegisterPatient, canReviewAudit, closeSession, listDirectory, openSession, readSession } from "./session";
export { readDashboard, type DashboardMetric } from "./dashboard";
export { completeEncounter, createEncounter, createPatient, getChart, healthcheck, listAudit, listPatients, listWorklist, mirrorAllergy, mirrorCondition, mirrorEncounter, mirrorFinishedEncounter, mirrorObservation, mirrorPatient, readPatientTimeline, recordObservation } from "./chart";
export { assertValidR4, FHIR_VERSION } from "./fhir-map";
export { createFhirObservation, createFhirSubscription, fhirCapability, prepareFhirObservation, readFhirExport, readFhirResource, searchFhir, startFhirExport } from "./fhir";
export { createObservationSubscription, listObservationSubscriptions, listSubscriptionNotifications } from "./subscriptions";
export { buildPatientState, patientSourceHash, patientStateFromChart, readPatientState, rebuildPatientState } from "./patient-state";
export { evidenceFromChart, readEvidence, rejectUncitedClaim, renderCitation } from "./evidence";
export { GATEWAY_MODEL, GATEWAY_PROMPT, gatewayPolicy, invokeGateway, listGatewayAttempts, readGatewayAttempt, redactGatewayInput, validateStructuredOutput } from "./gateway";
export { CHART_AGENT, assertSandboxedTool, callAgentTool, decideAgentApproval, listAgentRuns, readAgentRun, resumeAgentRun, startAgentRun } from "./agents";
export { GROUNDING_THRESHOLD, askCopilot, readCopilot, readCopilotTurn, recordCopilotFeedback } from "./copilot";
export {
  acknowledgeLabAlert,
  collectLabSpecimen,
  explainLabTrend,
  holdCriticalFlag,
  LAB_RULE_VERSION,
  placeLabOrder,
  readLab,
  readLabOrderForResult,
  recordLabResult,
} from "./lab";
export {
  acknowledgeRxWarning,
  activateRxOrder,
  readActivatableRxOrder,
  administerRx,
  dispenseRx,
  explainRx,
  FORMULARY_VERSION,
  holdSafetyWarnings,
  MED_SAFETY_VERSION,
  prescribeMedication,
  readRx,
  RX_SOURCE,
} from "./rx";
export {
  OUTREACH_VERSION,
  activateCarePlan,
  claimCareTask,
  completeCareTask,
  createFollowUp,
  createReferral,
  decideReferral,
  draftCarePlan,
  explainCoordination,
  holdOutreachBody,
  listIncomingReferrals,
  openGapTask,
  readCoordination,
  sendOutreach,
  setOutreachPreference,
} from "./coordination";
export {
  PATIENT_COPY_VERSION,
  PATIENT_TOOLS,
  TRIAGE_TEXT,
  askPatient,
  assertPatientTool,
  closePatientSession,
  decideAppointmentRequest,
  readPendingPatientRequest,
  explainPortal,
  holdPatientInstruction,
  listPatientDirectory,
  openPatientSession,
  readPatientDesk,
  readPatientSession,
  readPortal,
  recordPatientPayment,
  replyToPatient,
  requestAppointment,
  resultExplanation,
  sendPatientMessage,
  storeCoverage,
  storePatientQuestion,
} from "./portal";
export {
  FACILITY_SLA_VERSION,
  buildFacilityBody,
  explainFacility,
  facilitySourceHash,
  holdFacilitySignal,
  ensureClinicBoard,
  listFacilityBoard,
  readFacilityActivity,
  readFacility,
  rebuildFacility,
  recordBed,
  recordEquipment,
  recordShift,
  setBedStatus,
} from "./facility";
export {
  OPS_CONFIDENCE_VERSION,
  OPS_KPI_VERSION,
  buildOperationsBody,
  explainOperations,
  holdOperationsText,
  overrideOperations,
  readOperations,
  rebuildOperations,
  recordInventory,
} from "./operations";
export {
  ANALYTICS_CELL_MINIMUM,
  ANALYTICS_DEID_VERSION,
  ANALYTICS_GOVERNANCE_VERSION,
  ANALYTICS_METRICS_VERSION,
  ANALYTICS_REID_VERSION,
  containsDirectIdentifier,
  exportAnalytics,
  ingestAnalytics,
  readAnalytics,
} from "./analytics";
export {
  POPULATION_CELL_MINIMUM,
  POPULATION_COHORT_VERSION,
  POPULATION_JURISDICTION_VERSION,
  POPULATION_PRIVACY_VERSION,
  buildPopulation,
  readPopulation,
  recordPopulationJurisdiction,
} from "./population";
export {
  ENTERPRISE_AI_NOTE,
  ENTERPRISE_API_NOTE,
  ENTERPRISE_DRILL_NOTE,
  ENTERPRISE_KEY_NOTE,
  ENTERPRISE_LINK_NOTE,
  ENTERPRISE_MOVE_NOTE,
  ENTERPRISE_REGION,
  ENTERPRISE_RPO_NOTE,
  ENTERPRISE_RTO_NOTE,
  ENTERPRISE_SSO_NOTE,
  explainEnterprise,
  holdEnterpriseText,
  moveTenant,
  readEnterprise,
  recordApiGrant,
  recordFederation,
  recordKeyStatus,
  recordRegionDrill,
  recordResidency,
} from "./enterprise";
export {
  MARKETPLACE_AI_NOTE,
  MARKETPLACE_COMPAT_NOTE,
  MARKETPLACE_COMPAT_VERSION,
  MARKETPLACE_KILL_NOTE,
  MARKETPLACE_LISTING_NOTE,
  MARKETPLACE_OAUTH_NOTE,
  MARKETPLACE_PORTAL_NOTE,
  MARKETPLACE_RELEASE_NOTE,
  MARKETPLACE_REVIEW_NOTE,
  MARKETPLACE_SANDBOX_NOTE,
  MARKETPLACE_SHARE_NOTE,
  explainMarketplace,
  holdMarketplaceText,
  issueOauthClient,
  openSandbox,
  readMarketplace,
  recordShare,
  registerListing,
  releaseListing,
  reviewListing,
  stopListing,
} from "./marketplace";
export {
  RELEASE_AI_NOTE,
  RELEASE_ATTEMPT_NOTE,
  RELEASE_CHANGE_NOTE,
  RELEASE_CLINICAL_NOTE,
  RELEASE_DOSSIER_NOTE,
  RELEASE_RISK_NOTE,
  RELEASE_STRATEGY_NOTE,
  RELEASE_STRATEGY_VERSION,
  RELEASE_SURVEILLANCE_NOTE,
  RELEASE_TRACE_DOCS,
  RELEASE_TRACE_NOTE,
  RELEASE_VV_NOTE,
  explainReleaseTrain,
  holdReleaseText,
  readReleaseTrain,
  recordChangePlan,
  recordClinicalEvaluation,
  recordDossier,
  recordReleaseAttempt,
  recordRiskFile,
  recordStrategy,
  recordSurveillance,
  recordTrace,
  recordValidation,
} from "./release";
export {
  MODULE_AI_NOTE,
  MODULE_CATALOG_VERSION,
  MODULE_CODES,
  MODULE_PLATFORM_NOTE,
  approvePlatform,
  clearModule,
  explainModule,
  holdModuleText,
  moduleIntendedUse,
  moduleModelCard,
  modulePerformanceNote,
  readModules,
  recordModule,
  recordModulePerformance,
  recordModuleStudy,
  recordModuleValidation,
} from "./modules";
export {
  EVAL_DRIFT_NOTE,
  EVAL_GOLDEN_VERSION,
  EVAL_HOLD_NOTE,
  EVAL_MODEL_CARD,
  EVAL_PROMPT_CARD,
  EVAL_SUBGROUP_NOTE,
  holdEvalText,
  readEvaluation,
  recordEvalPromotion,
  registerEvalDataset,
  requestEvalApproval,
  runEvaluation,
  signEvalApproval,
} from "./evaluation";
export {
  REVENUE_AI_NOTE,
  REVENUE_CLAIM_NOTE,
  REVENUE_DENIAL_NOTE,
  REVENUE_ELIGIBILITY_NOTE,
  REVENUE_INVOICE_NOTE,
  REVENUE_SUBSCRIPTION_NOTE,
  draftClaim,
  explainRevenue,
  holdRevenueText,
  readRevenue,
  recordEligibility,
  recordInvoice,
  recordRevenuePayment,
  recordSubscription,
  submitClaim,
} from "./revenue";
export {
  DEVICE_AI_NOTE,
  DEVICE_ALERT_BUDGET,
  DEVICE_ALERT_NOTE,
  DEVICE_ALERT_VERSION,
  DEVICE_CONNECTIVITY_NOTE,
  DEVICE_ESCALATION_NOTE,
  DEVICE_KINDS,
  DEVICE_NORM_VERSION,
  acknowledgeDeviceAlert,
  explainDevice,
  holdDeviceText,
  prepareDeviceReading,
  readDevices,
  recordDeviceReading,
  registerDevice,
} from "./devices";
export {
  IMAGING_AI_NOTE,
  IMAGING_BYTE_LIMIT,
  IMAGING_DEID_NOTE,
  IMAGING_GATEWAY_NOTE,
  IMAGING_MODALITIES,
  IMAGING_MODALITY_VERSION,
  IMAGING_REPORT_NOTE,
  IMAGING_VIEWER_NOTE,
  explainImaging,
  holdImagingText,
  readImaging,
  recordImagingReport,
  recordImagingStudy,
  releaseImagingStudy,
} from "./imaging";
export {
  RESEARCH_ETHICS_NOTE,
  RESEARCH_NOTEBOOK_NOTE,
  decideResearchExport,
  openResearchWorkspace,
  readResearch,
  requestResearchExport,
  snapshotResearchDataset,
} from "./research";
export {
  captureDocumentationAudio,
  captureDocumentationText,
  decideDocumentationDraft,
  editDocumentationSection,
  readDocumentation,
  recordDocumentationConsent,
  setAudioRetention,
  signDocumentation,
} from "./documentation";
export { FIXTURES, seed } from "./seed";
export type { AppDatabase } from "./db";
