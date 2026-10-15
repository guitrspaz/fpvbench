/** Explicit disposable SQLite proof for the journal release; no personal records or external provider calls. */
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.mjs';
import {restoreBackup,validateCompleteBackup} from '../src/restore.mjs';
const dirs=await Promise.all(['current','restored','older'].map(name=>mkdtemp(join(tmpdir(),'fpvbench-journal-'+name+'-'))));
let store,restored,older;
try {
  store=await createStore(dirs[0]);
  const aircraft=await store.createAircraft({name:'Synthetic journal proof'});
  const snapshot=await store.importSnapshot({aircraftId:aircraft.id,label:'Reference',filename:'synthetic.txt',rawText:await readFile(new URL('../examples/baseline-dump.txt',import.meta.url),'utf8')});
  const session=await store.createSession({aircraftId:aircraft.id,title:'Keep observations',flownAt:'2026-10-14T12:00:00Z',snapshotId:snapshot.id,confirmedSetup:true,notes:'Preserved synthetic observation'});
  const bytes=Buffer.from('Synthetic archived original');
  const {flightLog}=await store.importLog({aircraftId:aircraft.id,filename:'synthetic.ridlog',contentBase64:bytes.toString('base64')});
  const time=new Date().toISOString();
  await store.recordAirdataTransfer(flightLog.id,{accountId:randomUUID(),attemptId:randomUUID(),jobId:'job_SYNTHETIC_JOURNAL',status:'success',startedAt:time,updatedAt:time,message:'Synthetic processing receipt'});
  const before=await store.exportWorkspace();validateCompleteBackup(before);
  await store.createJournalEntry(aircraft.id,{kind:'change',title:'Changed props',snapshotId:snapshot.id});
  const task=await store.createJournalEntry(aircraft.id,{kind:'next-step',title:'Try the reference',sessionId:session.id});
  await store.updateJournalEntry(aircraft.id,task.id,{status:'done'});
  const backup=await store.exportWorkspace();validateCompleteBackup(backup);
  assert.deepEqual(backup.sessions,before.sessions);assert.deepEqual(backup.snapshots,before.snapshots);
  assert.deepEqual(backup.flightLogs,before.flightLogs);assert.deepEqual(backup.originals,before.originals);assert.deepEqual(backup.telemetry,before.telemetry);
  const {journalEntries,...unchanged}=backup.aircraft[0];assert.deepEqual(unchanged,before.aircraft[0]);assert.equal(journalEntries.length,2);
  await store.close();store=await createStore(dirs[0]);assert.deepEqual(await store.exportWorkspace(),backup);
  assert.equal(store.getBrief(aircraft.id).openNextStepCount,0);
  await restoreBackup(dirs[1],backup);restored=await createStore(dirs[1]);assert.deepEqual(await restored.exportWorkspace(),backup);
  await restored.updateJournalEntry(aircraft.id,task.id,{status:'open'});assert.equal(restored.getBrief(aircraft.id).openNextStepCount,1);
  await restoreBackup(dirs[2],before);older=await createStore(dirs[2]);assert.deepEqual(await older.exportWorkspace(),before);assert.deepEqual(older.getJournal(aircraft.id),[]);
  console.log('Journal SQLite proof passed: unchanged source evidence and upload receipt, journal lifecycle, restart, complete restore and older-backup compatibility.');
} finally {await store?.close();await restored?.close();await older?.close();for(const dir of dirs)await rm(dir,{recursive:true,force:true});}
