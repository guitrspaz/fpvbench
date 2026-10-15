import { test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from '../src/store.mjs';
import { createMemoryRepository } from './helpers/memory-repository.mjs';
import { validateCompleteBackup } from '../src/restore.mjs';
import { decodedDjiFixture } from './helpers/dji-fixtures.mjs';
import { buildNextSessionBrief } from '../src/journal.mjs';

let dir, store, repository, a, b, snapshot, session;
const when = '2026-10-14T12:00:00.000Z';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fpvbench-journal-test-'));
  repository = createMemoryRepository();
  store = await createStore(dir, { repositoryFactory: () => repository });
  a = await store.createAircraft({ name: 'Journal quad' });
  b = await store.createAircraft({ name: 'Other quad' });
  snapshot = await store.importSnapshot({ aircraftId: a.id, label: 'Reference setup', filename: 'synthetic.txt', rawText: await readFile(new URL('../examples/baseline-dump.txt', import.meta.url), 'utf8') });
  session = await store.createSession({ aircraftId: a.id, title: 'Recorded flight', flownAt: when, snapshotId: snapshot.id, confirmedSetup: true });
});
afterEach(async () => { await store.close(); await rm(dir, { recursive: true, force: true }); });

test('records all journal kinds with optional same-aircraft references and no fabricated history', async () => {
  expect(store.getJournal(a.id)).toEqual([]);
  const change = await store.createJournalEntry(a.id, { kind: 'change', title: 'Changed props', occurredAt: when, snapshotId: snapshot.id, sessionId: session.id });
  const observation = await store.createJournalEntry(a.id, { kind: 'observation', title: 'Smoother on turns' });
  const task = await store.createJournalEntry(a.id, { kind: 'next-step', title: 'Compare rates' });
  expect(change).toMatchObject({ status: 'recorded', sessionTitle: session.title, closedAt: null });
  expect(observation.status).toBe('recorded'); expect(task.status).toBe('open');
  expect(store.getJournal(a.id)).toHaveLength(3); expect(store.getJournal(b.id)).toEqual([]);
  expect(store.getState().sessions).toHaveLength(1);
});

test('editing and closing, setting aside and reopening preserve the original entry identity', async () => {
  const entry = await store.createJournalEntry(a.id, { kind: 'next-step', title: 'Test rates', details: 'Keep this context' });
  for (const status of ['done','set-aside','open']) {
    const edited = await store.updateJournalEntry(a.id, entry.id, { status });
    expect(edited).toMatchObject({ id: entry.id, createdAt: entry.createdAt, details: entry.details, status });
    expect(edited.closedAt === null).toBe(status === 'open');
  }
  const changed = await store.updateJournalEntry(a.id, entry.id, { title: 'Rephrased', kind: 'observation' });
  expect(changed).toMatchObject({ status: 'recorded', closedAt: null, title: 'Rephrased' });
  expect(store.getJournal(a.id)).toHaveLength(1);
});

test('invalid input and cross-aircraft links leave the journal untouched', async () => {
  const before = await store.exportWorkspace();
  for (const input of [
    {kind:'wrong',title:'x'}, {kind:'change',title:' '}, {kind:'change',title:'x',occurredAt:'not a date'},
    {kind:'change',title:'x',details:'x'.repeat(10001)}, {kind:'change',title:'x',titleExtra:true},
    {kind:'change',title:'x',id:randomUUID()}, {kind:'change',title:'x',status:'done'},
    {kind:'next-step',title:'x',createdAt:when}, {kind:'next-step',title:'x',closedAt:when},
  ]) await expect(store.createJournalEntry(a.id, input)).rejects.toMatchObject({status:400});
  await expect(store.createJournalEntry(b.id, {kind:'change',title:'x',snapshotId:snapshot.id})).rejects.toMatchObject({status:400});
  await expect(store.createJournalEntry(b.id, {kind:'change',title:'x',sessionId:session.id})).rejects.toMatchObject({status:400});
  expect(await store.exportWorkspace()).toEqual(before);
});

test('unknown aircraft or entry and invalid status edits cannot alter another journal', async () => {
  const entry = await store.createJournalEntry(a.id, {kind:'change',title:'x'});
  await expect(store.createJournalEntry(randomUUID(), {kind:'change',title:'x'})).rejects.toMatchObject({status:404});
  await expect(store.updateJournalEntry(b.id, entry.id, {title:'wrong aircraft'})).rejects.toMatchObject({status:404});
  await expect(store.updateJournalEntry(a.id, entry.id, {status:'done'})).rejects.toMatchObject({status:400});
  expect(store.getJournal(a.id)[0]).toEqual(entry);
});

test('repository failures do not publish partly saved journal changes', async () => {
  const entry = await store.createJournalEntry(a.id, {kind:'next-step',title:'x'});
  jest.spyOn(repository, 'save').mockImplementationOnce(() => { throw new Error('Synthetic write failure'); });
  await expect(store.updateJournalEntry(a.id, entry.id, {status:'done'})).rejects.toThrow('Synthetic write failure');
  expect(store.getJournal(a.id)[0]).toEqual(entry);
});

