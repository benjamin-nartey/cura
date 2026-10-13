import { canReadChart, getDb, listPatients, noteDenial, readImaging } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { Shell } from "@/components/shell";
import { formatWhen } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";

const MODALITIES = ["CR", "CT", "DX", "MG", "MR", "NM", "OT", "PT", "RF", "US", "XA"];

export default async function ImagingPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const query = await searchParams;
  const feedback = readFeedback(query);
  if (!canReadChart(ctx)) {
    noteDenial(getDb(), ctx, "imaging.read", "ImagingStudy", ctx.organizationId);
    return (
      <Shell ctx={ctx} current="imaging">
        <p className="eyebrow">Imaging</p>
        <h1 className="page-title">Imaging studies are closed for this role.</h1>
      </Shell>
    );
  }
  const db = getDb();
  const view = readImaging(db, ctx);
  const patients = listPatients(db, ctx);
  return (
    <Shell ctx={ctx} current="imaging">
      <header className="chart-head">
        <div>
          <p className="eyebrow">Imaging · {view.modalityVersion}</p>
          <h1 className="page-title">{ctx.facilityName}</h1>
          <p className="lede">{view.gatewayNote} {view.viewerNote} {view.aiNote}</p>
        </div>
      </header>
      <Feedback error={feedback.error} notice={feedback.notice} />
      <form action="/api/imaging/study" method="post" className="form-grid">
        <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
        <label className="field">
          Patient
          <select name="patientId" required>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.familyName}, {patient.givenName}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Accession
          <input name="accession" type="text" required minLength={2} maxLength={40} />
        </label>
        <label className="field">
          Modality
          <select name="modality" required defaultValue="CT">
            {MODALITIES.map((modality) => (
              <option key={modality} value={modality}>{modality}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Study date
          <input name="studyDate" type="date" required />
        </label>
        <label className="field">
          Description
          <input name="description" type="text" maxLength={200} />
        </label>
        <button className="btn-line" type="submit">Store study metadata</button>
      </form>
      {view.studies.length > 0 ? (
        <>
          <form action="/api/imaging/report" method="post" className="form-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Study
              <select name="studyId" required>
                {view.studies.map((study) => (
                  <option key={study.id} value={study.id}>{study.modality} · {study.accession}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Typed report
              <input name="text" type="text" required minLength={2} maxLength={400} />
            </label>
            <button className="btn-line" type="submit">Link report</button>
          </form>
          <form action="/api/imaging/release" method="post" className="form-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Study to release
              <select name="studyId" required>
                {view.studies.map((study) => (
                  <option key={study.id} value={study.id}>{study.modality} · {study.studyDate}</option>
                ))}
              </select>
            </label>
            <button className="btn-line" type="submit">Release metadata</button>
          </form>
          <form action="/api/imaging/explain" method="post" className="form-grid" style={{ marginTop: 12 }}>
            <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
            <label className="field">
              Study to explain
              <select name="studyId" required>
                {view.studies.map((study) => (
                  <option key={study.id} value={study.id}>{study.modality} · {study.studyDate}</option>
                ))}
              </select>
            </label>
            <button className="btn-line" type="submit">Ask the gateway</button>
          </form>
        </>
      ) : null}
      <div className="board" style={{ marginTop: 16 }}>
        {view.studies.map((study) => (
          <section className="card wide" key={study.id}>
            <p className="eyebrow">{study.modality} · {study.studyDate}</p>
            <h2>{study.accession}</h2>
            <p>{study.description || "No description is stored."}</p>
            <p className="muted">Stored {formatWhen(study.createdAt)} · patient {study.patientId}</p>
            {study.report ? (
              <p className="provenance">{study.report.body} {study.report.note}</p>
            ) : null}
            {study.releases.map((release) => (
              <p key={release.id} className="provenance">
                Release {release.decision}
                {release.body ? ` · ${release.body.modality} · ${release.body.studyDate} · ${release.body.text}` : " · withheld"}
              </p>
            ))}
          </section>
        ))}
      </div>
    </Shell>
  );
}
