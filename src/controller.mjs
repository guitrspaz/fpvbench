import { AppError, assertSafeObject, containsControlText } from './errors.mjs';

/** Physical labels only; suggested AUX wiring is never a verified observation. */
export const CONTROLLER_MODEL = 'dji-fpv-rc3';
export const CONTROLS = Object.freeze([
  { id:'flight-mode', label:'Flight mode switch · N/S/M', location:'Left shoulder', suggestedAux:1 },
  { id:'c2', label:'C2 switch', location:'Right shoulder', suggestedAux:2 },
  { id:'pause-rth', label:'Pause / RTH', location:'Left shoulder', suggestedAux:3 },
  { id:'start-stop', label:'Start / Stop', location:'Right shoulder', suggestedAux:4 },
  { id:'c1', label:'C1 button', location:'Front left', suggestedAux:5 },
  { id:'gimbal', label:'Gimbal dial', location:'Left shoulder' },
  { id:'shutter', label:'Shutter / Record', location:'Right shoulder' },
  { id:'power', label:'Power button', location:'Front center' },
]);
// Permanent IDs, rather than runtime enum indices. Other IDs remain literal evidence.
const MODES = { 0:'Arm/disarm request', 1:'Angle mode', 2:'Horizon mode', 13:'Beeper', 26:'Blackbox recording', 27:'Failsafe request', 28:'Airmode', 31:'Erase Blackbox', 35:'Turtle mode', 36:'Prearm', 39:'VTX pit mode', 40:'User 1 (custom action)', 41:'User 2 (custom action)', 42:'User 3 (custom action)', 43:'User 4 (custom action)', 47:'Acro trainer', 48:'VTX control disable', 46:'GPS Rescue request' };
const blank = () => ({ kind:'unknown', aux:null, positions:[], note:'', verified:false, verifiedAt:null });
const fail = message => { throw new AppError(message); };
function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('A controller object is required.');
  assertSafeObject(value);
  if (Object.keys(value).some(key => !allowed.includes(key))) fail('Unsupported controller field.');
}
const text = (value,max) => typeof value === 'string' && value.length <= max && !containsControlText(value);
const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;

/** Validate the bounded observation payload on both mutation and restore. */
export function validateController(controller) {
  fields(controller,['model','revision','updatedAt','controls']);
  if (controller.model !== CONTROLLER_MODEL || !Number.isSafeInteger(controller.revision) || controller.revision < 1 || !date(controller.updatedAt)) fail('Invalid controller model, revision, or timestamp.');
  validateMappings(controller.controls);
}
function validateMappings(controls) {
  fields(controls,CONTROLS.map(c => c.id));
  for (const mapping of Object.values(controls)) {
    fields(mapping,['kind','aux','positions','note','verified','verifiedAt']);
    if (!['aux','external','unknown'].includes(mapping.kind) || !text(mapping.note,1000) || typeof mapping.verified !== 'boolean') fail('Invalid control assignment or verification.');
    if (mapping.kind === 'aux' ? !Number.isInteger(mapping.aux) || mapping.aux < 1 || mapping.aux > 14 : mapping.aux !== null) fail('Choose AUX1–14 or no AUX channel.');
    if (!Array.isArray(mapping.positions) || mapping.positions.length > 5 || (mapping.kind !== 'aux' && mapping.positions.length)) fail('Use at most five measured AUX positions.');
    const labels = new Set();
    for (const position of mapping.positions) {
      fields(position,['label','value']);
      if (!text(position.label,60) || !position.label.trim() || labels.has(position.label) || !Number.isInteger(position.value) || position.value < 900 || position.value > 2100) fail('Each position needs a unique label and an integer value from 900 to 2100.');
      labels.add(position.label);
    }
    if (mapping.kind === 'unknown' && mapping.verified) fail('An unknown mapping cannot be verified.');
    if (mapping.verified ? !date(mapping.verifiedAt) : mapping.verifiedAt !== null) fail('Invalid verification timestamp.');
  }
}

/** Prepare replacement observations; caller persists them atomically with the snapshot. */
export function updateController(previous, input, now) {
  fields(input,['model','revision','controls']);
  if (input.model !== CONTROLLER_MODEL || input.revision !== (previous?.revision ?? 0)) throw new AppError('This controller mapping changed. Reload before saving.',409);
  fields(input.controls,CONTROLS.map(c => c.id));
  const controls = {};
  for (const [id,mapping] of Object.entries(input.controls)) {
    fields(mapping,['kind','aux','positions','note','verified']);
    // Validate before deriving identities so malformed requests are ordinary 400 errors.
    validateMappings({ [id]:{ ...mapping,verifiedAt:mapping.verified?now:null } });
    const old = previous?.controls[id];
    const unchanged = old && JSON.stringify(mappingIdentity(old)) === JSON.stringify(mappingIdentity(mapping)) && old.note === mapping.note;
    controls[id] = { ...mapping, verifiedAt: mapping.verified ? (unchanged && old.verified ? old.verifiedAt : now) : null };
  }
  const result = { model:CONTROLLER_MODEL,revision:(previous?.revision ?? 0)+1,updatedAt:now,controls };
  validateController(result);
  return result;
}

