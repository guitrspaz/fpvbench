import {test,expect,beforeEach,afterEach,jest} from '@jest/globals';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,rename,stat,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore} from '../src/store.mjs';
import {createMemoryRepository} from './helpers/memory-repository.mjs';
import {createFilingService,airdataFilingState} from '../src/import-filing.mjs';
import {randomUUID} from 'node:crypto';
import {chmodSync} from 'node:fs';
let root,data,folder,store,service,clock;
const accountId=randomUUID();
beforeEach(async()=>{
 root=await mkdtemp(join(tmpdir(),'fpvbench-filing-test-'));data=join(root,'workspace');folder=join(root,'records');await mkdir(folder);
 store=await createStore(data,{repositoryFactory:createMemoryRepository});clock=Date.parse('2026-10-15T12:00:00Z');
 service=await createFilingService(data,{store,airdata:{getSettings:async()=>({accountId})},defaultFolder:folder,now:()=>clock});
});
afterEach(async()=>{await service.close();await store.close();await rm(root,{recursive:true,force:true});});
const add=(name,text='synthetic original')=>writeFile(join(folder,name),text);
const receipt=status=>({accountId,attemptId:randomUUID(),jobId:'job_SYNTHETIC',status,startedAt:new Date(clock).toISOString(),updatedAt:new Date(clock).toISOString(),message:'Synthetic receipt'});

test('a scan rechecks identical bytes once after a metadata-only read change; import still rejects later changes',async()=>{
 await add('a.ridlog');await service.close();let calls=0;
 service=await createFilingService(data,{store,defaultFolder:folder,now:()=>{if(++calls===4)chmodSync(join(folder,'a.ridlog'),0o640);return clock;}});
 const scan=await service.scanFolder();expect(scan.files[0].error).toBeNull();expect(scan.summary.newOriginals).toBe(1);
 await chmod(join(folder,'a.ridlog'),0o600);
 expect((await service.importFiles({scanId:scan.id,fileIds:[scan.files[0].id]})).results[0].ok).toBe(false);
 expect(store.getState().flightLogs).toHaveLength(0);
});

(process.getuid?.()===0?test.skip:test)('permission-denied sources explain access without importing or exposing filesystem errors',async()=>{
 await add('private.ridlog');const path=join(folder,'private.ridlog');await chmod(path,0);
 try {
  const scan=await service.scanFolder();expect(scan.summary.blockedFiles).toBe(1);expect(scan.files[0].error).toContain('Folder access was denied.');expect(scan.files[0].importable).toBe(false);expect(store.getState().flightLogs).toHaveLength(0);
 }finally{await chmod(path,0o600);}
});

test('scan is read-only, finds new bytes, renamed existing imports and duplicate copies',async()=>{
 await add('a.ridlog');await add('b.ridlog');await add('known.ridlog','known bytes');await add('ignored.jpg','not a log');
 await store.importLog({filename:'earlier-name.ridlog',contentBase64:Buffer.from('known bytes').toString('base64')});
 const before=await store.exportWorkspace();
 expect(await service.getScan()).toBeNull();
 const scan=await service.scanFolder();
 expect(scan.summary).toMatchObject({newOriginals:1,alreadyImportedFiles:1,extraCopies:1,unassignedImports:1,airdataToReview:0});
 expect(scan.files.find(f=>f.relativePath==='b.ridlog').duplicateOf).toBe('a.ridlog');
 expect(scan.files.find(f=>f.relativePath==='known.ridlog').logId).toBeTruthy();
 expect(await store.exportWorkspace()).toEqual(before);
 expect(await readFile(join(folder,'a.ridlog'),'utf8')).toBe('synthetic original');
});

test('explicit import retains originals, deduplicates and updates statuses without scanning again',async()=>{
 await add('a.ridlog');await add('b.ridlog');
 const scan=await service.scanFolder(),file=scan.files.find(f=>f.relativePath==='a.ridlog');
 const result=await service.importFiles({scanId:scan.id,fileIds:[file.id,file.id],sourceDevice:'Synthetic goggles'});
 expect(result.results).toHaveLength(1);expect(result.results[0]).toMatchObject({ok:true,duplicate:false,routing:'unassigned'});
 expect(store.getState().flightLogs).toHaveLength(1);
 const aircraft=await store.createAircraft({name:'Synthetic quad'});
 await store.updateFlightLog(result.results[0].logId,{aircraftId:aircraft.id});
 const refreshed=await service.getScan();
 expect(refreshed.summary.newOriginals).toBe(0);expect(refreshed.summary.unassignedImports).toBe(0);
 expect(refreshed.files.find(f=>f.id===file.id).aircraftName).toBe(aircraft.name);
 const before=await store.exportWorkspace();
 expect((await service.importFiles({scanId:scan.id,fileIds:[file.id]})).results[0].duplicate).toBe(true);
 expect(await store.exportWorkspace()).toEqual(before);
});

