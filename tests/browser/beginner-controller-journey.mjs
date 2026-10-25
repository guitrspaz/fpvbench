import { fullControllerExport } from '../helpers/controller-fixtures.mjs';

/** A synthetic sequence of role changes, modeled on the kinds of setups a new pilot reviews. */
export async function runBeginnerControllerJourney({page,expect,baseURL,screenshotDir}){
  const errors=[];const onError=e=>errors.push(e.message);page.on('pageerror',onError);
  await page.setViewportSize({width:1440,height:1000});
  const post=async(path,data)=>{const r=await page.request.post(baseURL+path,{data});expect(r.ok()).toBe(true);return r.json();};
  const aircraft=await post('/api/aircraft',{name:'New pilot example'});
  const make=(label,rows)=>post('/api/snapshots',{aircraftId:aircraft.id,label,filename:'synthetic.txt',rawText:fullControllerExport(rows)});
  const original=await make('Original backup',{0:'0 0 1700 2100 0 0',1:'1 1 900 2100 0 0'});
  const middle=await make('Practice backup',{0:'0 1 1300 2100 0 0',1:'1 0 900 1700 0 0',2:'46 1 1700 2100 0 0'});
  const latest=await make('Latest backup',{0:'0 3 1700 2100 0 0',1:'1 0 900 1700 0 0',2:'46 2 1700 2100 0 0',3:'13 4 1700 2100 0 0',4:'35 1 1700 2100 0 0',5:'36 1 1300 2100 0 0',6:'40 8 900 2100 0 0'});
  await page.goto(baseURL);await page.getByLabel('Fleet status filter',{exact:true}).selectOption('all');
  await page.getByLabel('Selected aircraft').selectOption(aircraft.id);
  await page.getByRole('button',{name:'My controller',exact:true}).click();
  const panel=page.getByRole('region',{name:'Controller 3 map',exact:true});
  const detail=panel.getByRole('region',{name:'Selected physical control',exact:true});
  await expect(page.getByLabel('Controller setup')).toHaveValue(latest.id);
  await expect(page.getByLabel('Controller reference')).toHaveValue(middle.id);
  await expect(panel.getByText('4 expected button changes',{exact:true})).toBeVisible();
  await expect(panel.getByText('1 other saved action has no identified button',{exact:true})).toBeVisible();
  await expect(panel.locator('[data-control="start-stop"]')).toContainText('Arm / disarm motors');
  await expect(panel.locator('[data-control="pause-rth"]')).toContainText('GPS recovery');
  await expect(panel.locator('[data-control="c1"]')).toContainText('Find the quad');
  await expect(panel.locator('[data-control="flight-mode"]')).toContainText('Self-leveling flight');
  expect(await panel.innerText()).not.toMatch(/AUX\d|1700|2100|Import warnings|Physically verified/);
  await panel.locator('[data-control="c2"]').click();
  await expect(detail.getByText('Arming permission',{exact:true})).toBeVisible();
  await expect(detail.getByText('Crash-flip mode',{exact:true})).toBeVisible();
  await expect(detail.getByText(/does not stop motors that are already armed/)).toBeVisible();
  await expect(detail.locator('.controller-shared-action')).toHaveCount(0);
  expect(await detail.innerText()).not.toMatch(/\b(top|middle|bottom)\b/i);
  await panel.getByRole('button',{name:'See what changed',exact:true}).click();
  await expect(panel.getByRole('heading',{name:'What changed',exact:true})).toBeInViewport();
  const changes=panel.getByRole('region',{name:'Plain-language button changes',exact:true});
  await expect(changes.getByRole('article')).toHaveCount(4);
  await expect(changes.getByRole('article').filter({hasText:'C1 button'})).toContainText('Now: Find the quad');
  await page.getByLabel('Controller setup').selectOption(middle.id);
  await expect(page.getByLabel('Controller reference')).toHaveValue(original.id);
  await expect(detail.getByText(/both motor arming and GPS recovery/)).toBeVisible();
  await page.getByLabel('Controller setup').selectOption(latest.id);
  await expect(panel.getByText('4 expected button changes',{exact:true})).toBeVisible();
  await panel.locator('[data-control="c2"]').click();
  await panel.locator('[data-control="c2"]').scrollIntoViewIfNeeded();
  if(screenshotDir)await page.screenshot({path:screenshotDir+'/fpvbench-beginner-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await panel.locator('[data-control="pause-rth"]').click();
  await expect(detail.getByText(/not pause and hover/)).toBeVisible();
  if(screenshotDir)await page.screenshot({path:screenshotDir+'/fpvbench-beginner-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Compare setups',exact:true}).click();
  await page.getByLabel('Earlier setup').selectOption(middle.id);
  await page.getByLabel('Later setup').selectOption(latest.id);
  await expect(panel.getByText('4 expected button changes',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Change filter')).not.toBeVisible();
  expect(await page.getByLabel('Workbench content').innerText()).not.toMatch(/AUX\d|1700|2100|Unknown command/);
  await page.getByText('Advanced setting comparison',{exact:true}).click();
  await expect(page.getByLabel('Change filter')).toBeVisible();
  const updated=await post('/api/snapshots',{aircraftId:aircraft.id,label:'Updated software backup',filename:'synthetic.txt',
    rawText:fullControllerExport({0:'0 3 1700 2100 0 0'}).replace('4.5.2','4.5.5')});
  await page.reload();
  await page.getByRole('button',{name:'My controller',exact:true}).click();
  await expect(panel.getByText(/different aircraft software or hardware/)).toBeVisible();
  await expect(panel.getByText('There is not enough information for a full comparison.',{exact:true})).toBeVisible();
  expect(await panel.innerText()).not.toMatch(/14 AUX|0 confirmed/);
  for(const s of [original,middle,latest,updated]){
    const saved=await(await page.request.get(baseURL+'/api/snapshots/'+s.id)).json();
    expect(saved.controller).toBeUndefined();
  }
  expect(errors).toEqual([]);page.off('pageerror',onError);
  return {passed:['plain action names','one layout confidence note','four readable role changes','prearm distinct from motor stop','historical shared arm/rescue notice','no guessed switch direction','change jump','unlinked custom action','no technical jargon by default','advanced comparison preserved','mobile and keyboard-compatible controls','reading never saves verification','software-version differences explained'],errors};
}
