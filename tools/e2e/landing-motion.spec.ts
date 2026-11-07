import {expect,test} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {mkdirSync} from "node:fs";
const out="artifacts/landing-autoplay";
const labels=["Plan the day","See the whole story","Keep care connected","Follow the billing","Work with confidence"];
const headings=["A calmer start to care.","The person behind the record.","Every handoff has context.","A clear view of billing.","The right context. The right access."];
test("all five walkthrough chapters remain accessible on desktop, tablet and narrow phones",async({page})=>{
  mkdirSync(out,{recursive:true});await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:1000});await page.goto("/");const film=page.getByRole("region",{name:"CuraSphere product walkthrough"});await expect(film).toBeVisible();const heights:number[]=[];
    for(let i=0;i<labels.length;i++){await page.getByRole("button",{name:new RegExp(labels[i]!)}).click();await expect(page.getByRole("heading",{name:headings[i],exact:true})).toBeVisible();await expect(film).toContainText(`Step ${i+1} of 5`);await expect(film).toContainText("Synthetic example · No live activity");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);heights.push((await page.locator('.film-window').boundingBox())!.height);if(width===1440||width===390)await page.screenshot({path:`${out}/web-${width}-chapter-${i}.png`,fullPage:true});}
    expect(Math.max(...heights)-Math.min(...heights),`chapter height at ${width}`).toBeLessThan(2);
  }
  await page.getByRole("link",{name:"Explore the workspace"}).click();await expect(page).toHaveURL(/\/login$/);
});
test("autoplay continues with the pointer over the window through five chapters and wraps",async({page})=>{
  await page.emulateMedia({reducedMotion:"no-preference"});await page.setViewportSize({width:1440,height:1000});await page.goto("/");const film=page.locator('.product-film');await film.scrollIntoViewIfNeeded();await page.locator('.film-scene h2').hover();await expect(film).toHaveAttribute('data-playing','true',{timeout:2000});
  for(let i=1;i<=5;i++)await expect(page.getByRole('heading',{name:headings[i%5],exact:true})).toBeVisible({timeout:10000});
});
test("Play resumes under the pointer and keyboard focus without requiring a blur",async({page})=>{
  await page.emulateMedia({reducedMotion:"no-preference"});await page.goto('/');const film=page.locator('.product-film');await film.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Pause walkthrough',exact:true}).click();await expect(film).toHaveAttribute('data-playing','false');await page.getByRole('button',{name:'Play walkthrough',exact:true}).click();await expect(film).toHaveAttribute('data-playing','true');await expect(page.getByRole('heading',{name:headings[1],exact:true})).toBeVisible({timeout:10000});
  await page.getByRole('button',{name:new RegExp(labels[0]!)}).click();await page.keyboard.press('Tab');await expect(film).toHaveAttribute('data-playing','false');const play=page.getByRole('button',{name:'Play walkthrough',exact:true});await play.focus();await play.press('Enter');await expect(film).toHaveAttribute('data-playing','true');await expect(page.getByRole('heading',{name:headings[1],exact:true})).toBeVisible({timeout:10000});
  await page.getByRole('button',{name:new RegExp(labels[4]!)}).click();await expect(film).toHaveAttribute('data-playing','true');await expect(page.getByRole('heading',{name:headings[0],exact:true})).toBeVisible({timeout:10000});
});
test("reduced motion defaults to still slides and explicit Play allows effect-free timed slides",async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');const film=page.locator('.product-film');await film.scrollIntoViewIfNeeded();await expect(film).toHaveAttribute('data-playing','false');await page.getByRole('button',{name:'Play walkthrough',exact:true}).click();await expect(film).toHaveAttribute('data-playing','true');await expect(page.getByRole('heading',{name:headings[1],exact:true})).toBeVisible({timeout:10000});expect(await page.locator('.film-scene').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');await page.getByRole('button',{name:'Pause walkthrough',exact:true}).click();await page.getByRole('button',{name:new RegExp(labels[0]!)}).click();await page.waitForTimeout(7000);await expect(page.getByRole('heading',{name:headings[0],exact:true})).toBeVisible();
});
test("offscreen views suspend playback and resume when visible",async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');const film=page.locator('.product-film');await film.scrollIntoViewIfNeeded();await expect(film).toHaveAttribute('data-playing','true');await page.getByRole('link',{name:'Patient portal',exact:false}).scrollIntoViewIfNeeded();await expect(film).toHaveAttribute('data-playing','false');await film.scrollIntoViewIfNeeded();await expect(film).toHaveAttribute('data-playing','true');
});
test("native five-chapter tour preserves accessibility, entry and return",async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>{localStorage.removeItem('curasphere.landing.v6');localStorage.setItem('curasphere.host.v2','127.0.0.1');});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8082');await expect(page.getByRole('button',{name:'Explore the workspace',exact:true})).toBeVisible();
  for(let i=0;i<labels.length;i++){await page.getByRole('button',{name:new RegExp(labels[i]!)}).click();await expect(page.getByRole('heading',{name:headings[i],exact:true})).toBeVisible();await expect(page.getByText(new RegExp(`Step ${i+1} of 5`))).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);await page.screenshot({path:`${out}/native-chapter-${i}.png`,fullPage:true});}
  await page.getByRole('button',{name:'Play walkthrough',exact:true}).click();await expect(page.getByRole('heading',{name:headings[0],exact:true})).toBeVisible({timeout:10000});await page.getByRole('button',{name:'Pause walkthrough',exact:true}).click();
  await page.getByRole('button',{name:'Explore the workspace',exact:true}).click();await expect(page.getByRole('button',{name:/Care team/})).toBeVisible();await page.getByRole('button',{name:'Discover CuraSphere',exact:true}).click();await expect(page.getByRole('button',{name:'Enter CuraSphere',exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test("native autoplay reaches the new chapters, wraps and resumes after an explicit pause",async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>localStorage.removeItem('curasphere.landing.v6'));await page.goto('http://127.0.0.1:8082');await expect(page.getByRole('heading',{name:headings[0],exact:true})).toBeVisible();
  for(let i=1;i<=5;i++)await expect(page.getByRole('heading',{name:headings[i%5],exact:true})).toBeVisible({timeout:12000});
  await page.getByRole('button',{name:'Pause walkthrough',exact:true}).click();await page.getByRole('button',{name:new RegExp(labels[3]!)}).click();await page.waitForTimeout(7000);await expect(page.getByRole('heading',{name:headings[3],exact:true})).toBeVisible();await page.getByRole('button',{name:'Play walkthrough',exact:true}).click();await expect(page.getByRole('heading',{name:headings[4],exact:true})).toBeVisible({timeout:10000});await expect(page.getByRole('heading',{name:headings[0],exact:true})).toBeVisible({timeout:10000});
  await page.setViewportSize({width:820,height:1000});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
