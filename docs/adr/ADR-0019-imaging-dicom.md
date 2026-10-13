# ADR-0019: Imaging stores metadata, not pixels

Status: Accepted
Date: 2026-10-08

## Context
Phase 23 asks for a DICOM/DICOMweb gateway, study metadata, a viewer, report linkage, and a de-identification pipeline, without autonomous interpretation. This store has no PACS, no object storage, and no diagnostic imaging model. Accepting a byte payload and calling it a DICOM study, or drawing a placeholder and calling it a viewer, would be a production mock.

## Decision
A clinician or nurse at the session facility stores study metadata: accession, a modality from `imaging-modality-2026.10`, a short description, and a study date. Payloads longer than 1024 characters are refused, so pixel data is not written. The page states that no DICOMweb endpoint is connected and no image viewer is connected. A report is text typed by the clinician and linked to one study. A release copies modality, study date, and facility id only. Patient, accession, and description are omitted. If that small body still contains a name, MRN, or birth date, the release is withheld. An explain call goes through the AI Gateway, which refuses clinical generation. The stored sentence stays “No image was interpreted.”

## Consequences
Schema version 19 adds the imaging tables. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A real DICOMweb endpoint and an object store are connected. Diagnostic imaging AI stays a separate validated module.
