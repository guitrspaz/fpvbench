import { friendlyControl, beginnerChanges, layoutConfidence, comparisonGuidance } from './controller-language.js';
import { controllerReferences } from './controller-check.js';
import { guidedControlCheck } from './controller-guide.js';
import { downloadControlCard } from './controller-card.js';
/** Controller 3 UI; imported text and operator notes are always text nodes. */
function el(tag,attrs={},...children) {
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)) {
    if(key==='text')node.textContent=value;
    else if(key==='class')node.className=value;
    else if(value!==null&&value!==undefined)node.setAttribute(key,String(value));
  }
  node.append(...children.filter(c=>c!==null&&c!==undefined));return node;
}
const label=(text,node)=>el('label',{},text,node);
const badge=(text,tone='')=>el('span',{class:'badge '+tone,text});
const action=(text,fn)=>{const b=el('button',{type:'button',class:'secondary',text});b.addEventListener('click',fn);return b;};
async function api(path,data) {
  const response=await fetch(path,data?{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Controller request failed.');return result;
}
const assignments={assigned:'Assigned',unassigned:'No aircraft mode assigned',external:'Controller / camera function',unknown:'Assignment unknown'};
const wiring=m=>m.kind==='aux'?`AUX${m.aux}`:m.kind==='external'?'Controller / camera function':'Mapping unknown';
const displayed=c=>c.displayMapping??c.mapping;
const wiringControl=c=>(c.mappingSource==='suggested'?'Expected ':'')+wiring(displayed(c));
const behavior=(names,complete)=>names.length?names.join(' + '):complete?'No aircraft mode assigned':'Not established by this export';
const controlBehavior=(c,complete)=>displayed(c).kind==='unknown'?'Function not recorded in this setup':displayed(c).kind==='external'?(c.mappingSource==='documented'?'Controller power':'Controller / camera function'):behavior(c.behaviors,complete);
const assignmentLabel=c=>c.mappingSource==='suggested'?(c.assignment==='assigned'?'Mode on expected AUX':c.assignment==='unassigned'?'No mode on expected AUX':'AUX evidence incomplete'):c.mappingSource==='documented'?'Controller function':assignments[c.assignment];
const mappings=view=>Object.fromEntries(view.controls.filter(c=>c.mappingSource==='recorded').map(c=>{const {verifiedAt:_time,...mapping}=c.mapping;return[c.id,mapping];}));
const unverified=controls=>Object.fromEntries(Object.entries(controls).map(([id,m])=>[id,{...m,verified:false}]));
function ruleText(r){return `${r.label} · AUX${r.aux} · ${r.start} ≤ value < ${r.end}${r.logic?' · AND condition':''}${r.linked?' · linked mode '+r.linked:''}`;}

/** Setup selection keeps observations independently versioned and comparisons directional. */
export function mountControllerWorkbench(host,{history,currentId=null,sessions=[],baselineId=null,aircraftName='',isCurrent=()=>true,onError=()=>{}}) {
  host.replaceChildren();
  if(!history.length){host.append(el('p',{text:'Import a Betaflight setup to map your Controller 3.'}));return;}
  const selected=el('select',{'aria-label':'Controller setup'});
  for(const s of history)selected.append(el('option',{value:s.id,text:s.label}));
  selected.value=currentId||history[0].id;
  const reference=el('select',{'aria-label':'Controller reference'}),results=el('div');
  let generation=0,selectedControl=null;
  const shortcuts=el('div',{class:'controller-reference-shortcuts'}),referenceNote=el('p',{class:'form-help','aria-live':'polite'});
  const updateShortcuts=()=>{
    shortcuts.replaceChildren();
    for(const r of controllerReferences(history,selected.value,sessions,baselineId)){
      const b=action(r.label,()=>{if(!r.available){referenceNote.textContent=r.reason;return;}reference.value=r.id;referenceNote.textContent=r.session?'Flight reference: '+r.session.title+' · '+new Date(r.session.flownAt).toLocaleString():r.label+': '+history.find(s=>s.id===r.id).label;load();});
      b.setAttribute('aria-disabled',String(!r.available));b.title=r.available?history.find(s=>s.id===r.id).label:r.reason;shortcuts.append(b);
    }
  };
  const resetReference=()=>{
    reference.replaceChildren(el('option',{value:'',text:'No comparison'}),...history.filter(s=>s.id!==selected.value).map(s=>el('option',{value:s.id,text:s.label})));
    const index=history.findIndex(s=>s.id===selected.value);reference.value=history[index+1]?.id||'';
    referenceNote.textContent=reference.value?'Reference: previous import. Import order does not establish when a setup was flown.':'No earlier import to compare.';updateShortcuts();
  };
  const load=async()=>{
    const request=++generation,id=selected.value,ref=reference.value;
    results.replaceChildren(el('p',{class:'loading',text:'Reading controller assignments…'}));
    try {
      const response=ref?await api(`/api/compare?from=${encodeURIComponent(ref)}&to=${encodeURIComponent(id)}`):null;
      const view=response?.controller.after??await api(`/api/snapshots/${encodeURIComponent(id)}/controller`);
      if(request!==generation||!isCurrent())return;
      renderController(results,{view,cardContext:{aircraftName,setupLabel:history.find(s=>s.id===id)?.label,importedAt:history.find(s=>s.id===id)?.importedAt},selectedControl,onSelect:id=>selectedControl=id,comparison:response?.controller,referenceLabel:history.find(s=>s.id===ref)?.label,
        onSave:async controls=>{
          await api(`/api/snapshots/${encodeURIComponent(id)}/controller`,{model:view.model,revision:view.revision,controls});
          if(request===generation&&isCurrent()){
            await load();
            if(selectedControl)results.querySelector('[data-control="'+selectedControl+'"]')?.focus();
          }
        },
        onCopy:ref?async()=>unverified(mappings(await api(`/api/snapshots/${encodeURIComponent(ref)}/controller`))):null});
    }catch(error){if(request===generation&&isCurrent()){results.replaceChildren(el('p',{class:'error',role:'alert',text:error.message}));onError(error);}}
  };
  const pickers=el('div',{class:'controller-selectors'});
  if(!currentId)pickers.append(label('Saved setup',selected));
  pickers.append(label('Compare with',reference));
  host.append(pickers,shortcuts,referenceNote,el('p',{class:'form-help',text:'Compare saved backups here. This page does not show a live connection to the quad.'}),results);
  selected.addEventListener('change',()=>{resetReference();load();});reference.addEventListener('change',()=>{referenceNote.textContent=reference.value?'Reference: '+history.find(s=>s.id===reference.value)?.label:'No comparison selected.';load();});resetReference();load();
}


/** Beginner-first controller view; complete evidence and editing stay in collapsed advanced sections. */
export function renderController(host,{view,comparison=null,referenceLabel='',onSave=null,onCopy=null,cardContext=null,selectedControl=null,onSelect=()=>{}}) {
  host.replaceChildren();
  const panel=el('section',{class:'controller-panel controller-simple','aria-label':'Controller 3 map'});
  const confidence=layoutConfidence(view),changes=comparison?beginnerChanges(comparison):null;
  const changed=new Set(changes?.changes.map(c=>c.id)??[]);
  panel.append(el('h2',{text:'Your Controller 3'}),el('p',{class:'selection-note',text:'Choose a button or switch to see what it does in this saved setup.'}),
    el('div',{class:'controller-confidence'},el('strong',{text:confidence.title}),el('p',{text:confidence.message})));
  if(!view.complete)panel.append(el('div',{class:'controller-basic-limit'},el('p',{text:'Some actions cannot be fully read from this backup. The descriptions below show only what is known.'}),...comparisonGuidance({reasons:view.reasons}).map(text=>el('p',{class:'form-help',text}))));
  if(cardContext)panel.append(action('Download control card',()=>downloadControlCard(view,cardContext)),el('p',{class:'form-help',text:'Save an offline HTML card for your phone or browser’s Print command. It includes setup names and checked status.'}));
  const changeSection=changes?simpleChanges(changes,referenceLabel,comparison):null;
  if(changeSection){const jump=action('See what changed',()=>changeSection.scrollIntoView({block:'start'}));jump.classList.add('controller-change-jump');panel.append(jump);}
  const feedback=el('p',{'aria-live':'polite',class:'form-help'});
  const grid=el('div',{class:'controller-workspace'});
  const schematic=el('div',{class:'controller-schematic','aria-label':'Controller diagram, viewed by the operator'});
  const shoulders=el('div',{class:'controller-shoulders'}),front=el('div',{class:'controller-front'});
  front.append(el('div',{class:'controller-stick left-stick','aria-hidden':'true',text:'⊕'}),el('div',{class:'controller-stick right-stick','aria-hidden':'true',text:'⊕'}));
  schematic.append(el('p',{class:'eyebrow',text:'TOP BUTTONS AND SWITCHES'}),shoulders,el('p',{class:'eyebrow',text:'FRONT BUTTONS'}),front);
  const detail=el('section',{class:'controller-control-detail','aria-label':'Selected physical control'}),buttons=new Map();
  for(const c of view.controls){
    const plain=friendlyControl(c,view.complete);
    const change=changes?.changes.find(item=>item.id===c.id);
    const state=c.verified?'Checked on controller'+(change?' · '+(change.expected?'expected change':'changed'):''):change?(change.expected?'Expected change':'Changed'):null;
    const b=el('button',{type:'button',class:'controller-hotspot control-'+c.id,'data-control':c.id,'aria-pressed':'false'},
      el('strong',{text:c.label}),el('span',{class:'control-behavior',text:plain.title}),state?badge(state,changed.has(c.id)?'amber':''):null);
    b.addEventListener('click',()=>select(c));buttons.set(c.id,b);
    (['c1','power'].includes(c.id)?front:shoulders).append(b);
  }
  const ordered=el('div',{class:'controller-equivalent-list'});
  for(const c of view.controls)ordered.append(action(c.label,()=>{select(c);buttons.get(c.id).focus();}));
  schematic.append(el('details',{},el('summary',{text:'Choose a control from a list'}),ordered));
  function select(c){
    onSelect(c.id);
    for(const [id,b]of buttons)b.setAttribute('aria-pressed',String(id===c.id));
    const plain=friendlyControl(c,view.complete);
    detail.replaceChildren(el('h3',{text:c.label}),el('p',{class:'muted',text:c.location}),el('h4',{text:'What this does'}));
    if(plain.actions.length>1){
      detail.append(el('p',{text:plain.description}));
      for(const a of plain.actions)detail.append(el('div',{class:'controller-action-explanation'},el('strong',{text:a.title}),el('p',{text:a.description})));
    }else detail.append(el('strong',{class:'controller-action-title',text:plain.title}),el('p',{text:plain.description}));
    if(plain.notice)detail.append(el('p',{class:'controller-shared-action',role:'note',text:plain.notice}));
    if(c.mappingSource!=='documented')detail.append(el('p',{class:'controller-check-state',text:c.verified?'Checked on the controller for this setup.':c.mappingSource==='suggested'?'This is the expected button assignment. It still needs checking on the controller.':'This button assignment has not been checked on the controller.'}));
    if(onSave&&c.id!=='power')detail.append(guidedControlCheck(c,async mapping=>{const controls=mappings(view);controls[c.id]=mapping;return save(controls);}));
    if(c.positions.length){
      detail.append(el('h4',{text:'Recorded switch positions'}));
      for(const p of c.positions){
        const fake={...c,rules:p.behaviors===null?[]:c.rules.filter(r=>Math.max(900,Math.min(2099,p.value))>=r.start&&Math.max(900,Math.min(2099,p.value))<r.end)};
        const names=p.behaviors===null?'Needs more information':fake.rules.length?friendlyControl(fake,true).title:'No aircraft action at this position';
        detail.append(el('p',{class:'controller-plain-position',text:p.label+' — '+names}));
      }
    }
    const advanced=el('details',{class:'controller-button-advanced'},el('summary',{text:'Advanced details for this button'}));
    advanced.append(el('p',{text:wiringControl(c)}),badge(assignmentLabel(c)),badge(c.verified?'Physically verified':'Not physically verified'));
    if(c.mapping.verifiedAt)advanced.append(el('p',{class:'form-help',text:'Operator verified '+new Date(c.mapping.verifiedAt).toLocaleString()}));
    if(c.mappingSource==='suggested')advanced.append(el('p',{class:'form-help',text:'The AUX channel is suggested, not measured. Saving adopts it for this control only.'}));
    if(c.positions.length)advanced.append(el('h4',{text:'Measured positions'}),...c.positions.map(p=>el('p',{text:`${p.label} (${p.value}): ${p.behaviors===null?'Outcome needs review':p.behaviors.length?p.behaviors.join(' + '):'No configured mode active at this value'}`})));
    if(c.rules.length)advanced.append(el('details',{},el('summary',{text:'Mode evidence'}),...c.rules.map(r=>el('p',{},el('span',{text:ruleText(r)}),el('code',{class:'controller-source',text:`Line ${r.line}: ${r.source}`})))));
    if(comparison){
      const old=comparison.before.controls.find(old=>old.id===c.id);
      advanced.append(el('h4',{text:'Reference → selected setup'}),el('p',{text:`${wiringControl(old)}: ${controlBehavior(old,comparison.before.complete)} → ${wiringControl(c)}: ${controlBehavior(c,view.complete)}`}));
    }
    if(onSave)advanced.append(editor(c,view,save));else if(c.mapping.note)advanced.append(el('p',{text:c.mapping.note}));
    detail.append(advanced);
  }
  grid.append(schematic,detail);panel.append(grid);if(changeSection)panel.append(changeSection);
  const mapped=new Set(view.controls.filter(c=>displayed(c).kind==='aux').map(c=>displayed(c).aux));
  const unlinked=view.channels.filter(c=>c.rules.length&&!mapped.has(c.aux));
  if(unlinked.length){
    const other=el('details',{class:'controller-other-actions'},el('summary',{text:unlinked.length+' other saved '+(unlinked.length===1?'action has':'actions have')+' no identified button'}));
    for(const ch of unlinked){
      const fake={id:'unlinked',mapping:{kind:'aux',aux:ch.aux},rules:ch.rules};
      other.append(el('p',{text:friendlyControl(fake,view.complete).title+' — button not identified'}));
    }
    panel.append(other);
  }
  const advanced=el('details',{class:'controller-setup-advanced'},el('summary',{text:'Advanced setup details'}));
  const totals=el('div',{class:'controller-totals'});
  for(const state of ['assigned','unassigned','external','unknown'])totals.append(badge(`${view.controls.filter(c=>c.assignment===state).length} ${assignments[state].toLowerCase()}`));
  totals.append(badge(`${view.controls.filter(c=>c.verified).length} physically verified`));
  advanced.append(totals);
  if(view.reasons.length)advanced.append(el('div',{class:'controller-unknowns'},el('strong',{text:'Interpretation limits'}),...view.reasons.map(reason=>el('p',{text:reason}))));
  if(view.notices?.length)advanced.append(el('details',{class:'controller-import-notes'},el('summary',{text:'Import notes · mode rows checked separately'}),...view.notices.map(note=>el('p',{text:note}))));
  if(onSave){
    const tools=el('div',{class:'toolbar'}),suggestions=view.controls.some(c=>c.mappingSource==='suggested');
    if(suggestions)tools.append(action('Use suggested AUX mapping (unverified)',async()=>{
      const controls=mappings(view);
      for(const c of view.controls)if(c.mappingSource==='suggested')controls[c.id]={kind:'aux',aux:c.suggestedAux,positions:[],note:'',verified:false};
      await save(controls);
    }));
    if(onCopy)tools.append(action('Copy reference mapping (reset verification)',async()=>{
      try{await save(await onCopy());}catch(error){feedback.textContent=error.message;}
    }));
    advanced.append(tools,el('p',{class:'form-help',text:'Mapping and verification are saved for this setup only. Copying resets verification. The suggested layout does not discover your wiring.'}));
  }
  if(comparison)advanced.append(comparisonBrief(comparison,referenceLabel));
  const channels=el('details',{class:'controller-channels'},el('summary',{text:'All AUX mode assignments and source evidence'}));
  for(const c of view.channels.filter(c=>c.rules.length))channels.append(el('p',{text:`AUX${c.aux}: ${c.behaviors.join(' + ')}`}),...c.rules.map(r=>el('code',{class:'controller-source',text:ruleText(r)+' · '+r.source})));
  advanced.append(channels);panel.append(advanced,feedback);host.append(panel);
  let saving=false;
  async function save(controls){
    if(saving)return;saving=true;panel.setAttribute('aria-busy','true');
    const disabled=[...panel.querySelectorAll('button,input,select,textarea')].map(n=>[n,n.disabled]);
    disabled.forEach(([n])=>n.disabled=true);feedback.textContent='Saving the button record…';
    try{await onSave(controls);return true;}
    catch(error){feedback.textContent=error.message;feedback.setAttribute('role','alert');return false;}
    finally{saving=false;panel.removeAttribute('aria-busy');disabled.forEach(([n,wasDisabled])=>n.disabled=wasDisabled);}
  }
  select(view.controls.find(c=>c.id===selectedControl)??view.controls.find(c=>c.rules.some(r=>r.mode===0))??view.controls[0]);
}

function simpleChanges(result,referenceLabel,comparison){
  const section=el('section',{class:'controller-simple-changes','aria-label':'Plain-language button changes'},el('h3',{text:'What changed'}));
  if(referenceLabel)section.append(el('p',{class:'form-help',text:'Compared with '+referenceLabel}));
  if(result.incomplete){
    section.append(el('p',{text:'There is not enough information for a full comparison.'}),el('p',{class:'form-help',text:result.reason??'The button descriptions remain available. Advanced setup details explain the comparison limits.'}),...comparisonGuidance(comparison).map(text=>el('p',{class:'form-help',text})));return section;
  }
  if(!result.changes.length){section.append(el('p',{text:'No changes found on the identified buttons.'}));return section;}
  section.append(el('p',{class:'controller-change-count',text:result.changes.length+(result.expected?' expected button change':' button change')+(result.changes.length===1?'':'s')}));
  const list=el('div',{class:'controller-plain-change-list'});
  for(const change of result.changes){
    const row=el('article',{class:'controller-plain-change'},el('strong',{text:change.label}));
    if(change.kind==='activation')row.append(el('p',{text:change.explanation}),el('p',{class:'form-help',text:change.after}));
    else row.append(el('p',{},el('span',{class:'muted',text:'Before: '}),change.before),el('p',{},el('span',{class:'muted',text:'Now: '}),change.after));
    list.append(row);
  }
  section.append(list);return section;
}

function comparisonBrief(comparison,referenceLabel) {
  const section=el('section',{class:'controller-comparison','aria-label':'Controller behavior comparison'});
  section.append(el('h3',{text:'Behavior changes'+(referenceLabel?' from '+referenceLabel:'')}),
    el('p',{class:comparison.counts.unknown&&!comparison.counts.changed?'incomplete-behavior-count':'confirmed-behavior-count',text:comparison.counts.unknown&&!comparison.counts.changed?'Behavior comparison incomplete':`${comparison.counts.changed} confirmed AUX behavior changes`}));
  const changes=el('details',{},el('summary',{text:'Review confirmed changes · '+comparison.counts.changed}));
  for(const c of comparison.channels.filter(c=>c.change==='changed')){
    const names=comparison.after.controls.filter(control=>displayed(control).kind==='aux'&&displayed(control).aux===c.aux).map(control=>control.label+(control.mappingSource==='suggested'?' (suggested mapping)':''));
    changes.append(el('p',{class:'controller-change',text:`AUX${c.aux}${names.length?' · '+names.join(', '):''}: ${behavior(c.before,true)} → ${behavior(c.after,true)}`}),
      el('details',{},el('summary',{text:'Before / after ranges · AUX'+c.aux}),
        el('p',{text:'Reference'}),...c.beforeRules.map(r=>el('code',{class:'controller-source',text:ruleText(r)})),
        el('p',{text:'Selected setup'}),...c.afterRules.map(r=>el('code',{class:'controller-source',text:ruleText(r)}))));
  }
  if(comparison.counts.changed)section.append(changes);
  if(comparison.counts.unknown){
    const relevant=comparison.channels.filter(ch=>ch.change==='unknown'&&(ch.beforeRules.length||ch.afterRules.length)).length;
    section.append(el('details',{class:'controller-unknowns',open:''},el('summary',{text:relevant?'Comparison gaps · '+relevant+' AUX channels with recorded rules':'Mode comparison unavailable for these exports'}),...comparison.reasons.map(reason=>el('p',{text:reason}))));
  }
  if(comparison.mappingChanges.length)section.append(el('details',{},el('summary',{text:'Physical mapping observations differ · '+comparison.mappingChanges.length}),el('p',{text:'These are recorded observations. A newly supplied mapping does not prove the controller configuration changed.'}),...comparison.mappingChanges.map(c=>el('p',{text:`${c.label}: ${wiring(c.before)} → ${wiring(c.after)} · ${c.change==='unknown'?'earlier or later mapping unknown':'mapping observation changed'}` }))));
  return section;
}

function editor(control,view,save) {
  const form=el('form',{class:'controller-editor'});
  const route=el('select',{'aria-label':'Physical control mapping'});
  route.append(el('option',{value:'unknown',text:'Mapping unknown'}),el('option',{value:'external',text:'Controller / camera function'}),...Array.from({length:14},(_,i)=>el('option',{value:String(i+1),text:'AUX'+(i+1)})));
  route.value=displayed(control).kind==='aux'?String(displayed(control).aux):displayed(control).kind;
  const positions=el('textarea',{'aria-label':'Measured positions',rows:3,maxlength:500,placeholder:'Position label = measured value'});
  positions.value=control.mapping.positions.map(p=>p.label+' = '+p.value).join('\n');
  const notes=el('textarea',{'aria-label':'Control observations',rows:3,maxlength:1000});notes.value=control.mapping.note;
  const verified=el('input',{type:'checkbox'});verified.checked=control.verified;
  const synchronize=()=>{
    const aux=/^\d+$/.test(route.value);
    positions.disabled=!aux;verified.disabled=route.value==='unknown';
    if(!aux)positions.value='';
    verified.checked=false;
  };
  positions.disabled=displayed(control).kind!=='aux';verified.disabled=displayed(control).kind==='unknown';
  route.addEventListener('change',synchronize);
  for(const input of [positions,notes])input.addEventListener('input',()=>verified.checked=false);
  form.append(label('Physical control mapping',route),control.mappingSource==='suggested'?el('p',{class:'form-help',text:'The selected AUX channel is a suggestion. Saving adopts it for this control only.'}):null,label('Measured positions',positions),
    el('p',{class:'form-help',text:'Optional: one position per line, e.g. Top = 1000. Use observed receiver values. Do not assume switch direction or whether a button latches.'}),
    label('Control observations',notes),label('I physically checked this mapping and its recorded positions for this setup.',verified),
    el('p',{class:'form-help',text:'Verification records your check of the mapping, not a flight-readiness certification.'}),
    el('button',{type:'submit',class:'primary',text:'Save control observations'}));
  const error=el('p',{role:'alert',class:'error'});form.append(error);
  form.addEventListener('submit',async event=>{
    event.preventDefault();error.textContent='';
    const recorded=[];
    for(const line of positions.value.split('\n').filter(line=>line.trim())){
      const match=line.match(/^\s*(.+?)\s*=\s*(\d+)\s*$/);
      if(!match){error.textContent='Use one position per line: label = measured value.';return;}
      recorded.push({label:match[1],value:Number(match[2])});
    }
    const controls=mappings(view),aux=/^\d+$/.test(route.value);
    controls[control.id]={kind:aux?'aux':route.value,aux:aux?Number(route.value):null,positions:aux?recorded:[],note:notes.value,verified:verified.checked};
    await save(controls);
  });
  return el('details',{class:'controller-edit'},el('summary',{text:'Edit mapping & verification'}),form);
}
