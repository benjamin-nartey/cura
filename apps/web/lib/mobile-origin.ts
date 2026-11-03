/** Same-host Expo browser previews only. Native requests authenticate without Origin. */
export function allowedMobileOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const value = new URL(origin);
    const target = new URL(request.url);
    // Next can normalize its internal URL to the bind address. Browser Host
    // remains the requested service host; forwarded headers are not trusted.
    const host = request.headers.get("host");
    if (host) target.host = host;
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return value.protocol === target.protocol && (value.host === target.host ||
      (value.port === "8082" && (value.hostname === target.hostname || loopback.has(value.hostname) && loopback.has(target.hostname))));
  } catch { return false; }
}
