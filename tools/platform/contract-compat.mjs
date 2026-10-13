export function compatibilityErrors(baseline, candidate) {
  const errors = [];
  if (!candidate || candidate.version !== baseline.version) errors.push("The contract version does not match.");
  const routes = new Map((candidate.routes ?? []).map((route) => [`${route.method} ${route.path}`, route]));
  for (const route of baseline.routes ?? []) {
    const key = `${route.method} ${route.path}`;
    const next = routes.get(key);
    if (!next) {
      errors.push(`${key} was removed.`);
      continue;
    }
    if (next.status !== route.status) errors.push(`${key} status changed from ${route.status} to ${next.status}.`);
    const fields = new Set(next.responseFields ?? []);
    for (const field of route.responseFields ?? []) {
      if (!fields.has(field)) errors.push(`${key} lost response field ${field}.`);
    }
  }
  return errors;
}

export function renderPlatformModule(contract) {
  const routes = contract.routes
    .map((route) => `  { method: "${route.method}", path: "${route.path}", status: ${route.status}, responseFields: ${JSON.stringify(route.responseFields)} }`)
    .join(",\n");
  return `/** Generated from platform-contract.json. Do not edit by hand. */\nexport const platformContractVersion = "${contract.version}" as const;\nexport const platformRoutes = [\n${routes}\n] as const;\n`;
}
