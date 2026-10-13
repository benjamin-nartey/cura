/** Generated from platform-contract.json. Do not edit by hand. */
export const platformContractVersion = "2026.10" as const;
export const platformRoutes = [
  { method: "GET", path: "/health", status: 200, responseFields: ["status","service","clinicalGeneration"] },
  { method: "POST", path: "/v1/generate", status: 403, responseFields: ["code","message"] },
  { method: "GET", path: "/ready", status: 200, responseFields: ["status","service"] }
] as const;
