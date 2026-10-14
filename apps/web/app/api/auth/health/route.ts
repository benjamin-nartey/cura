import { LOCAL_ISSUER, readIssuerDocument } from "@curasphere/domain";

export async function GET() {
  try {
    const document = await readIssuerDocument(LOCAL_ISSUER);
    const codeOnly = document.response_types_supported?.every((item) => item === "code") ?? false;
    return Response.json({ ok: true, code: codeOnly });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
