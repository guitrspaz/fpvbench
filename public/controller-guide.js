import { checkedObservation } from './controller-check.js';
function el(tag,attrs={},...children){
  const n=document.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='text')n.textContent=v;else if(k==='class')n.className=v;else n.setAttribute(k,v);}n.append(...children);return n;
}
const field=(text,input)=>el('label',{},text,input);
/** A disposable three-step form. Only an explicit final save records a physical check. */
export function guidedControlCheck(control,onSave){
  const section=el('section',{class:'controller-guided-check','aria-label':'Guided button check'});
  const start=el('button',{type:'button',class:'secondary',text:'Check this control'});
  const body=el('div');body.hidden=true;
  section.append(start,body);
  start.addEventListener('click',()=>{
    start.hidden=true;body.hidden=false;
    const form=el('form'),progress=el('h4',{tabindex:'-1'}),stage=el('div'),error=el('p',{role:'alert',class:'error'});
    const cancel=el('button',{type:'button',class:'text-button',text:'Leave unfinished'});
    cancel.addEventListener('click',()=>{body.replaceChildren();body.hidden=true;start.hidden=false;start.focus();});
    const route=el('select',{'aria-label':'Channel observed'});
    route.append(el('option',{value:'',text:'Choose what you observed'}),...Array.from({length:14},(_,i)=>el('option',{value:String(i+1),text:'AUX'+(i+1)})),el('option',{value:'external',text:'Controller / camera function outside Betaflight'}));
    if(control.mappingSource==='recorded'&&control.mapping.kind!=='unknown')route.value=control.mapping.kind==='aux'?String(control.mapping.aux):'external';
    const rows=Array.from({length:5},(_,i)=>{
      const p=control.mapping.positions[i];
      return {label:el('input',{'aria-label':'Position '+(i+1)+' name',maxlength:'60',value:p?.label??''}),value:el('input',{'aria-label':'Position '+(i+1)+' value',type:'number',min:'900',max:'2100',step:'1',value:p?.value??''})};
    });
    route.addEventListener('change',()=>{for(const r of rows){r.label.value='';r.value.value='';}ack.checked=false;});
    const note=el('textarea',{'aria-label':'Check observations',maxlength:'1000',rows:'2'});note.value=control.mapping.note;
    const ack=el('input',{type:'checkbox'});
    const snapshotAck=el('input',{type:'checkbox'});
    const next=el('button',{type:'button',class:'primary',text:'Continue'}),back=el('button',{type:'button',class:'secondary',text:'Back'});
    const submit=el('button',{type:'submit',class:'primary',text:'Save checked control'});
    let step=1;
    function show(){
      error.textContent='';ack.checked=false;
      progress.textContent='Step '+step+' of 3 · '+(step===1?'Find the connection':step===2?'Record what you see':'Confirm this check');
      stage.replaceChildren();back.hidden=step===1;next.hidden=step===3;submit.hidden=step!==3;
      if(step===1){
        stage.append(el('p',{text:'Remove the propellers before a powered bench check. In Betaflight’s Receiver tab, observe which AUX bar changes when you move only this control. Do not arm the motors for this check.'}),
          el('a',{href:'https://betaflight.com/docs/wiki/app/receiver-tab',target:'_blank',rel:'noreferrer',text:'Betaflight Receiver tab guide ↗'}),
          el('p',{class:'form-help',text:'AUX is Betaflight’s name for an extra receiver channel. FPVBench has no live connection; enter your own observations.'}),
          field('Channel observed',route),el('p',{class:'form-help',text:'If no channel moves, leave this unfinished. A camera or controller-only function needs its own observed identification.'}));
      } else if(step===2){
        if(route.value==='external')stage.append(el('p',{text:'Describe the controller or camera function you observed. This does not establish an aircraft mode.'}),field('Check observations',note));
        else{
          stage.append(el('p',{text:'For each position or button state you check, give it your own name and enter the value shown in Receiver. Record at least two different values. For a button, observe press and release; do not assume it latches.'}));
          for(const[rIndex,r]of rows.entries())stage.append(el('div',{class:'controller-position-row'},field('Position '+(rIndex+1)+' name',r.label),field('Receiver value',r.value)));
          stage.append(field('Check observations (optional)',note));
        }
      }else{
        stage.append(el('p',{text:route.value==='external'?'Recorded as a controller / camera function.':'Connection: AUX'+route.value}),
          el('p',{text:'Use the Modes tab to check which saved action ranges match these observed values. This records your mapping and observations; it does not prove the aircraft is ready to fly.'}),
          el('a',{href:'https://betaflight.com/docs/wiki/app/auxiliary-tab',target:'_blank',rel:'noreferrer',text:'Betaflight Modes tab guide ↗'}),
          field('I checked this physical control and all positions or states recorded here.',ack));
        if(route.value!=='external')for(const r of rows.filter(r=>r.label.value.trim()||r.value.value.trim()))stage.append(el('p',{text:r.label.value+' = '+r.value.value}));
      }
      progress.focus();
    }
    next.addEventListener('click',()=>{
      error.textContent='';
      if(step===1&&!route.value){error.textContent='Choose the connection you observed, or leave the check unfinished.';return;}
      if(step===2){try{checkedObservation({route:route.value,rows:rows.map(r=>({label:r.label.value,value:r.value.value})),note:note.value,acknowledged:true});}catch(e){error.textContent=e.message;return;}}
      step++;show();
    });
    back.addEventListener('click',()=>{step--;show();});
    const ready=el('div',{},field('I am checking the aircraft configuration saved in this selected backup.',snapshotAck),el('p',{class:'form-help',text:'If the aircraft has changed since this backup, import a fresh full backup and check that setup instead.'}));
    form.append(ready,progress,stage,error,el('div',{class:'toolbar'},back,next,submit,cancel));
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(step!==3)return;
      error.textContent='';
      if(!snapshotAck.checked){error.textContent='Confirm that you are checking the configuration in this selected backup.';return;}
      try{
        const mapping=checkedObservation({route:route.value,rows:rows.map(r=>({label:r.label.value,value:r.value.value})),note:note.value,acknowledged:ack.checked});
        if(mapping.kind==='external'&&!mapping.note.trim()){error.textContent='Describe the controller or camera function you checked.';return;}
        await onSave(mapping);
      }catch(e){error.textContent=e.message;}
    });
    body.replaceChildren(form);show();
  });
  return section;
}
