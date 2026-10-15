/** Explicit disposable SQLite proof; no personal data or provider requests. */
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.mjs';
import {restoreBackup,validateCompleteBackup} from '../src/restore.mjs';
const root=await mkdtemp(join(tmpdir(),'fpvbench-bulk-sqlite-')),data=join(root,'workspace'),restore=join(root,'restored');
let store,restored;
try {
  store=await createStore(data);
  const aircraft=await store.createAircraft({name:'Synthetic bulk mark proof'});
  const setup=await store.importSnapshot({aircraftId:aircraft.id,label:'Reference',filename:'synthetic.txt',rawText:await readFile(new URL('../examples/baseline-dump.txt',import.meta.url),'utf8')});
  await store.createSession({aircraftId:aircraft.id,title:'Keep observations',flownAt:'2026-10-15T12:00:00Z',snapshotId:setup.id,confirmedSetup:true,notes:'Synthetic notes'});
  await store.createJournalEntry(aircraft.id,{kind:'observation',title:'Keep aircraft inspection'});
  const ids=[];
  for(let i=0;i<3;i++)ids.push((await store.importLog({...(i===0?{aircraftId:aircraft.id}:{}),filename:`synthetic-${i}.ridlog`,contentBase64:Buffer.from('Synthetic bulk original '+i).toString('base64')})).flightLog.id);
  await store.updateFlightLog(ids[1],{airdataStatus:'uploaded'});
  const time=new Date().toISOString();
  await store.recordAirdataTransfer(ids[0],{accountId:randomUUID(),attemptId:randomUUID(),jobId:'job_SYNTHETIC_BULK',status:'unknown',startedAt:time,updatedAt:time,message:'Synthetic receipt'});
  const before=await store.exportWorkspace();
  assert.deepEqual(await store.markFlightLogsUploaded({ids:[...ids,ids[0]]}),{selected:3,updated:2,alreadyUploaded:1});
  const expected=structuredClone(before);for(const log of expected.flightLogs)log.airdataStatus='uploaded';
  const backup=await store.exportWorkspace();assert.deepEqual(backup,expected);validateCompleteBackup(backup);
  await store.close();store=await createStore(data);assert.deepEqual(await store.exportWorkspace(),backup);
  assert.deepEqual(await store.markFlightLogsUploaded({ids}),{selected:3,updated:0,alreadyUploaded:3});
  await restoreBackup(restore,backup);restored=await createStore(restore);assert.deepEqual(await restored.exportWorkspace(),backup);
  console.log('Bulk manual AirData SQLite proof passed: atomic marks, retained evidence and receipt, idempotence, restart and complete restore.');
} finally {await store?.close();await restored?.close();await rm(root,{recursive:true,force:true});}
