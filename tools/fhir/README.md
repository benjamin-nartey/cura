# Local FHIR validation

The P06-F01 harness runs the official HL7 validator against synthetic fixtures generated through actual domain persistence and source mappings. It checks seven versioned R4 profiles, both observation shapes, terminal clinical lifecycle states, a missing-birth-date rejection and rejection of executable service intent. It does not establish licensed terminology validation, clinical acceptance, SMART support or production readiness.

Requirements: Node 22, Java 21, and the exact validator binary in `validator.lock.json`. `install-validator.mjs` downloads the locked URL; the installer and runner verify its full size and SHA-256 before Java starts. The binary and reports are ignored build artifacts. Set `CURASPHERE_FHIR_JAVA` to the Java executable if it is not on PATH; optionally set `CURASPHERE_FHIR_VALIDATOR_JAR` to the local JAR path.

Run:

```text
node tools/fhir/install-validator.mjs
node --test tools/fhir/validate.test.mjs
node --import tsx tools/fhir/generate-fixtures.ts
node tools/fhir/validate.mjs
```

The validator may download public standards packages into its local FHIR cache on first use. Resource inputs are fixed synthetic repository files. `-tx n/a` disables the remote terminology service; this command must not be repurposed to send patient data to remote validation services. No clinical database is opened or mutated.

Individual logs, OperationOutcomes and `summary.json` are saved beneath `artifacts/governance-v2/P06-F01-validator/`. Positive cases require both a successful process exit and zero error/fatal issues. Negative cases require an unsuccessful process exit and actual error/fatal issues. Warnings are reported separately. Missing or malformed reports fail the run; old reports are invalidated before invocation. Do not count an interrupted first run as a pass.

The draft profiles are intentionally bounded to CuraSphere current-source facts, with an explicit source-context extension for provenance and original null/state distinctions. They are not US Core. Warnings for absent full narratives and unknown synthetic code systems remain in the original reports. The remote terminology service is disabled; unknown codes are not treated as independently validated terminology.

References: [HL7 validation](https://hl7.org/fhir/R4/validation.html), [profiling](https://hl7.org/fhir/R4/profiling.html), [pinned validator release](https://github.com/hapifhir/org.hl7.fhir.core/releases/tag/7.0.4).
