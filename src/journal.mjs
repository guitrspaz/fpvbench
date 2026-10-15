import { getRecord } from './workspace-validation.mjs';
const latest=(records,field)=>[...records].sort((a,b)=>Date.parse(b[field])-Date.parse(a[field])||a.id.localeCompare(b.id))[0]??null;
/** Compute a local aircraft brief from recorded evidence; never infer live configuration or call a provider. */
export function buildNextSessionBrief(state,aircraftId) {
  const aircraft=getRecord(state,'aircraft',aircraftId), entries=aircraft.journalEntries??[];
  const open=entries.filter(e=>e.kind==='next-step'&&e.status==='open').sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.id.localeCompare(b.id));
  const sessions=state.sessions.filter(e=>e.aircraftId===aircraftId), snapshots=state.snapshots.filter(e=>e.aircraftId===aircraftId);
  const snapshot=latest(snapshots,'importedAt'),session=latest(sessions,'flownAt'),baseline=snapshots.find(e=>e.id===aircraft.baselineSnapshotId);
  return structuredClone({
    aircraftId,openNextStepCount:open.length,openNextSteps:open.slice(0,3),
    recentEntries:entries.filter(e=>e.kind!=='next-step').sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||a.id.localeCompare(b.id)).slice(0,3),
    latestSession:session?{id:session.id,title:session.title,flownAt:session.flownAt}:null,
    latestSnapshot:snapshot?{id:snapshot.id,label:snapshot.label,importedAt:snapshot.importedAt,confirmedInSession:sessions.some(e=>e.snapshotId===snapshot.id&&e.confirmedSetup)}:null,
    baseline:baseline?{id:baseline.id,label:baseline.label}:null,
  });
}
