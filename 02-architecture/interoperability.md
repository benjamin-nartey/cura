# Interoperability Architecture

## Baseline
- FHIR R4 for broad ecosystem compatibility.
- R5 compatibility at contract/mapping boundaries.
- SMART on FHIR for app authorization.
- DICOM/DICOMweb for imaging.
- Terminology service for code systems and value sets.

## Integration pattern
Inbound adapters validate, normalize and attach provenance. Outbound integrations use an integration service and durable workflows, never direct ad-hoc calls from UI code.

## Conformance
Publish CapabilityStatement/implementation guides where appropriate; keep automated FHIR validation and contract tests in CI.
