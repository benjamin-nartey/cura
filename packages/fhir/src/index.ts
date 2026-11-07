/** Profile pin only. Clinical mapping stays in @curasphere/domain. */
export const fhirProfile = {
  version: "R4",
  ownerPackage: "@curasphere/domain",
  mappingModule: "packages/domain/src/fhir-map.ts",
} as const;

export const sourceProfile = {
  version: "R4",
  fhirVersion: "4.0.1",
  mappingVersion: "1.0.1",
  ownerPackage: "@curasphere/domain",
  mappingModule: "packages/domain/src/fhir-source-map.ts",
  profilesDirectory: "packages/fhir/profiles",
  previewEndpoint: "/api/integrations/r4/preview",
  sourceContext: "https://curasphere.local/fhir/StructureDefinition/source-context",
  mode: "local-synthetic-read-only",
} as const;

export * from "./conformance";
export { PROFILE_ARTIFACTS } from "./artifacts.generated";
