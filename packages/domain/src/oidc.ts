import * as client from "openid-client";
import { LOCAL_AUDIENCE, LOCAL_ISSUER, LOCAL_REDIRECT } from "./identity";

export const REDIRECT_URI = LOCAL_REDIRECT;

let configuration: Promise<client.Configuration> | null = null;

export function resetOidcConfiguration() {
  configuration = null;
}

export async function oidcConfiguration() {
  configuration ??= client.discovery(new URL(LOCAL_ISSUER), LOCAL_AUDIENCE, process.env.CURASPHERE_DEX_CLIENT_SECRET ?? "local-test-only", undefined, {
    execute: [client.allowInsecureRequests],
  });
  const config = await configuration;
  (config as unknown as Record<symbol, number>)[client.clockTolerance] = 60;
  return config;
}

export async function startOidc() {
  const config = await oidcConfiguration();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: REDIRECT_URI,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
    response_type: "code",
  });
  if (url.searchParams.get("response_type") !== "code" || url.searchParams.get("code_challenge_method") !== "S256") {
    throw new Error("The identity provider request is not an authorization code flow.");
  }
  return { url, codeVerifier, state, nonce };
}

export async function exchangeAuthorizationCode(currentUrl: URL, checks: { state: string; nonce: string; codeVerifier: string }) {
  const config = await oidcConfiguration();
  const tokens = await client.authorizationCodeGrant(config, currentUrl, {
    expectedState: checks.state,
    expectedNonce: checks.nonce,
    pkceCodeVerifier: checks.codeVerifier,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims || claims.iss !== LOCAL_ISSUER || !claims.sub) {
    throw new Error("The identity token issuer was not accepted.");
  }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(LOCAL_AUDIENCE)) throw new Error("The identity token audience was not accepted.");
  return {
    subject: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token,
    idToken: tokens.id_token ?? "",
  };
}

export async function readIssuerDocument(issuer: string, fetchImpl: typeof fetch = fetch) {
  if (issuer !== LOCAL_ISSUER) throw new Error("The identity provider issuer was not accepted.");
  let response: Response;
  try {
    response = await fetchImpl(`${issuer}/.well-known/openid-configuration`);
  } catch {
    throw new Error("The identity provider is not available.");
  }
  if (!response.ok) throw new Error("The identity provider is not available.");
  const document = (await response.json()) as { issuer?: string; response_types_supported?: string[]; grant_types_supported?: string[] };
  if (document.issuer !== LOCAL_ISSUER) throw new Error("The identity provider issuer was not accepted.");
  if (!document.response_types_supported?.includes("code")) throw new Error("The identity provider does not offer an authorization code flow.");
  return document;
}

export function assertIdentityClaims(payload: Record<string, unknown>, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (payload.iss !== LOCAL_ISSUER) throw new Error("The identity token issuer was not accepted.");
  const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audience.includes(LOCAL_AUDIENCE)) throw new Error("The identity token audience was not accepted.");
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) throw new Error("The identity token expired.");
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds + 60) throw new Error("The identity token is not valid yet.");
}

export async function verifyPresentedIdToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[2]) throw new Error("The identity token was not signed.");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as Record<string, unknown>;
  if (header.alg !== "RS256") throw new Error("The identity token algorithm was not accepted.");
  if (header.jku || header.x5u || header.jwk) throw new Error("The identity token key source was not accepted.");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as Record<string, unknown>;
  const metadata = (await oidcConfiguration()).serverMetadata();
  const jwksUri = metadata.jwks_uri;
  if (!jwksUri?.startsWith(`${LOCAL_ISSUER}/`)) throw new Error("The identity provider key set was not accepted.");
  const jwks = (await (await fetch(jwksUri)).json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk?.n || !jwk.e) throw new Error("The identity token key was not found.");
  const cryptoKey = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, Buffer.from(parts[2], "base64url"), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("The identity token signature was not accepted.");
  assertIdentityClaims(payload);
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("The identity token subject was not accepted.");
  return payload;
}

export async function refreshOidc(refreshToken: string) {
  const config = await oidcConfiguration();
  const tokens = await client.refreshTokenGrant(config, refreshToken);
  return { refreshToken: tokens.refresh_token ?? null, accessToken: tokens.access_token };
}

export async function dexPasswordLogin(email: string, password: string) {
  const started = await startOidc();
  let current = started.url.href;
  let html = "";
  for (let hop = 0; hop < 6; hop += 1) {
    const response = await fetch(current, { redirect: "manual" });
    const location = response.headers.get("location");
    if (location && response.status >= 300 && response.status < 400) {
      current = new URL(location, current).href;
      continue;
    }
    html = await response.text();
    break;
  }
  const action = html.match(/action="([^"]+)"/)?.[1];
  if (!action) throw new Error("The identity provider login form was not found.");
  const posted = await fetch(new URL(action.replaceAll("&amp;", "&"), current), {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ login: email, password }),
  });
  const next = posted.headers.get("location");
  if (!next) throw new Error("The identity provider refused the password.");
  let callback = new URL(next, current);
  for (let hop = 0; hop < 4 && !callback.searchParams.get("code") && !callback.searchParams.get("error"); hop += 1) {
    const followed = await fetch(callback, { redirect: "manual" });
    const location = followed.headers.get("location");
    if (!location) break;
    callback = new URL(location, callback);
  }
  if (callback.searchParams.get("error") || !callback.searchParams.get("code")) {
    throw new Error("The identity provider refused the password.");
  }
  return { callback, ...started };
}
