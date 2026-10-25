import { describe, test, expect } from '@jest/globals';
import { checkedObservation, controllerReferences } from '../public/controller-check.js';
import { controlCardHTML } from '../public/controller-card.js';
import { comparisonGuidance } from '../public/controller-language.js';
import { parseExport } from '../src/parser.mjs';
import { controllerView } from '../src/controller.mjs';
import { fullControllerExport } from './helpers/controller-fixtures.mjs';
const rows=[{label:'Released',value:'1000'},{label:'Pressed',value:'2000'}];

describe('guided physical checks',()=>{
  test('records only explicitly acknowledged measured values and labels',()=>{
    expect(checkedObservation({route:'4',rows,acknowledged:true})).toEqual({kind:'aux',aux:4,positions:[{label:'Released',value:1000},{label:'Pressed',value:2000}],note:'',verified:true});
    expect(()=>checkedObservation({route:'4',rows})).toThrow(/Confirm/);
    expect(()=>checkedObservation({route:'',rows,acknowledged:true})).toThrow(/observed/);
    expect(()=>checkedObservation({route:'unknown',rows,acknowledged:true})).toThrow();
  });
  test('rejects incomplete, duplicate, identical or out-of-range observations',()=>{
    for(const bad of [
      [],rows.slice(0,1),Array(6).fill(rows[0]),
      [{label:'A',value:1000},{label:'A',value:2000}],
      [{label:'A',value:1000},{label:'B',value:1000}],
      [{label:'A',value:''},{label:'B',value:2000}],
      [{label:'A',value:899},{label:'B',value:2000}],
      [{label:'A',value:1000.5},{label:'B',value:2101}],
    ])expect(()=>checkedObservation({route:'1',rows:bad,acknowledged:true})).toThrow();
  });
  test('external functions do not inherit stale channel positions',()=>{
    expect(checkedObservation({route:'external',rows,acknowledged:true,note:'Observed camera action'})).toMatchObject({kind:'external',aux:null,positions:[],verified:true});
  });
});

describe('explicit comparison references',()=>{
  const history=[
    {id:'latest',aircraftId:'a',importedAt:'2026-10-25T12:00:00Z'},
    {id:'prior',aircraftId:'a',importedAt:'2026-10-24T12:00:00Z'},
    {id:'original',aircraftId:'a',importedAt:'2026-10-23T12:00:00Z'},
  ];
  test('uses explicit prior confirmed flight rather than recent imports, unconfirmed or foreign sessions',()=>{
    const sessions=[
      {id:'yes',aircraftId:'a',snapshotId:'original',confirmedSetup:true,flownAt:'2026-10-24T13:00:00Z'},
      {id:'no',aircraftId:'a',snapshotId:'prior',confirmedSetup:false,flownAt:'2026-10-25T10:00:00Z'},
      {id:'foreign',aircraftId:'b',snapshotId:'original',confirmedSetup:true,flownAt:'2026-10-25T11:00:00Z'},
      {id:'future',aircraftId:'a',snapshotId:'latest',confirmedSetup:true,flownAt:'2026-10-26T11:00:00Z'},
    ];
    const refs=controllerReferences(history,'latest',sessions,'prior');
    expect(refs.map(r=>r.id)).toEqual(['prior','original','prior']);
    expect(refs.every(r=>r.available)).toBe(true);
  });
  test('missing, same-setup and dangling references stay unavailable',()=>{
    const refs=controllerReferences(history,'latest',[{id:'same',aircraftId:'a',snapshotId:'latest',confirmedSetup:true,flownAt:'2026-10-25T11:00:00Z'}],'latest');
    expect(refs[1]).toMatchObject({id:'latest',available:false});
    expect(refs[1].reason).toMatch(/selected setup/);
    const empty=controllerReferences(history,'original',[{id:'lost',aircraftId:'a',snapshotId:'gone',confirmedSetup:true,flownAt:'2026-10-22T10:00:00Z'}],'gone');
    expect(empty.every(r=>!r.available)).toBe(true);
  });
});

describe('portable control card and actionable limits',()=>{
  const rawText=fullControllerExport({0:'0 3 1700 2100 0 0'});
  const view=controllerView({rawText,parsed:parseExport(rawText)});
  test('escapes source labels and excludes raw exports, hidden notes and arbitrary context',()=>{
    const dirty=structuredClone(view);
    dirty.controls[0].label='<script>alert(1)</script>';
    dirty.controls[0].mapping.note='PRIVATE_NOTE_SENTINEL';
    const html=controlCardHTML(dirty,{aircraftName:'A & B',setupLabel:'<img src=x onerror=alert(1)>',importedAt:'2026-10-25',serial:'PRIVATE_SERIAL_SENTINEL',generatedAt:'2026-10-25'});
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).not.toMatch(/<script|<img|PRIVATE_NOTE_SENTINEL|PRIVATE_SERIAL_SENTINEL|aux 0 /);
    expect(html).toContain('Expected assignment · not checked');
    expect(html).toContain('@media print');
  });
  test('distinguishes checked state and incomplete actions',()=>{
    const checked=structuredClone(view);checked.complete=false;
    checked.controls[0].verified=true;checked.controls[0].mapping.verifiedAt='2026-10-25T12:00:00.000Z';
    const html=controlCardHTML(checked,{setupLabel:'Bench backup'});
    expect(html).toContain('Checked for this setup · 2026-10-25T12:00:00.000Z');
    expect(html).toContain('Unknowns are not unused controls');
    expect(html).toContain('Controller power');
  });
  test('each comparison limit leads to a specific next step without reconstructing old settings',()=>{
    expect(comparisonGuidance({reasons:['Firmware or board metadata differs']})).toEqual(expect.arrayContaining([expect.stringMatching(/cannot recover/)]));
    expect(comparisonGuidance({reasons:['sparse partial export']})).toEqual(expect.arrayContaining([expect.stringMatching(/dump all/),expect.stringMatching(/older setup/)]));
    expect(comparisonGuidance({reasons:['currently supports 4.5']})).toEqual(expect.arrayContaining([expect.stringMatching(/Do not change/)]));
    expect(comparisonGuidance()).toEqual(expect.arrayContaining([expect.stringMatching(/not proof/)]));
  });
});