test('journals persist on reopen and in complete backups while older aircraft stay valid', async () => {
  const before = await store.exportWorkspace(); expect(before.aircraft[0].journalEntries).toBeUndefined();
  validateCompleteBackup(before);
  const entry = await store.createJournalEntry(a.id, {kind:'next-step',title:'Bring spare props'});
  const backup = await store.exportWorkspace(); validateCompleteBackup(backup);
  await store.close(); store = await createStore(dir, { repositoryFactory: () => repository });
  expect(store.getJournal(a.id)).toEqual([entry]);
  await store.updateAircraft(a.id, {status:'retired'});
  expect(store.getBrief(a.id).openNextSteps[0].id).toBe(entry.id);
  await expect(store.updateAircraft(a.id, {journalEntries:[]})).rejects.toMatchObject({status:400});
});

test('backup validation rejects malformed entries, duplicate IDs and invalid relationships', async () => {
  await store.createJournalEntry(a.id, {kind:'change',title:'x'});
  const backup = await store.exportWorkspace();
  for (const mutate of [
    x => {x.aircraft[0].journalEntries[0].closedAt = when;},
    x => {x.aircraft[0].journalEntries[0].extra = true;},
    x => {x.aircraft[0].journalEntries.push(structuredClone(x.aircraft[0].journalEntries[0]));},
    x => {x.aircraft[0].journalEntries[0].id = x.aircraft[1].id;},
    x => {x.aircraft[1].journalEntries = structuredClone(x.aircraft[0].journalEntries); x.aircraft[0].journalEntries=[]; x.aircraft[1].journalEntries[0].sessionId=session.id; x.aircraft[1].journalEntries[0].sessionTitle=session.title;},
  ]) { const bad = structuredClone(backup); mutate(bad); expect(() => validateCompleteBackup(bad)).toThrow(); }
});

test('moving a linked session detaches its old journal link and retains its captured title', async () => {
  const entry = await store.createJournalEntry(a.id, {kind:'observation',title:'Smooth',sessionId:session.id});
  await store.updateSession(session.id, {aircraftId:b.id,snapshotId:null,confirmedSetup:false});
  expect(store.getJournal(a.id)[0]).toMatchObject({id:entry.id,sessionId:null,sessionTitle:session.title});
  expect(store.getJournal(b.id)).toEqual([]); validateCompleteBackup(await store.exportWorkspace());
});

test('entry limit rejects overflow without deleting earlier history', async () => {
  const entry = await store.createJournalEntry(a.id, {kind:'change',title:'Synthetic'});
  const catalog = repository.load();
  catalog.aircraft[0].journalEntries = Array.from({length:500},()=>({...entry,id:randomUUID()}));
  repository.save(catalog); await store.close(); store = await createStore(dir, {repositoryFactory:()=>repository});
  await expect(store.createJournalEntry(a.id, {kind:'change',title:'Overflow'})).rejects.toMatchObject({status:400});
  expect(store.getJournal(a.id)).toHaveLength(500);
});

test('brief is aircraft scoped, bounded, stable, and leaves source evidence unchanged', async () => {
  await store.createJournalEntry(b.id, {kind:'next-step',title:'Other private task'});
  for(let i=0;i<5;i++) await store.createJournalEntry(a.id,{kind:'next-step',title:'Try '+i,occurredAt:when});
  for(let i=0;i<4;i++) await store.createJournalEntry(a.id,{kind:'observation',title:'Noticed '+i,occurredAt:'2026-10-'+String(10+i).padStart(2,'0')+'T12:00:00.000Z'});
  const state = store.getState(), before=structuredClone(state);
  const brief=buildNextSessionBrief(state,a.id);
  expect(brief.openNextStepCount).toBe(5); expect(brief.openNextSteps).toHaveLength(3);
  expect(brief.openNextSteps.map(x=>x.id)).toEqual(store.getJournal(a.id).filter(x=>x.kind==='next-step').map(x=>x.id).sort().slice(0,3));
  expect(brief.recentEntries.map(x=>x.title)).toEqual(['Noticed 3','Noticed 2','Noticed 1']);
  expect(brief.latestSession.id).toBe(session.id); expect(brief.latestSnapshot).toMatchObject({id:snapshot.id,confirmedInSession:true});
  expect(JSON.stringify(brief)).not.toContain('Other private task'); expect(state).toEqual(before);
});

test('empty brief and setup confirmation reflect recorded evidence only', async () => {
  expect(store.getBrief(b.id)).toMatchObject({openNextStepCount:0,openNextSteps:[],recentEntries:[],latestSession:null,latestSnapshot:null,baseline:null});
  await store.updateSession(session.id,{confirmedSetup:false});
  expect(store.getBrief(a.id).latestSnapshot.confirmedInSession).toBe(false);
  await store.updateAircraft(a.id,{baselineSnapshotId:snapshot.id});
  expect(store.getBrief(a.id).baseline.id).toBe(snapshot.id);
});

test('reassigning an imported flight preserves journal context without cross-aircraft session links',async()=>{
  const original=Buffer.from(JSON.stringify(decodedDjiFixture()));
  const imported=await store.importFlightLog({aircraftId:a.id,filename:'synthetic.json',contentBase64:original.toString('base64')});
  const entry=await store.createJournalEntry(a.id,{kind:'observation',title:'Flight observation',sessionId:imported.session.id});
  await store.updateFlightLog(imported.flightLog.id,{aircraftId:b.id});
  expect(store.getJournal(a.id)[0]).toMatchObject({id:entry.id,sessionId:null,sessionTitle:imported.session.title});
  expect(store.getState().sessions.find(s=>s.id===imported.session.id).aircraftId).toBe(b.id);
  validateCompleteBackup(await store.exportWorkspace());
});
