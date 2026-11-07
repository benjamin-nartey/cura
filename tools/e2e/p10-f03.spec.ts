import {expect,test,type Page} from "@playwright/test";

const endpoint = "/api/gateway/lifecycle";
const facilityId = "fac_riverside";

async function login(page:Page, userId:string) {
  await page.goto("/login");
  await page.locator(".development-login summary").click();
  await page.getByLabel("Workspace identity").selectOption(userId);
  await page.locator('form[action="/api/session"] button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/);
}

test("authorized synthetic administrator sees a registered release and its failed reevaluation", async ({page,browser}) => {
  await login(page,"usr_admin");
  const query = endpoint + "?" + new URLSearchParams({facility:facilityId});
  const before = await page.request.get(query);
  expect(before.status()).toBe(200);
  const initial = await before.json();
  const suffix = crypto.randomUUID();
  const pair = {promptId:`prm_lifecycle_${suffix}`,promptVersion:1,modelId:`mdl_lifecycle_${suffix}`,modelVersion:"1"};
  async function command(data:Record<string,unknown>) {
    const response = await page.request.post(endpoint,{data:{facilityId,...data}});
    expect(response.status()).toBe(200);
    return response.json();
  }
  await command({action:"register-model",id:pair.modelId,version:pair.modelVersion,provider:"synthetic-probe",maxOutputCharacters:120,maxCitations:2});
  await command({
    action:"register-prompt",id:pair.promptId,version:pair.promptVersion,name:"Synthetic lifecycle smoke",
    schema:{required:["citations"],citationsMin:1,dispatchPolicy:{
      version:1,dataClass:"synthetic",organizationId:"org_harborlight",facilityId,
      jurisdiction:"local-synthetic",purpose:"TREATMENT",provider:"synthetic-probe",
      modelId:pair.modelId,modelVersion:pair.modelVersion,approvedInputs:["Synthetic lifecycle smoke"],
    }},
  });
  const evaluated = await command({action:"evaluate",...pair,verdict:"passed",evidenceRef:"synthetic-fixture-v1"});
  await command({action:"alias",expectedRevision:initial.alias.revision,evaluationId:evaluated.evaluationId});
  await page.goto("/gateway?" + new URLSearchParams({facility:facilityId}));
  const registry = page.getByRole("region",{name:"Synthetic release registry"});
  await expect(registry.getByText(/Eligible pair/)).toContainText(pair.promptId);

  const clinician = await browser.newContext();
  try {
    const other = await clinician.newPage();
    await login(other,"usr_amira");
    expect((await other.request.get(query)).status()).toBe(403);
    expect((await other.request.post(endpoint,{data:{facilityId,action:"alias",expectedRevision:initial.alias.revision+1,evaluationId:null}})).status()).toBe(403);
  } finally {
    await clinician.close();
  }
  await command({action:"evaluate",...pair,verdict:"failed",evidenceRef:"synthetic-fixture-regression"});
  await page.reload();
  await expect(registry.getByText(/Release unavailable/)).toBeVisible();
  await expect(registry.getByText(/synthetic-fixture-regression/)).toContainText("failed");
  await command({action:"alias",expectedRevision:initial.alias.revision+1,evaluationId:null});
});
