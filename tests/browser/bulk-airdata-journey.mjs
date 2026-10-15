import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

/** Bulk manual bookkeeping with synthetic originals and no new provider requests. */
export async function runBulkAirdataJourney({page,expect,baseURL,folder,screenshotDir,provider,airdata}) {
  const aiCalls=provider.calls.length,airdataCalls=airdata.calls.length,errors=[];
  const onError=error=>errors.push(error.message);page.on('pageerror',onError);
  const request=async(path,input,method='POST')=>{const response=await page.request.fetch(baseURL+path,{method,data:input});expect(response.ok()).toBe(true);return response.json();};
  const state=async()=>(await page.request.get(baseURL+'/api/state')).json();
  const aircraft=await request('/api/aircraft',{name:'Bulk mark aircraft'});
  const other=await request('/api/aircraft',{name:'Bulk excluded aircraft'});
  const receiptLog=(await state()).flightLogs.find(log=>log.airdataTransfer?.status==='success');
  expect(receiptLog).toBeTruthy();
  await request('/api/flight-logs/'+receiptLog.id,{aircraftId:aircraft.id},'PATCH');
  const created=[];
  for(let i=0;i<27;i++){
    const bytes=Buffer.alloc(16);Buffer.from([0x55,0x4c,0x6f,0x67,1,0x12,0x35]).copy(bytes);bytes.writeUInt32LE(i+9000,8);
    const filename=`bulk-synthetic-${i}.ulg`;
    const imported=await request('/api/log-imports',{filename,aircraftId:i<26?aircraft.id:other.id,contentBase64:bytes.toString('base64')});
    created.push(imported.flightLog);await writeFile(join(folder,filename),bytes);
  }
  await request('/api/flight-logs/'+created[0].id,{airdataStatus:'uploaded'},'PATCH');
  await request('/api/flight-logs/'+created[1].id,{airdataStatus:'not-uploaded'},'PATCH');
  // Keep the connection identity/receipt, but remove the developer key to prove offline availability.
  await request('/api/airdata/settings',{appKey:null},'PATCH');
  const scan=await request('/api/filing/scan',{});
  const before=await(await page.request.get(baseURL+'/api/export')).json();
  await page.reload();await page.getByLabel('Fleet status filter',{exact:true}).selectOption('all');
  await page.getByLabel('Selected aircraft').selectOption(aircraft.id);
  await page.getByRole('button',{name:'Flight log library',exact:true}).click();
  await page.getByLabel('Filter aircraft assignment').selectOption('selected');
  await page.getByRole('button',{name:'Select all matching',exact:true}).click();
  await expect(page.getByText('27 selected',{exact:true})).toBeVisible();
  await page.getByLabel('Filter AirData upload status').selectOption('not-uploaded');
  await expect(page.getByText('0 selected',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Mark selected as uploaded',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Select all matching',exact:true}).click();
  await expect(page.getByText('25 selected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear selection',exact:true}).click();
  await expect(page.getByText('0 selected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Select all matching',exact:true}).click();
  await expect(page.getByRole('button',{name:'Send selected logs to AirData',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Mark selected as uploaded',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Mark selected as uploaded',exact:true}).click();
  await expect(page.getByText('25 marked as uploaded · 0 already marked. No files were sent.',{exact:true})).toBeVisible();
  const expected=structuredClone(before);
  for(const log of expected.flightLogs)if(created.slice(1,26).some(item=>item.id===log.id))log.airdataStatus='uploaded';
  expect(await(await page.request.get(baseURL+'/api/export')).json()).toEqual(expected);
  const refreshed=await(await page.request.get(baseURL+'/api/filing/scan')).json();
  expect(refreshed.id).toBe(scan.id);expect(refreshed.summary.airdataToReview).toBe(1);
  await page.getByRole('button',{name:'Review flight-record folder',exact:true}).click();
  await page.getByLabel('Filter folder review').selectOption('airdata');
  await expect(page.locator('#filing-rows .filing-file')).toHaveCount(1);
  await expect(page.locator('#filing-rows').getByRole('heading',{name:'bulk-synthetic-26.ulg',exact:true})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'Flight log library',exact:true}).click();
  await page.getByLabel('Filter aircraft assignment').selectOption('selected');
  await page.getByLabel('Filter AirData upload status').selectOption('uploaded');
  await expect(page.getByText('26 of 27 flights',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Select all matching',exact:true}).click();
  await page.getByLabel('Filter aircraft assignment').selectOption('unassigned');
  await expect(page.getByText('0 selected',{exact:true})).toBeVisible();
  await page.getByLabel('Filter aircraft assignment').selectOption('all');
  await page.getByLabel('Filter AirData upload status').selectOption('');
  await page.getByLabel('Select bulk-synthetic-26.ulg',{exact:true}).check();
  await page.route(baseURL+'/api/flight-logs/mark-uploaded',route=>route.fulfill({status:500,json:{error:'Synthetic mark failure'}}));
  await page.getByRole('button',{name:'Mark selected as uploaded',exact:true}).click();
  await expect(page.getByText('0 newly marked · 0 already marked. Synthetic mark failure Some selected records may still need a mark.',{exact:true})).toBeVisible();
  await page.unroute(baseURL+'/api/flight-logs/mark-uploaded');
  expect((await state()).flightLogs.find(log=>log.id===created[26].id).airdataStatus).toBe('unknown');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  if(screenshotDir)await page.screenshot({path:screenshotDir+'/bulk-marks-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});
  if(screenshotDir)await page.screenshot({path:screenshotDir+'/bulk-marks-desktop.png'});
  expect(provider.calls).toHaveLength(aiCalls);expect(airdata.calls).toHaveLength(airdataCalls);
  expect(errors).toEqual([]);page.off('pageerror',onError);
  return {errors,passed:['all matching respects aircraft and status filters','selection count and clearing','manual marks work without AirData key','more than twenty marked without sending','all other evidence and receipts preserved','folder review updates without rescan','marks survive reload','failed marking reports failure and leaves records unchanged','mobile overflow','no provider calls']};
}