/** Opt-in starting template; no actual wiring or position directions are asserted. */
export function suggestedController() {
  return { model:CONTROLLER_MODEL,controls:Object.fromEntries(CONTROLS.map(c => [c.id,{ ...blank(),kind:c.suggestedAux?'aux':'unknown',aux:c.suggestedAux ?? null }])) };
}


/** Check only the AUX/adjustment domain against preserved source, without reparsing the catalog. */
function auditModeSource(snapshot) {
  if(typeof snapshot.rawText!=='string')return false;
  const commands=snapshot.parsed.commands,slots=[];
  let accounted=true;
  snapshot.rawText.replace(/^\uFEFF/,'').split(/\r?\n/).forEach((original,index)=>{
    let line=original.trim();
    if(/^#\s*(?:aux|adjrange)\s*$/.test(line))return; // ordinary section headings
    if(/^#\s+(?:aux|adjrange)\b/.test(line))line=line.replace(/^#\s+/,'');
    if(line.startsWith('#'))return;
    const match=line.match(/^(aux|adjrange)\b(?:\s+(.*))?$/);
    if(!match)return;
    const [,name,value='']=match;
    const compact=text=>text.trim().split(/\s+/).join(' ');
    if(!commands.some(c=>c.name===name&&c.line===index+1&&compact(c.value)===compact(value)))accounted=false;
    if(name==='aux')slots.push(value.split(/\s+/)[0]);
  });
  return accounted&&commands.filter(c=>c.name==='aux').length===20&&slots.length===20&&new Set(slots).size===20&&Array.from({length:20},(_,i)=>String(i)).every(slot=>slots.includes(slot));
}
/** Normalize explicit mode evidence without reconstructing omitted firmware defaults. */
export function normalizeModes(snapshot) {
  const { parsed } = snapshot;
  const reasons = [], notices = [];
  const supported = /^4\.5\.\d+$/.test(parsed.firmware.version ?? '');
  if (!supported) reasons.push('Mode interpretation currently supports Betaflight 4.5.x; this firmware needs review.');
  if (parsed.exportKind !== 'dump' || parsed.exportScope !== 'all') reasons.push('This export is sparse or partial; missing assignments remain unknown.');
  const warnings=parsed.warnings.filter(w=>/truncated|Duplicate|Unknown command/.test(w));
  if(warnings.length){
    if(warnings.some(w=>/truncated|Duplicate key command:(?:aux|adjrange):/.test(w))||!auditModeSource(snapshot))
      reasons.push('Mode coverage could not be established from the original AUX section; inspect the import warnings and mode rows.');
    else notices.push(warnings.length+' import warnings are outside the mode rules; all 20 AUX slots were checked against the original export.');
  }
  const rules = [];
  for (const command of parsed.commands.filter(c => c.name === 'aux')) {
    const tokens = command.value.split(/\s+/);
    if (tokens.length < 5 || tokens.length > 7 || tokens.some(t => !/^\d+$/.test(t))) { reasons.push('A mode row could not be interpreted.'); continue; }
    const [slot,mode,index,start,end,logic=0,linked=0] = tokens.map(Number);
    if (![slot,mode,index,start,end,logic,linked].every(Number.isSafeInteger) || slot > 19 || mode > 255 || index > 13 || start < 900 || end > 2100 || start > end || start % 25 || end % 25 || logic > 1 || linked > 255) { reasons.push('A mode row has unsupported values.'); continue; }
    if (start === end && linked === 0) continue;
    if (logic || linked) reasons.push('AND or linked mode conditions need review; individual ranges do not establish the combined action.');
    if (!MODES[mode] || !supported) reasons.push('An explicit mode ID has no supported interpretation.');
    rules.push({ mode,aux:index+1,start,end,logic,linked,label:supported ? MODES[mode] ?? `Mode ${mode} (name unavailable)` : `Mode ${mode} (firmware unreviewed)`,line:command.line,source:`aux ${command.value}` });
  }
  // Conservatively withhold completeness for adjustment rows, including unrecognized formats.
  if (parsed.commands.some(c => {
    if (c.name !== 'adjrange') return false;
    const t = c.value.split(/\s+/);
    return t.length < 7 || t.some(v => !/^\d+$/.test(v)) || (Number(t[3]) < Number(t[4]) && Number(t[5]) !== 0);
  })) reasons.push('In-flight adjustment rules need review; this view covers mode assignments only.');
  const unique = [...new Map(rules.map(r => [ruleKey(r),r])).values()].sort((a,b) => ruleKey(a).localeCompare(ruleKey(b)));
  return { complete:reasons.length === 0,reasons:[...new Set(reasons)],notices,rules:unique };
}
const ruleKey = r => JSON.stringify([r.mode,r.aux,r.start,r.end,r.logic,r.linked]);
function channelRules(evidence,aux) { return evidence.rules.filter(r => r.aux === aux); }
function channelSignature(evidence,aux) {
  // Include all conditions of every mode touching this channel.
  const modes = new Set(channelRules(evidence,aux).map(r => r.mode));
  return JSON.stringify(evidence.rules.filter(r => modes.has(r.mode)).map(ruleKey).sort());
}
const labels = rules => [...new Set(rules.map(r => r.label))];
function mappingIdentity(mapping) {
  return { kind:mapping.kind,aux:mapping.aux,positions:[...mapping.positions].sort((a,b) => a.label.localeCompare(b.label)) };
}

/** Present physical controls with independent assignment and verification states. */
export function controllerView(snapshot) {
  const evidence = normalizeModes(snapshot);
  const controls = CONTROLS.map(control => {
    const recorded = snapshot.controller?.controls[control.id];
    const mapping = recorded ?? blank();
    const mappingSource = recorded ? 'recorded' : control.suggestedAux ? 'suggested' : control.id==='power' ? 'documented' : 'unknown';
    const displayMapping = recorded ?? (control.suggestedAux ? { ...blank(),kind:'aux',aux:control.suggestedAux } : control.id==='power' ? { ...blank(),kind:'external',note:'Controller power' } : mapping);
    const rules = displayMapping.kind === 'aux' ? channelRules(evidence,displayMapping.aux) : [];
    const assignment = displayMapping.kind === 'external' ? 'external' : displayMapping.kind === 'unknown' ? 'unknown' : rules.length ? 'assigned' : evidence.complete ? 'unassigned' : 'unknown';
    return { ...control,mapping,displayMapping,mappingSource,assignment,verified:mapping.verified,behaviors:labels(rules),rules,
      positions:mapping.positions.map(p => ({ ...p,behaviors:evidence.complete ? labels(rules.filter(r => Math.max(900,Math.min(2099,p.value)) >= r.start && Math.max(900,Math.min(2099,p.value)) < r.end)) : null })) };
  });
  return { model:CONTROLLER_MODEL,revision:snapshot.controller?.revision ?? 0,updatedAt:snapshot.controller?.updatedAt ?? null,complete:evidence.complete,reasons:evidence.reasons,notices:evidence.notices,controls,
    channels:Array.from({length:14},(_,i) => ({ aux:i+1,behaviors:labels(channelRules(evidence,i+1)),rules:channelRules(evidence,i+1) })) };
}

/** Compare configured modes; observation edits never inflate aircraft change counts. */
export function compareControllers(from,to) {
  if (from.aircraftId !== to.aircraftId) throw new AppError('Choose two snapshots from the same aircraft.',409);
  const a = normalizeModes(from), b = normalizeModes(to);
  const comparable = a.complete && b.complete && ['version','board','boardName','manufacturer'].every(k => from.parsed.firmware[k] === to.parsed.firmware[k]);
  const channels = Array.from({length:14},(_,i) => {
    const aux = i+1;
    return { aux,before:labels(channelRules(a,aux)),after:labels(channelRules(b,aux)),beforeRules:channelRules(a,aux),afterRules:channelRules(b,aux),change:!comparable?'unknown':channelSignature(a,aux)===channelSignature(b,aux)?'unchanged':'changed' };
  });
  const before = controllerView(from), after = controllerView(to);
  const mappingChanges = after.controls.flatMap((control,i) => {
    const old = before.controls[i];
    if (JSON.stringify(mappingIdentity(old.mapping)) === JSON.stringify(mappingIdentity(control.mapping))) return [];
    return [{ id:control.id,label:control.label,before:old.mapping,after:control.mapping,change:old.mapping.kind === 'unknown' || control.mapping.kind === 'unknown'?'unknown':'changed' }];
  });
  return { before,after,channels,mappingChanges,counts:{ changed:channels.filter(c => c.change==='changed').length,unknown:channels.filter(c => c.change==='unknown').length,unchanged:channels.filter(c => c.change==='unchanged').length },
    reasons:[...new Set([...a.reasons,...b.reasons,...(!comparable&&a.complete&&b.complete?['Firmware or board metadata differs; behavior compatibility is unknown.']:[])])] };
}
