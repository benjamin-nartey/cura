import { expect, type Page } from "@playwright/test";

// Persistent local simulations retain prior bookings. Find a real free slot,
// rather than deleting history or assuming one particular Tuesday is empty.
export async function selectOpenFollowUpSlot(page:Page,offsetWeeks=1){
 const date=new Date();date.setUTCDate(date.getUTCDate()+7*offsetWeeks+((2-date.getUTCDay()+7)%7));
 for(let week=0;week<12;week++){
  const day=date.toISOString().slice(0,10);
  await page.goto(`/appointments/new?patient=pat_gh_kofi_a&practitioner=pr_gh_kwame&category=follow-up&date=${day}`);
  await expect(page.getByRole("heading",{name:"Book an appointment",exact:true})).toBeVisible();
  const slots=page.locator('input[name="startsAt"]');
  if(await slots.count()){await slots.first().check();return day;}
  await expect(page.getByText("No open time remains for that practitioner on that day.",{exact:true})).toBeVisible();
  date.setUTCDate(date.getUTCDate()+7);
 }
 throw new Error("No real follow-up slot was available within the twelve-week simulation window.");
}
