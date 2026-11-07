// Generated from versioned source profiles. Run npm run conformance:generate.
export const PROFILE_ARTIFACTS: Record<string, Record<string, unknown>> = {
  "StructureDefinition-curasphere-source-AllergyIntolerance": {
    "resourceType": "StructureDefinition",
    "version": "1.0.0",
    "status": "draft",
    "experimental": true,
    "date": "2026-11-03",
    "publisher": "CuraSphere engineering",
    "fhirVersion": "4.0.1",
    "abstract": false,
    "derivation": "constraint",
    "id": "curasphere-source-AllergyIntolerance",
    "url": "https://curasphere.local/fhir/StructureDefinition/source-AllergyIntolerance",
    "name": "CuraSphereSourceAllergyIntolerance",
    "title": "CuraSphere synthetic source AllergyIntolerance",
    "description": "Local R4 source mapping profile. Not US Core, clinical approval, licensed terminology conformance, or external delivery support.",
    "kind": "resource",
    "type": "AllergyIntolerance",
    "baseDefinition": "http://hl7.org/fhir/StructureDefinition/AllergyIntolerance",
    "differential": {
      "element": [
        {
          "id": "AllergyIntolerance",
          "path": "AllergyIntolerance"
        },
        {
          "id": "AllergyIntolerance.id",
          "path": "AllergyIntolerance.id",
          "min": 1
        },
        {
          "id": "AllergyIntolerance.extension",
          "path": "AllergyIntolerance.extension",
          "min": 1,
          "slicing": {
            "discriminator": [
              {
                "type": "value",
                "path": "url"
              }
            ],
            "rules": "open"
          }
        },
        {
          "id": "AllergyIntolerance.extension:sourceContext",
          "path": "AllergyIntolerance.extension",
          "sliceName": "sourceContext",
          "min": 1,
          "max": "1",
          "type": [
            {
              "code": "Extension",
              "profile": [
                "https://curasphere.local/fhir/StructureDefinition/source-context|1.0.0"
              ]
            }
          ]
        },
        {
          "id": "AllergyIntolerance.code",
          "path": "AllergyIntolerance.code",
          "min": 1
        },
        {
          "id": "AllergyIntolerance.patient",
          "path": "AllergyIntolerance.patient",
          "min": 1
        },
        {
          "id": "AllergyIntolerance.encounter",
          "path": "AllergyIntolerance.encounter",
          "min": 1
        },
        {
          "id": "AllergyIntolerance.verificationStatus",
          "path": "AllergyIntolerance.verificationStatus",
          "min": 1
        },
        {
          "id": "AllergyIntolerance.recordedDate",
          "path": "AllergyIntolerance.recordedDate",
          "min": 1
        }
      ]
    }
  },
  "StructureDefinition-curasphere-source-Condition": {
    "resourceType": "StructureDefinition",
    "version": "1.0.0",
    "status": "draft",
    "experimental": true,
    "date": "2026-11-03",
    "publisher": "CuraSphere engineering",
    "fhirVersion": "4.0.1",
    "abstract": false,
    "derivation": "constraint",
    "id": "curasphere-source-Condition",
    "url": "https://curasphere.local/fhir/StructureDefinition/source-Condition",
    "name": "CuraSphereSourceCondition",
    "title": "CuraSphere synthetic source Condition",
    "description": "Local R4 source mapping profile. Not US Core, clinical approval, licensed terminology conformance, or external delivery support.",
    "kind": "resource",
    "type": "Condition",
    "baseDefinition": "http://hl7.org/fhir/StructureDefinition/Condition",
    "differential": {
      "element": [
        {
          "id": "Condition",
          "path": "Condition"
        },
        {
          "id": "Condition.id",
          "path": "Condition.id",
          "min": 1
        },
        {
          "id": "Condition.extension",
          "path": "Condition.extension",
          "min": 1,
          "slicing": {
            "discriminator": [
              {
                "type": "value",
                "path": "url"
              }
            ],
            "rules": "open"
          }
        },
        {
          "id": "Condition.extension:sourceContext",
          "path": "Condition.extension",
          "sliceName": "sourceContext",
          "min": 1,
          "max": "1",
          "type": [
            {
              "code": "Extension",
              "profile": [
                "https://curasphere.local/fhir/StructureDefinition/source-context|1.0.0"
              ]
            }
          ]
        },
        {
          "id": "Condition.code",
          "path": "Condition.code",
          "min": 1
        },
        {
          "id": "Condition.subject",
          "path": "Condition.subject",
          "min": 1
        },
        {
          "id": "Condition.encounter",
          "path": "Condition.encounter",
          "min": 1
        },
        {
          "id": "Condition.verificationStatus",
          "path": "Condition.verificationStatus",
          "min": 1
        },
        {
          "id": "Condition.recordedDate",
          "path": "Condition.recordedDate",
          "min": 1
        }
      ]
    }
  },
  "StructureDefinition-curasphere-source-Encounter": {
    "resourceType": "StructureDefinition",
    "version": "1.0.0",
    "status": "draft",
    "experimental": true,
    "date": "2026-11-03",
    "publisher": "CuraSphere engineering",
    "fhirVersion": "4.0.1",
    "abstract": false,
    "derivation": "constraint",
    "id": "curasphere-source-Encounter",
    "url": "https://curasphere.local/fhir/StructureDefinition/source-Encounter",
    "name": "CuraSphereSourceEncounter",
    "title": "CuraSphere synthetic source Encounter",
    "description": "Local R4 source mapping profile. Not US Core, clinical approval, licensed terminology conformance, or external delivery support.",
    "kind": "resource",
    "type": "Encounter",
    "baseDefinition": "http://hl7.org/fhir/StructureDefinition/Encounter",
    "differential": {
      "element": [
        {
          "id": "Encounter",
          "path": "Encounter"
        },
        {
          "id": "Encounter.id",
          "path": "Encounter.id",
          "min": 1
        },
        {
          "id": "Encounter.extension",
          "path": "Encounter.extension",
          "min": 1,
          "slicing": {
            "discriminator": [
              {
                "type": "value",
                "path": "url"
              }
            ],
            "rules": "open"
          }
        },
        {
          "id": "Encounter.extension:sourceContext",
          "path": "Encounter.extension",
          "sliceName": "sourceContext",
          "min": 1,
          "max": "1",
          "type": [
            {
              "code": "Extension",
              "profile": [
                "https://curasphere.local/fhir/StructureDefinition/source-context|1.0.0"
              ]
            }
          ]
        },
        {
          "id": "Encounter.subject",
          "path": "Encounter.subject",
          "min": 1
        }
      ]
    }
  },
  "StructureDefinition-curasphere-source-MedicationRequest": {
    "resourceType": "StructureDefinition",
    "version": "1.0.0",
    "status": "draft",
    "experimental": true,
    "date": "2026-11-03",
    "publisher": "CuraSphere engineering",
    "fhirVersion": "4.0.1",
    "abstract": false,
    "derivation": "constraint",
    "id": "curasphere-source-MedicationRequest",
    "url": "https://curasphere.local/fhir/StructureDefinition/source-MedicationRequest",
    "name": "CuraSphereSourceMedicationRequest",
    "title": "CuraSphere synthetic source MedicationRequest",
    "description": "Local R4 source mapping profile. Not US Core, clinical approval, licensed terminology conformance, or external delivery support.",
    "kind": "resource",
    "type": "MedicationRequest",
    "baseDefinition": "http://hl7.org/fhir/StructureDefinition/MedicationRequest",
    "differential": {
      "element": [
        {
          "id": "MedicationRequest",
          "path": "MedicationRequest"
        },
        {
          "id": "MedicationRequest.id",
          "path": "MedicationRequest.id",
          "min": 1
        },
        {
          "id": "MedicationRequest.extension",
          "path": "MedicationRequest.extension",
          "min": 1,
          "slicing": {
            "discriminator": [
              {
                "type": "value",
                "path": "url"
              }
            ],
            "rules": "open"
          }
        },
        {
          "id": "MedicationRequest.extension:sourceContext",
          "path": "MedicationRequest.extension",
          "sliceName": "sourceContext",
          "min": 1,
          "max": "1",
          "type": [
            {
              "code": "Extension",
              "profile": [
                "https://curasphere.local/fhir/StructureDefinition/source-context|1.0.0"
              ]
            }
          ]
        },
        {
          "id": "MedicationRequest.medication[x]",
          "path": "MedicationRequest.medication[x]",
          "min": 1
        },
        {
          "id": "MedicationRequest.subject",
          "path": "MedicationRequest.subject",
          "min": 1
        },
        {
          "id": "MedicationRequest.encounter",
          "path": "MedicationRequest.encounter",
          "min": 1
        },
        {
          "id": "MedicationRequest.authoredOn",
          "path": "MedicationRequest.authoredOn",
          "min": 1
        },
        {
          "id": "MedicationRequest.dosageInstruction",
          "path": "MedicationRequest.dosageInstruction",
          "min": 1
        },
        {
          "id": "MedicationRequest.intent",
          "path": "MedicationRequest.intent",
          "fixedCode": "proposal"
        }
      ]
    }
  },
  "StructureDefinition-curasphere-source-Observation": {
    "resourceType": "StructureDefinition",
    "version": "1.0.0",
    "status": "draft",
    "experimental": true,
    "date": "2026-11-03",
    "publisher": "CuraSphere engineering",
    "fhirVersion": "4.0.1",
    "abstract": false,
    "derivation": "constraint",
    "id": "curasphere-source-Observation",
    "url": "https://curasphere.local/fhir/StructureDefinition/source-Observation",
    "name": "CuraSphereSourceObservation",
    "title": "CuraSphere synthetic source Observation",
    "description": "Local R4 source mapping profile. Not US Core, clinical approval, licensed terminology conformance, or external delivery support.",
    "kind": "resource",
    "type": "Observation",
    "baseDefinition": "http://hl7.org/fhir/StructureDefinition/Observation",
    "differential": {
      "element": [
        {
          "id": "Observation",
          "path": "Observation"
        },
        {
          "id": "Observation.id",
          "path": "Observation.id",
          "min": 1
        },
        {
          "id": "Observation.extension",
          "path": "Observation.extension",
          "min": 1,
          "slicing": {
            "discriminator": [
              {
                "type": "value",
                "path": "url"
              }
            ],
            "rules": "open"
          }
        },
        {
          "id": "Observation.extension:sourceContext",
          "path": "Observation.extension",
          "sliceName": "sourceContext",
          "min": 1,
          "max": "1",
          "type": [
            {
              "code": "Extension",
              "profile": [
                "https://curasphere.local/fhir/StructureDefinition/source-context|1.0.0"
              ]
            }
          ]
        },
        {
          "id": "Observation.code",
          "path": "Observation.code",
          "min": 1
        },
        {
          "id": "Observation.subject",
          "path": "Observation.subject",
          "min": 1
        },
        {
          "id": "Observation.encounter",
          "path": "Observation.encounter",
          "min": 1
        },
        {
          "id": "Observation.effective[x]",
          "path": "Observation.effective[x]",
          "min": 1
        },
        {
          "id": "Observation.issued",
          "path": "Observation.issued",
          "min": 1
        }
      ]
    }
  },
  "StructureDefinition-curasphere-source-Patient": {
    "resourceType": "StructureDefinition",
    "version": "1.0.0",
    "status": "draft",
    "experimental": true,
    "date": "2026-11-03",
    "publisher": "CuraSphere engineering",
    "fhirVersion": "4.0.1",
    "abstract": false,
    "derivation": "constraint",
    "id": "curasphere-source-Patient",
    "url": "https://curasphere.local/fhir/StructureDefinition/source-Patient",
    "name": "CuraSphereSourcePatient",
    "title": "CuraSphere synthetic source Patient",
    "description": "Local R4 source mapping profile. Not US Core, clinical approval, licensed terminology conformance, or external delivery support.",
    "kind": "resource",
    "type": "Patient",
    "baseDefinition": "http://hl7.org/fhir/StructureDefinition/Patient",
    "differential": {
      "element": [
        {
          "id": "Patient",
          "path": "Patient"
        },
        {
          "id": "Patient.id",
          "path": "Patient.id",
          "min": 1
        },
        {
          "id": "Patient.extension",
          "path": "Patient.extension",
          "min": 1,
          "slicing": {
            "discriminator": [
              {
                "type": "value",
                "path": "url"
              }
            ],
            "rules": "open"
          }
        },
        {
          "id": "Patient.extension:sourceContext",
          "path": "Patient.extension",
          "sliceName": "sourceContext",
          "min": 1,
          "max": "1",
          "type": [
            {
              "code": "Extension",
              "profile": [
                "https://curasphere.local/fhir/StructureDefinition/source-context|1.0.0"
              ]
            }
          ]
        },
        {
          "id": "Patient.identifier",
          "path": "Patient.identifier",
          "min": 1
        },
        {
          "id": "Patient.identifier.system",
          "path": "Patient.identifier.system",
          "min": 1
        },
        {
          "id": "Patient.identifier.value",
          "path": "Patient.identifier.value",
          "min": 1
        },
        {
          "id": "Patient.name",
          "path": "Patient.name",
          "min": 1
        },
        {
          "id": "Patient.name.family",
          "path": "Patient.name.family",
          "min": 1
        },
        {
          "id": "Patient.name.given",
          "path": "Patient.name.given",
          "min": 1
        },
        {
          "id": "Patient.birthDate",
          "path": "Patient.birthDate",
          "min": 1
        }
      ]
    }
  },
  "StructureDefinition-curasphere-source-ServiceRequest": {
    "resourceType": "StructureDefinition",
    "version": "1.0.0",
    "status": "draft",
    "experimental": true,
    "date": "2026-11-03",
    "publisher": "CuraSphere engineering",
    "fhirVersion": "4.0.1",
    "abstract": false,
    "derivation": "constraint",
    "id": "curasphere-source-ServiceRequest",
    "url": "https://curasphere.local/fhir/StructureDefinition/source-ServiceRequest",
    "name": "CuraSphereSourceServiceRequest",
    "title": "CuraSphere synthetic source ServiceRequest",
    "description": "Local R4 source mapping profile. Not US Core, clinical approval, licensed terminology conformance, or external delivery support.",
    "kind": "resource",
    "type": "ServiceRequest",
    "baseDefinition": "http://hl7.org/fhir/StructureDefinition/ServiceRequest",
    "differential": {
      "element": [
        {
          "id": "ServiceRequest",
          "path": "ServiceRequest"
        },
        {
          "id": "ServiceRequest.id",
          "path": "ServiceRequest.id",
          "min": 1
        },
        {
          "id": "ServiceRequest.extension",
          "path": "ServiceRequest.extension",
          "min": 1,
          "slicing": {
            "discriminator": [
              {
                "type": "value",
                "path": "url"
              }
            ],
            "rules": "open"
          }
        },
        {
          "id": "ServiceRequest.extension:sourceContext",
          "path": "ServiceRequest.extension",
          "sliceName": "sourceContext",
          "min": 1,
          "max": "1",
          "type": [
            {
              "code": "Extension",
              "profile": [
                "https://curasphere.local/fhir/StructureDefinition/source-context|1.0.0"
              ]
            }
          ]
        },
        {
          "id": "ServiceRequest.code",
          "path": "ServiceRequest.code",
          "min": 1
        },
        {
          "id": "ServiceRequest.subject",
          "path": "ServiceRequest.subject",
          "min": 1
        },
        {
          "id": "ServiceRequest.encounter",
          "path": "ServiceRequest.encounter",
          "min": 1
        },
        {
          "id": "ServiceRequest.priority",
          "path": "ServiceRequest.priority",
          "min": 1
        },
        {
          "id": "ServiceRequest.occurrence[x]",
          "path": "ServiceRequest.occurrence[x]",
          "min": 1
        },
        {
          "id": "ServiceRequest.authoredOn",
          "path": "ServiceRequest.authoredOn",
          "min": 1
        },
        {
          "id": "ServiceRequest.intent",
          "path": "ServiceRequest.intent",
          "fixedCode": "proposal"
        }
      ]
    }
  },
  "StructureDefinition-source-context": {
    "resourceType": "StructureDefinition",
    "version": "1.0.0",
    "status": "draft",
    "experimental": true,
    "date": "2026-11-03",
    "publisher": "CuraSphere engineering",
    "fhirVersion": "4.0.1",
    "abstract": false,
    "derivation": "constraint",
    "id": "source-context",
    "url": "https://curasphere.local/fhir/StructureDefinition/source-context",
    "name": "CuraSphereSourceContext",
    "kind": "complex-type",
    "type": "Extension",
    "baseDefinition": "http://hl7.org/fhir/StructureDefinition/Extension",
    "context": [
      {
        "type": "element",
        "expression": "DomainResource"
      }
    ],
    "description": "Versioned source-only provenance for lossless local synthetic mapping. Not an executable instruction or an import authorization.",
    "differential": {
      "element": [
        {
          "id": "Extension",
          "path": "Extension"
        },
        {
          "id": "Extension.extension",
          "path": "Extension.extension",
          "max": "0"
        },
        {
          "id": "Extension.url",
          "path": "Extension.url",
          "fixedUri": "https://curasphere.local/fhir/StructureDefinition/source-context"
        },
        {
          "id": "Extension.value[x]",
          "path": "Extension.value[x]",
          "min": 1,
          "type": [
            {
              "code": "string"
            }
          ]
        }
      ]
    }
  }
};
