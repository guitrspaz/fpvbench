import {test,expect,beforeEach,afterEach} from '@jest/globals';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.mjs';
import {createMemoryRepository} from './helpers/memory-repository.mjs';
let dir,store,failSave,logs,aircraft;
beforeEach(async()=>{
 dir=await mkdtemp(join(tmpdir(),'fpvbench-bulk-mark-'));failSave=false;
 const repository=createMemoryRepository();
 store=await createStore(dir,{repositoryFactory:()=>({...repository,save(...args){if(failSave)throw new Error('Synthetic save failure');return repository.save(...args);}})});
 aircraft=await store.createAircraft({name:'Synthetic bulk aircraft'});
 await store.createSession({aircraftId:aircraft.id,title:'Keep observation',flownAt:'2026-10-15T12:00:00Z',notes:'Synthetic note'});
 await store.createJournalEntry(aircraft.id,{kind:'next-step',title:'Keep reminder'});
 logs=[];
 for(let i=0;i<3;i++)logs.push((await store.importLog({...(i===0?{aircraftId:aircraft.id}:{}),filename:`synthetic-${i}.ridlog`,contentBase64:Buffer.from('Synthetic original '+i).toString('base64')})).flightLog);
});
afterEach(async()=>{await store.close();await rm(dir,{recursive:true,force:true});});

test('bulk manual marks preserve all other evidence and receipts, deduplicate IDs and report repeated marks',async()=>{
 const time=new Date().toISOString();
 await store.recordAirdataTransfer(logs[0].id,{accountId:randomUUID(),attemptId:randomUUID(),jobId:'job_SYNTHETIC_BULK',status:'unknown',startedAt:time,updatedAt:time,message:'Synthetic uncertain receipt'});
 await store.updateFlightLog(logs[1].id,{airdataStatus:'uploaded'});
 const before=await store.exportWorkspace();
 expect(await store.markFlightLogsUploaded({ids:[logs[0].id,logs[1].id,logs[0].id]})).toEqual({selected:2,updated:1,alreadyUploaded:1});
 const expected=structuredClone(before);expected.flightLogs[0].airdataStatus='uploaded';
 expect(await store.exportWorkspace()).toEqual(expected);
 expect(await store.markFlightLogsUploaded({ids:[logs[0].id,logs[1].id]})).toEqual({selected:2,updated:0,alreadyUploaded:2});
 expect(await store.exportWorkspace()).toEqual(expected);
});

test('strict bounded input and missing IDs reject the entire batch without saving partial marks',async()=>{
 const before=await store.exportWorkspace();
 for(const input of [{ids:[]},{ids:'all'},{ids:[null]},{ids:['x'.repeat(201)]},{ids:Array(1001).fill(logs[0].id)},{ids:[logs[0].id,randomUUID()]},{ids:[logs[0].id],airdataStatus:'unknown'},{ids:[logs[0].id],filter:'all'}]) {
  await expect(store.markFlightLogsUploaded(input)).rejects.toBeInstanceOf(Error);
  expect(await store.exportWorkspace()).toEqual(before);
 }
});

test('a persistence failure retains every original manual mark and the queue remains usable',async()=>{
 const before=await store.exportWorkspace();failSave=true;
 await expect(store.markFlightLogsUploaded({ids:logs.map(log=>log.id)})).rejects.toThrow('Synthetic save failure');
 expect(await store.exportWorkspace()).toEqual(before);failSave=false;
 expect((await store.markFlightLogsUploaded({ids:logs.map(log=>log.id)})).updated).toBe(3);
});

test('queued assignment and bulk marks preserve one another',async()=>{
 await Promise.all([store.markFlightLogsUploaded({ids:[logs[1].id]}),store.updateFlightLog(logs[1].id,{aircraftId:aircraft.id})]);
 expect(store.getState().flightLogs.find(log=>log.id===logs[1].id)).toMatchObject({aircraftId:aircraft.id,airdataStatus:'uploaded'});
});
