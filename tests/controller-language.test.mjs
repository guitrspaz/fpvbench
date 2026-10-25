import { describe, test, expect } from '@jest/globals';
import { fullControllerExport } from './helpers/controller-fixtures.mjs';
import { parseExport } from '../src/parser.mjs';
import { controllerView, compareControllers } from '../src/controller.mjs';
import { friendlyControl, beginnerChanges, layoutConfidence } from '../public/controller-language.js';
const snapshot=(rows,options={})=>{const rawText=fullControllerExport(rows,options);return {aircraftId:'synthetic',rawText,parsed:parseExport(rawText)};};
const view=(rows,options)=>controllerView(snapshot(rows,options));
const control=(v,id)=>v.controls.find(c=>c.id===id);

describe('beginner controller language',()=>{
  test('explains common actions without requiring Betaflight vocabulary',()=>{
    const v=view({0:'0 3 1700 2100 0 0',1:'1 0 900 1700 0 0',2:'46 2 1700 2100 0 0',3:'13 4 1700 2100 0 0'});
    expect(friendlyControl(control(v,'start-stop'),true).title).toBe('Arm / disarm motors');
    expect(friendlyControl(control(v,'flight-mode'),true).title).toBe('Self-leveling flight');
    expect(friendlyControl(control(v,'pause-rth'),true).actions[0].description).toMatch(/not pause and hover/);
    expect(friendlyControl(control(v,'c1'),true).title).toBe('Find the quad');
    expect(layoutConfidence(v).message).not.toMatch(/AUX|mapping|evidence/);
  });
  test('keeps crash flip and arming permission distinct; prearm is not a motor stop',()=>{
    const v=view({0:'35 1 1700 2100 0 0',1:'36 1 1300 2100 0 0'});
    const result=friendlyControl(control(v,'c2'),true);
    expect(result.actions.map(a=>a.title)).toEqual(['Crash-flip mode','Arming permission']);
    expect(result.actions.find(a=>a.mode===36).description).toMatch(/does not stop/);
    expect(result.notice).toBeNull();
  });
  test('calls out overlapping motor-arm and rescue requests but not separate ranges',()=>{
    const overlap=view({0:'0 1 1300 2100 0 0',1:'46 1 1700 2100 0 0'});
    expect(friendlyControl(control(overlap,'c2'),true).notice).toMatch(/both motor arming and GPS recovery/);
    const separate=view({0:'0 1 900 1300 0 0',1:'46 1 1700 2100 0 0'});
    expect(friendlyControl(control(separate,'c2'),true).notice).toBeNull();
    expect(friendlyControl(control(overlap,'c2'),false).notice).toBeNull();
  });
  test('unassigned, outside-backup and native controls have distinct explanations',()=>{
    const v=view({});
    expect(friendlyControl(control(v,'c1'),true).title).toBe('No aircraft action saved');
    expect(friendlyControl(control(v,'gimbal'),true).title).toBe('Not described by this backup');
    expect(friendlyControl(control(v,'power'),true).title).toBe('Controller power');
  });
  test('does not interpret unknown firmware IDs or claim missing sparse assignments are disabled',()=>{
    const v=view({0:'0 3 1700 2100 0 0'},{kind:'diff'});
    expect(friendlyControl(control(v,'c1'),false).title).toBe('Not enough information');
    const c=structuredClone(control(v,'start-stop'));c.rules[0].label='Mode 0 (firmware unreviewed)';
    expect(friendlyControl(c,false).title).toBe('Action needs review');
  });
  test('compares physical controls using readable before and after actions',()=>{
    const a=snapshot({0:'0 0 1700 2100 0 0',1:'1 1 900 2100 0 0'});
    const b=snapshot({0:'0 1 1300 2100 0 0',1:'1 0 900 1700 0 0',2:'46 1 1700 2100 0 0'});
    const result=beginnerChanges(compareControllers(a,b));
    expect(result.changes.map(c=>c.id).sort()).toEqual(['c2','flight-mode']);
    expect(result.expected).toBe(true);
    expect(result.changes.find(c=>c.id==='c2').after).toMatch(/Arm \/ disarm motors.*GPS recovery/);
  });
  test('range-only changes remain visible and slot reorder does not count',()=>{
    const a=snapshot({0:'0 3 1700 2100 0 0'}),b=snapshot({7:'0 3 1300 2100 0 0'});
    expect(beginnerChanges(compareControllers(a,b)).changes[0]).toMatchObject({id:'start-stop',kind:'activation'});
    const reorder=snapshot({8:'0 3 1700 2100 0 0'});
    expect(beginnerChanges(compareControllers(a,reorder)).changes).toEqual([]);
  });
  test('same action moved to a different channel on the same recorded control is not a new action',()=>{
    const a=snapshot({0:'0 3 1700 2100 0 0'}),b=snapshot({0:'0 5 1700 2100 0 0'});
    for(const [s,aux]of [[a,4],[b,6]])s.controller={controls:{'start-stop':{kind:'aux',aux,positions:[],note:'',verified:true,verifiedAt:null}}};
    const result=beginnerChanges(compareControllers(a,b));
    expect(result.changes.find(c=>c.id==='start-stop')).toBeUndefined();
  });
  test('incomplete comparisons stay incomplete, and presentation never mutates observations',()=>{
    const a=snapshot({0:'0 3 1700 2100 0 0'}),b=snapshot({0:'0 1 1700 2100 0 0'},{kind:'diff'});
    const comparison=compareControllers(a,b),before=JSON.stringify(comparison);
    expect(beginnerChanges(comparison)).toMatchObject({incomplete:true,changes:[]});
    friendlyControl(comparison.after.controls[0],false);
    expect(JSON.stringify(comparison)).toBe(before);
  });
});

test('explains version or hardware comparison limits without blaming missing settings',()=>{
  const a=snapshot({0:'0 3 1700 2100 0 0'}),b=snapshot({0:'0 1 1700 2100 0 0'});
  b.parsed.firmware.version='4.5.5';
  const result=beginnerChanges(compareControllers(a,b));
  expect(result.incomplete).toBe(true);
  expect(result.reason).toMatch(/different aircraft software or hardware/);
  expect(result.reason).not.toMatch(/missing|full backup/);
});
test('explains sparse comparison gaps in beginner language',()=>{
  const a=snapshot({0:'0 3 1700 2100 0 0'}),b=snapshot({0:'0 1 1700 2100 0 0'},{kind:'diff'});
  expect(beginnerChanges(compareControllers(a,b)).reason).toMatch(/leaves out settings/);
});
