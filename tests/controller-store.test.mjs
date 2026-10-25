import { beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../src/store.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';
import { suggestedController, controllerView } from '../src/controller.mjs';
import { validateCompleteBackup } from '../src/restore.mjs';

let dir,store,repository,a,b;
const rawText='# dump all\n# Betaflight / TEST 4.5.2\naux 0 0 3 1700 2100 0 0\nset test = 1\nsave\n';
const input=(revision=0)=>{const template=suggestedController();return {...template,revision,controls:Object.fromEntries(Object.entries(template.controls).map(([id,{verifiedAt:_time,...m}])=>[id,m]))};};
beforeEach(async()=>{
  dir=await mkdtemp(join(tmpdir(),'fpvbench-controller-test-'));repository=createMemoryRepository();
  store=await createStore(dir,{repositoryFactory:()=>repository});
  const aircraft=await store.createAircraft({name:'Controller fixture'});
  a=await store.importSnapshot({aircraftId:aircraft.id,label:'Earlier',filename:'synthetic.txt',rawText});
  b=await store.importSnapshot({aircraftId:aircraft.id,label:'Later',filename:'synthetic.txt',rawText});
});
afterEach(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});
test('saves only observations, stamps explicit verification, and preserves immutable evidence and other snapshots',async()=>{
  const data=input();data.controls['start-stop'].verified=true;
  data.controls['start-stop'].positions=[{label:'Pressed',value:2000}];
  const result=await store.saveController(a.id,data);
  expect(result.revision).toBe(1);expect(result.controls['start-stop'].verifiedAt).toMatch(/^20/);
  expect(store.getSnapshot(b.id).controller).toBeUndefined();
  const saved=store.getSnapshot(a.id);
  expect(saved.rawText).toBe(rawText);expect(saved.parsed).toEqual(a.parsed);expect(saved.sha256).toBe(a.sha256);
  const again=input(1);again.controls['start-stop']=data.controls['start-stop'];
  const next=await store.saveController(a.id,again);
  expect(next.controls['start-stop'].verifiedAt).toBe(result.controls['start-stop'].verifiedAt);
});
test('rejects stale concurrent editors without overwriting the saved revision',async()=>{
  const results=await Promise.allSettled([store.saveController(a.id,input()),store.saveController(a.id,input())]);
  expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']);
  expect(results[1].reason.status).toBe(409);expect(store.getSnapshot(a.id).controller.revision).toBe(1);
});
test('a repository failure is atomic and leaves the previous observations available',async()=>{
  const save=jest.spyOn(repository,'save').mockImplementationOnce(()=>{throw new Error('Synthetic persistence failure');});
  await expect(store.saveController(a.id,input())).rejects.toThrow(/persistence failure/);
  expect(store.getSnapshot(a.id).controller).toBeUndefined();save.mockRestore();
  expect((await store.saveController(a.id,input())).revision).toBe(1);
});
test('restart, complete backup validation, and older snapshots preserve observation semantics',async()=>{
  await store.saveController(a.id,input());
  const backup=await store.exportWorkspace();
  expect(validateCompleteBackup(backup).catalog.snapshots[0].controller.revision).toBe(1);
  expect(validateCompleteBackup(backup).catalog.snapshots[1].controller).toBeUndefined();
  await store.close();store=await createStore(dir,{repositoryFactory:()=>repository});
  expect(controllerView(store.getSnapshot(a.id)).controls.find(c=>c.id==='start-stop').assignment).toBe('assigned');
  const invalid=structuredClone(backup);invalid.snapshots[0].controller.controls.c1.aux=99;
  expect(()=>validateCompleteBackup(invalid)).toThrow();
});
test('strict mappings reject unknown fields, invalid types, fabricated timestamps and unknown verified controls',async()=>{
  for(const edit of [
    data=>{data.controls.c1.aux=15;},data=>{data.controls.c1.positions=null;},
    data=>{data.controls.c1.verifiedAt='2026-10-24T00:00:00.000Z';},
    data=>{data.controls.c1.kind='unknown';data.controls.c1.aux=null;data.controls.c1.verified=true;},
    data=>{data.controls.imaginary=data.controls.c1;},
    data=>{data.controls.c1.positions=[{label:'Top',value:1000},{label:'Top',value:2000}];}
  ]){
    const data=input();edit(data);await expect(store.saveController(a.id,data)).rejects.toThrow();
    expect(store.getSnapshot(a.id).controller).toBeUndefined();
  }
  await expect(store.saveController('missing',input())).rejects.toMatchObject({status:404});
});
