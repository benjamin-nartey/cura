import type {readGroundedCopilotSummary} from "@curasphere/domain";
import {formatWhen} from "@/lib/format";

const headings = {
  issues:"Recorded active issues",
  medications:"Medication drafts",
  allergies:"Allergy assessments",
  observations:"Recent labs and observations",
  pending:"Pending work",
};

export function GroundedSummary({patientId,summary}:{
  patientId:string;
  summary:ReturnType<typeof readGroundedCopilotSummary> | null;
}) {
  if (!summary || summary.status !== "current" || !summary.buildId) {
    const message = summary?.status === "not-built" ? "Build the patient twin to view the summary."
      : summary?.status === "stale" ? "Source versions changed. Rebuild the patient twin to refresh the summary."
      : "The summary is unavailable for this care context.";
    return <><p role="status">{message}</p><a href={`/patients/${patientId}/twin`}>Open patient twin</a></>;
  }
  const buildId = summary.buildId;
  return <>
    <p>Sources recorded in the last 90 days. Medication drafts require review. Empty sections reflect the sources available for this summary.</p>
    {summary.sourceThroughAt && <p>Source coverage through {formatWhen(summary.sourceThroughAt)}</p>}
    {summary.sections.map(section => <section key={section.section}>
      <h4>{headings[section.section]}</h4>
      {section.claims.length === 0 ? <p>No supported items in this section.</p> : <ul>
        {section.claims.map(claim => {
          const query = new URLSearchParams({patient:patientId,build:buildId,fact:claim.citation.factId});
          return <li key={claim.citation.factId}>
            {claim.text}{claim.certainty === "review" && " · Review required"}
            <details>
              <summary>Source version {claim.citation.version}</summary>
              <p>Recorded {formatWhen(claim.citation.recordedAt)}</p>
              <a href={`/api/patient-twin/projection?${query}`}>Inspect exact source</a>
            </details>
          </li>;
        })}
      </ul>}
      {section.withheld > 0 && <p>{section.withheld} source items withheld for insufficient or conflicting evidence.</p>}
      {section.truncated && <p>This section shows up to 12 source items.</p>}
    </section>)}
  </>;
}
