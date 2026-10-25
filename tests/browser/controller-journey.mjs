import { fullControllerExport } from '../helpers/controller-fixtures.mjs';
/** Synthetic Controller 3 journey; uses the existing memory-backed loopback server. */
export async function runControllerJourney({page,expect,baseURL,screenshotDir}) {
  await page.setViewportSize({width:1440,height:1000});
  const errors=[];const onError=e=>errors.push(e.message);page.on('pageerror',onError);
  const post=async(path,data,method='POST')=>{
    const response=await page.request.fetch(baseURL+path,{method,data});expect(response.ok()).toBe(true);return response.json();
  };
  const aircraft=await post('/api/aircraft',{name:'Controller 3 test quad'});
  const raw=(rows,kind='dump')=>fullControllerExport(Object.fromEntries(rows.split('\n').filter(Boolean).map(row=>{
    const tokens=row.trim().split(/\s+/);return[tokens[1],tokens.slice(2).join(' ')];
  })),{kind});
  const make=(label,rawText)=>post('/api/snapshots',{aircraftId:aircraft.id,label,filename:'synthetic.txt',rawText});
  const before=await make('Controller reference',raw('aux 0 0 1 1300 2100 0 0\naux 1 1 0 900 1700 0 0\naux 2 13 4 1700 2100 0 0'));
  await new Promise(r=>setTimeout(r,5));
  const after=await make('Controller revised',raw('aux 0 0 3 1700 2100 0 0\naux 1 1 0 900 1700 0 0\naux 2 13 4 1700 2100 0 0\naux 3 35 1 1700 2100 0 0\naux 4 36 1 1300 2100 0 0\naux 5 46 2 1700 2100 0 0'));
  const controls=Object.fromEntries([['flight-mode',1],['c2',2],['pause-rth',3],['start-stop',4],['c1',5]].map(([id,aux])=>[id,{kind:'aux',aux,positions:[],note:'',verified:true}]));
  await post('/api/snapshots/'+before.id+'/controller',{model:'dji-fpv-rc3',revision:0,controls},'PUT');
  await page.goto(baseURL);await page.getByLabel('Fleet status filter',{exact:true}).selectOption('all');
  await page.getByLabel('Selected aircraft').selectOption(aircraft.id);
  await page.getByRole('button',{name:'My controller',exact:true}).click();
  await expect(page.getByLabel('Controller setup')).toHaveValue(after.id);
  await expect(page.getByLabel('Controller reference')).toHaveValue(before.id);
  const panel=page.getByRole('region',{name:'Controller 3 map',exact:true});
  await expect(panel.getByText('3 expected button changes',{exact:true})).toBeVisible();
  await expect(panel.locator('[data-control="start-stop"]')).toContainText('Arm / disarm motors');
  await expect(panel.getByText('Button layout needs checking',{exact:true})).toBeVisible();
  expect(await panel.innerText()).not.toMatch(/AUX\d|1700|2100|Mode evidence|Interpretation limits/);
  await expect(panel.locator('[data-control="power"]')).toContainText('Controller power');
  const untouched=await(await page.request.get(baseURL+'/api/snapshots/'+after.id)).json();
  expect(untouched.controller).toBeUndefined();
  await expect(panel.locator('[data-control="start-stop"]')).toContainText('Expected change');
  await expect(panel.locator('[data-control="gimbal"]')).toContainText('Not described by this backup');
  await panel.locator('[data-control="c1"]').click();
  const detail=panel.getByRole('region',{name:'Selected physical control',exact:true});
  async function openEditor(){
    const group=detail.locator('.controller-button-advanced');
    if(await group.getAttribute('open')===null)await group.locator(':scope > summary').click();
    const edit=detail.locator('.controller-edit');
    if(await edit.getAttribute('open')===null)await edit.locator(':scope > summary').click();
  }
  async function openSetup(){
    const group=panel.locator('.controller-setup-advanced');
    if(await group.getAttribute('open')===null)await group.locator(':scope > summary').click();
  }
  await openEditor();
  await detail.getByLabel('Measured positions',{exact:true}).fill('Released = 1000\nPressed = 2000');
  await detail.getByLabel('Control observations',{exact:true}).fill('<img src=x onerror="window.controllerInjected=true">');
  await detail.getByLabel('I physically checked this mapping and its recorded positions for this setup.',{exact:true}).check();
  await detail.getByRole('button',{name:'Save control observations',exact:true}).click();
  await expect(panel.locator('[data-control="c1"]')).toContainText('Checked on controller');
  await expect(panel.locator('[data-control="c1"]')).not.toContainText('Not checked on controller');
  await panel.locator('[data-control="c1"]').click();
  await expect(detail.getByText('Pressed — Find the quad',{exact:true})).toBeVisible();
  const one=await(await page.request.get(baseURL+'/api/snapshots/'+after.id)).json();
  expect(Object.keys(one.controller.controls)).toEqual(['c1']);
  const partialView=await(await page.request.get(baseURL+'/api/snapshots/'+after.id+'/controller')).json();
  expect(partialView.controls.find(c=>c.id==='start-stop').mappingSource).toBe('suggested');
  await openSetup();
  await panel.getByRole('button',{name:'Use suggested AUX mapping (unverified)',exact:true}).click();
  const adopted=await(await page.request.get(baseURL+'/api/snapshots/'+after.id+'/controller')).json();
  expect(adopted.controls.find(c=>c.id==='start-stop').mappingSource).toBe('recorded');
  await expect(panel.locator('[data-control="c1"]')).not.toContainText('Not checked on controller');
  expect(await page.evaluate(()=>window.controllerInjected)).toBeUndefined();
  await page.reload();await page.getByRole('button',{name:'My controller',exact:true}).click();
  await panel.locator('[data-control="c1"]').click();
  await openEditor();
  await expect(detail.getByLabel('Control observations',{exact:true})).toHaveValue('<img src=x onerror="window.controllerInjected=true">');
  await detail.getByLabel('Control observations',{exact:true}).fill('Synthetic check changed');
  await expect(detail.getByLabel('I physically checked this mapping and its recorded positions for this setup.',{exact:true})).not.toBeChecked();
  // Copying is explicit and resets all verification, without rewriting the reference.
  await openSetup();
  await panel.getByRole('button',{name:'Copy reference mapping (reset verification)',exact:true}).click();
  await expect(panel.locator('[data-control="c1"]')).not.toContainText('Checked on controller');
  await openSetup();
  await expect(panel.getByText('0 physically verified',{exact:true})).toBeVisible();
  const old=await(await page.request.get(baseURL+'/api/snapshots/'+before.id+'/controller')).json();
  expect(old.controls.find(c=>c.id==='c1').verified).toBe(true);
  // Native functions have an explicit classification instead of being called unused.
  await panel.locator('[data-control="shutter"]').click();
  await openEditor();
  await detail.getByLabel('Physical control mapping',{exact:true}).selectOption('external');
  await detail.getByLabel('Control observations',{exact:true}).fill('Synthetic camera observation');
  await detail.getByRole('button',{name:'Save control observations',exact:true}).click();
  await expect(panel.locator('[data-control="shutter"]')).toContainText('Controller or camera control');
  await panel.locator('[data-control="gimbal"]').click();
  await openEditor();
  await detail.getByLabel('Physical control mapping',{exact:true}).selectOption('8');
  await detail.getByRole('button',{name:'Save control observations',exact:true}).click();
  await expect(panel.locator('[data-control="gimbal"]')).toContainText('No aircraft action saved');
  // Failed writes keep the current observations; the stale editor explains the next step.
  await openEditor();
  await detail.getByLabel('Control observations',{exact:true}).fill('Must not persist');
  const endpoint='**/api/snapshots/'+after.id+'/controller';
  await page.route(endpoint,async route=>{
    if(route.request().method()==='PUT')await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'This controller mapping changed. Reload before saving.'})});
    else await route.continue();
  });
  await detail.getByRole('button',{name:'Save control observations',exact:true}).click();
  await expect(panel.getByText('This controller mapping changed. Reload before saving.',{exact:true})).toBeVisible();
  const saved=await(await page.request.get(baseURL+'/api/snapshots/'+after.id+'/controller')).json();
  expect(saved.controls.find(c=>c.id==='gimbal').mapping.note).toBe('');
  await page.unroute(endpoint);
  // Unknown exports never inflate confirmed behavior counts.
  const sparse=await make('Controller sparse',raw('aux 0 0 3 1700 2100 0 0','diff'));
  await page.reload();await page.getByRole('button',{name:'My controller',exact:true}).click();
  await expect(page.getByLabel('Controller setup')).toHaveValue(sparse.id);
  await expect(panel.getByText('There is not enough information for a full comparison.',{exact:true})).toBeVisible();
  expect(await panel.innerText()).not.toMatch(/AUX\d|1700|2100|Interpretation limits/);
  await openSetup();
  await expect(panel.getByText('Comparison gaps · 5 AUX channels with recorded rules',{exact:true})).toBeVisible();
  await page.getByLabel('Controller setup').selectOption(after.id);
  await page.getByLabel('Controller reference').selectOption(before.id);
  await panel.locator('[data-control="c2"]').focus();await page.keyboard.press('Space');
  await expect(panel.locator('[data-control="c2"]')).toHaveAttribute('aria-pressed','true');
  await expect(detail.getByRole('heading',{name:'C2 switch',exact:true})).toBeVisible();
  if(screenshotDir)await page.screenshot({path:screenshotDir+'/fpvbench-controller-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await panel.locator('[data-control="start-stop"]').click();
  await expect(detail.getByRole('heading',{name:'Start / Stop',exact:true})).toBeVisible();
  if(screenshotDir)await page.screenshot({path:screenshotDir+'/fpvbench-controller-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Compare setups',exact:true}).click();
  await page.getByLabel('Earlier setup').selectOption(before.id);
  await page.getByLabel('Later setup').selectOption(after.id);
  await expect(panel.getByText('3 expected button changes',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Change filter')).not.toBeVisible();
  await page.getByText('Advanced setting comparison',{exact:true}).click();
  await expect(page.getByLabel('Change filter')).toHaveValue('changes');
  await page.getByLabel('Later setup').selectOption(sparse.id);
  await expect(panel.getByText('There is not enough information for a full comparison.',{exact:true})).toBeVisible();
  await page.getByText('Advanced setting comparison',{exact:true}).click();
  await expect(page.locator('tbody tr').filter({hasText:'unknown'})).toHaveCount(0);
  await page.getByLabel('Change filter').selectOption('unknown');
  await expect(page.locator('tbody tr').filter({hasText:'unknown'}).first()).toBeVisible();
  expect(errors).toEqual([]);page.off('pageerror',onError);
  return {passed:['beginner default without channel jargon','advanced editing preserved','setup-scoped map','previous-import reference','normalized channel changes','unsaved preview without writes','single-control save isolation','full CLI warnings isolated','unverified template','explicit verification','measured positions','inert notes','reload','edits reset verification','copy resets verification','reference isolation','native functions','unassigned channel','failed save preserves observations','sparse comparison separate','keyboard controls','desktop and mobile','raw unknowns separate'],errors};
}
