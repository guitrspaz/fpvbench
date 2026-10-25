import { friendlyControl, layoutConfidence } from './controller-language.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Standalone offline reference with only selected setup identity and visible control observations. */
export function controlCardHTML(view,{aircraftName='',setupLabel='',importedAt='',generatedAt=new Date().toISOString()}={}) {
  const confidence=layoutConfidence(view);
  const controls=view.controls.map(c=>{
    const plain=friendlyControl(c,view.complete);
    const status=c.verified?'Checked for this setup'+(c.mapping.verifiedAt?' · '+c.mapping.verifiedAt:''):c.mappingSource==='suggested'?'Expected assignment · not checked':c.mappingSource==='documented'?'Controller function':'Not checked';
    const positions=c.positions.map(p=>{
      const rules=c.rules.filter(r=>Math.max(900,Math.min(2099,p.value))>=r.start&&Math.max(900,Math.min(2099,p.value))<r.end);
      const title=p.behaviors===null?'Needs more information':rules.length?friendlyControl({...c,rules},true).title:'No aircraft action at this position';
      return '<li>'+escape(p.label)+' — '+escape(title)+'</li>';
    }).join('');
    return '<article><h2>'+escape(c.label)+'</h2><p class="meta">'+escape(c.location)+' · '+escape(status)+'</p><strong>'+escape(plain.title)+'</strong><p>'+escape(plain.description)+'</p>'+(plain.notice?'<p class="notice">'+escape(plain.notice)+'</p>':'')+(positions?'<ul>'+positions+'</ul>':'')+'</article>';
  }).join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(setupLabel)+' · FPVBench control card</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#182025}h1{margin-bottom:0}h2{font-size:1.1rem;margin:0}header,.notice{border:1px solid #acb5ba;padding:16px;border-radius:8px}.meta{color:#48565f;font-size:.85rem}.controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}article{border:1px solid #acb5ba;border-radius:8px;padding:16px;break-inside:avoid}ul{padding-left:20px}@media(max-width:600px){.controls{grid-template-columns:1fr}}@media print{body{font-size:11px;margin:0;max-width:none}article{padding:8px}.controls{gap:8px}h1{font-size:20px}}</style><header><h1>'+escape(aircraftName)+' · Controller 3</h1><p>'+escape(setupLabel)+'</p><p class="meta">Backup imported: '+escape(importedAt)+'<br>Card created: '+escape(generatedAt)+'</p><strong>'+escape(confidence.title)+'</strong><p>'+escape(confidence.message)+'</p><p>Saved backup reference only. Button labels do not guarantee DJI flight behavior. Check the aircraft’s current settings before flight.</p>'+(!view.complete?'<p class="notice">Some aircraft actions could not be fully read. Unknowns are not unused controls.</p>':'')+'</header><main class="controls">'+controls+'</main><footer><p>Open this file in a browser to view offline or print. Unidentified actions may remain outside this card. FPVBench does not certify flight readiness.</p></footer></html>';
}
export function downloadControlCard(view,context) {
  const url=URL.createObjectURL(new Blob([controlCardHTML(view,context)],{type:'text/html;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='fpvbench-control-card.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
