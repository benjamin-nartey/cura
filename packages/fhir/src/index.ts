/** Profile pin only. Clinical mapping stays in @curasphere/domain. */
export const fhirProfile = {
  version: "R4",
  ownerPackage: "@curasphere/domain",
  mappingModule: "packages/domain/src/fhir-map.ts",
} as const;