test('source changes and missing files fail individually while valid imports survive',async()=>{
 await add('a.ridlog','a');await add('b.ridlog','b');await add('c.ridlog','c');await add('bad.json','not valid JSON');
 const scan=await service.scanFolder();
 await add('b.ridlog','changed');await rm(join(folder,'c.ridlog'));
 const result=await service.importFiles({scanId:scan.id,fileIds:scan.files.map(f=>f.id)});
 expect(result.results.filter(r=>r.ok&&!r.duplicate)).toHaveLength(1);
 expect(result.results.filter(r=>!r.ok)).toHaveLength(3);
 expect(store.getState().flightLogs).toHaveLength(1);
 expect(await readFile(join(folder,'b.ridlog'),'utf8')).toBe('changed');
});

test('symlinks, empty files and oversized inputs never become importable records',async()=>{
 await add('empty.txt','');await symlink(join(root,'outside.txt'),join(folder,'linked.txt'));await writeFile(join(root,'outside.txt'),'outside');
 await service.close();service=await createFilingService(data,{store,defaultFolder:folder,limits:{fileBytes:8}});
 await add('large.txt','longer than eight bytes');
 const scan=await service.scanFolder();
 expect(scan.skipped.symlinks).toBe(1);expect(scan.summary.blockedFiles).toBe(2);
 expect(scan.files.every(f=>!f.importable)).toBe(true);
});

test('nested scans respect recursion and bounded file, depth and byte budgets with partial warnings',async()=>{
 await mkdir(join(folder,'nested'));await writeFile(join(folder,'nested','a.ridlog'),'nested');
 await add('z.ridlog','root');
 await service.updateSettings({folder,includeSubfolders:false});
 expect((await service.scanFolder()).files.map(f=>f.relativePath)).toEqual(['z.ridlog']);
 await service.updateSettings({includeSubfolders:true});
 await service.close();service=await createFilingService(data,{store,defaultFolder:folder,limits:{files:1}});
 let scan=await service.scanFolder();expect(scan.complete).toBe(false);expect(scan.files).toHaveLength(1);expect(scan.warnings.length).toBeGreaterThan(0);
 await service.close();service=await createFilingService(data,{store,defaultFolder:folder,limits:{bytes:2}});
 scan=await service.scanFolder();expect(scan.complete).toBe(false);expect(scan.files).toHaveLength(0);
 await service.close();service=await createFilingService(data,{store,defaultFolder:folder,limits:{depth:0}});
 scan=await service.scanFolder();expect(scan.complete).toBe(false);expect(scan.files.map(f=>f.relativePath)).toEqual(['z.ridlog']);
});

test('settings are private, survive restart, invalidate a scan, and preserve corrupt configuration',async()=>{
 await add('a.ridlog');const scan=await service.scanFolder();
 await service.updateSettings({folder,includeSubfolders:false});
 expect(await service.getScan()).toBeNull();
 await expect(service.importFiles({scanId:scan.id,fileIds:[scan.files[0].id]})).rejects.toMatchObject({status:409});
 expect((await stat(join(data,'.filing-config.json'))).mode&0o077).toBe(0);
 await service.close();service=await createFilingService(data,{store,defaultFolder:folder});
 expect((await service.getSettings()).includeSubfolders).toBe(false);
 expect(JSON.stringify(await store.exportWorkspace())).not.toContain(folder);
 await service.close();await writeFile(join(data,'.filing-config.json'),'{broken');
 service=await createFilingService(data,{store,defaultFolder:folder});
 expect((await service.getSettings()).locked).toBe(true);
 await expect(service.updateSettings({folder})).rejects.toMatchObject({status:409});
 expect(await readFile(join(data,'.filing-config.json'),'utf8')).toBe('{broken');
});

