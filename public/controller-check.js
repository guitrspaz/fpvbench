/** Parse only operator observations. No value, switch direction or verification is inferred. */
export function checkedObservation({route,rows=[],note='',acknowledged=false}) {
  const aux=/^([1-9]|1[0-4])$/.test(route);
  if(!aux&&route!=='external')throw new Error('Choose the channel you observed, or a controller / camera function. Leave this check unfinished if you cannot identify it.');
  const positions=aux?rows.filter(r=>r.label.trim()||String(r.value).trim()).map(r=>({label:r.label.trim(),value:Number(r.value)})):[];
  if(aux&&(positions.length<2||positions.length>5))throw new Error('Record two to five observed positions or button states before marking this control checked.');
  const labels=new Set(),values=new Set();
  for(const p of positions){
    if(!p.label||p.label.length>60||labels.has(p.label)||!Number.isInteger(p.value)||p.value<900||p.value>2100)throw new Error('Give each position a different name and a whole receiver value from 900 to 2100.');
    labels.add(p.label);values.add(p.value);
  }
  if(aux&&values.size<2)throw new Error('The observations all have the same value. Check which channel moves before recording this mapping.');
  if(typeof note!=='string'||note.length>1000)throw new Error('Keep the observation note under 1,000 characters.');
  if(!acknowledged)throw new Error('Confirm your own check before saving it as checked.');
  return {kind:aux?'aux':'external',aux:aux?Number(route):null,positions,note,verified:true};
}

/** Named references use explicit records belonging to this aircraft. */
export function controllerReferences(history,selectedId,sessions=[],baselineId=null) {
  const selected=history.find(s=>s.id===selectedId),index=history.findIndex(s=>s.id===selectedId);
  const confirmed=sessions.filter(s=>s.confirmedSetup===true&&s.aircraftId===selected?.aircraftId&&Date.parse(s.flownAt)<=Date.parse(selected?.importedAt)&&history.some(h=>h.id===s.snapshotId&&h.aircraftId===s.aircraftId))
    .sort((a,b)=>Date.parse(b.flownAt)-Date.parse(a.flownAt)||a.id.localeCompare(b.id));
  const last=confirmed[0];
  return [
    {key:'previous',label:'Previous import',id:history[index+1]?.id??null,reason:'There is no earlier import for this setup.'},
    {key:'flown',label:'Last confirmed flight before this import',id:last?.snapshotId??null,reason:'No earlier flight records which setup you confirmed using.',session:last??null},
    {key:'preferred',label:'Preferred setup',id:history.find(s=>s.id===baselineId)?.id??null,reason:'Choose a preferred setup in Setup history.'},
  ].map(r=>({...r,available:!!r.id&&r.id!==selectedId,reason:r.id===selectedId?'This reference is the selected setup; choose another backup to compare.':r.reason}));
}