test('strict inputs, arbitrary file IDs, stale scan and workspace roots are rejected',async()=>{
 await add('a.ridlog');const scan=await service.scanFolder();
 for(const input of [{folder:'relative/path'},{folder:data},{folder:'\u0000'},{watch:true}])await expect(service.updateSettings(input)).rejects.toMatchObject({status:400});
 for(const input of [{scanId:scan.id,fileIds:[]},{scanId:scan.id,fileIds:['../outside.txt']},{scanId:scan.id,fileIds:Array(21).fill(scan.files[0].id)},{scanId:scan.id,fileIds:[scan.files[0].id],folder:'/'}])
  await expect(service.importFiles(input)).rejects.toMatchObject({status:400});
 clock+=31*60*1000;
 expect(await service.getScan()).toBeNull();
 await expect(service.importFiles({scanId:scan.id,fileIds:[scan.files[0].id]})).rejects.toMatchObject({status:409});
});

test('replaced roots and symlink substitutions cannot read outside the scanned folder',async()=>{
 await add('a.ridlog','same');const scan=await service.scanFolder();
 await rename(folder,join(root,'old-records'));await mkdir(folder);await add('a.ridlog','same');
 const result=await service.importFiles({scanId:scan.id,fileIds:[scan.files[0].id]});
 expect(result.results[0].ok).toBe(false);expect(store.getState().flightLogs).toHaveLength(0);
 const next=await service.scanFolder();await rm(join(folder,'a.ridlog'));await symlink(join(root,'outside.ridlog'),join(folder,'a.ridlog'));await writeFile(join(root,'outside.ridlog'),'same');
 expect((await service.importFiles({scanId:next.id,fileIds:[next.files[0].id]})).results[0].ok).toBe(false);
});

test('AirData filing separates explicit needs, unconfirmed, receipts, unsupported formats and account identities',()=>{
 const log={format:'dji-txt',airdataStatus:'unknown'};
 expect(airdataFilingState(log,accountId)).toMatchObject({state:'unconfirmed',needsReview:true,eligible:true});
 expect(airdataFilingState({...log,airdataStatus:'not-uploaded'},accountId).state).toBe('needs-send');
 expect(airdataFilingState({...log,airdataStatus:'uploaded'},accountId).needsReview).toBe(false);
 for(const status of ['success','pending','running','unknown','submitting'])expect(airdataFilingState({...log,airdataTransfer:receipt(status)},accountId).needsReview).toBe(false);
 expect(airdataFilingState({...log,airdataTransfer:receipt('error')},accountId).needsReview).toBe(true);
 expect(airdataFilingState({...log,airdataTransfer:receipt('success')},randomUUID()).state).toBe('unconfirmed');
 expect(airdataFilingState({...log,format:'unknown-log'},accountId).needsReview).toBe(false);
});

test('file-budget and scan-time bounds stop work instead of reporting a complete empty folder',async()=>{
 await add('a.ridlog');
 await service.close();service=await createFilingService(data,{store,defaultFolder:folder,limits:{entries:0}});
 expect((await service.scanFolder()).complete).toBe(false);
 await service.close();let tick=0;service=await createFilingService(data,{store,defaultFolder:folder,now:()=>tick++,limits:{ms:0}});
 expect((await service.scanFolder()).complete).toBe(false);
});

test('overlapping operations are rejected and close waits for the active operation',async()=>{
 await add('a.ridlog');await service.scanFolder();
 const original=store.importLog;let release,started;
 const waiting=new Promise(resolve=>{started=resolve;});const hold=new Promise(resolve=>{release=resolve;});
 store.importLog=jest.fn(async input=>{started();await hold;return original(input);});
 const scan=await service.getScan(),importing=service.importFiles({scanId:scan.id,fileIds:[scan.files[0].id]});
 await waiting;await expect(service.scanFolder()).rejects.toMatchObject({status:409});
 let closed=false;const closing=service.close().then(()=>{closed=true;});await Promise.resolve();expect(closed).toBe(false);
 release();await importing;await closing;expect(closed).toBe(true);
});

test('a source ancestor skips the private workspace subtree instead of importing its backup files',async()=>{
 await add('a.ridlog');
 await service.updateSettings({folder:root});
 const scan=await service.scanFolder();
 expect(scan.skipped.workspace).toBe(1);
 expect(scan.files.map(file=>file.relativePath)).toEqual([join('records','a.ridlog')]);
});
