import { describe, test, expect } from '@jest/globals';
import { fullControllerExport } from './helpers/controller-fixtures.mjs';
import { parseExport } from '../src/parser.mjs';
import { controllerView, compareControllers, normalizeModes, validateController, suggestedController } from '../src/controller.mjs';
const snap = (lines, kind = 'dump', version = '4.5.2') => ({ aircraftId: 'a', parsed: parseExport(`# ${kind} all\n# Betaflight / TEST ${version}\n${lines}\nset test = 1\nsave\n`) });
const arm = 'aux 0 0 3 1700 2100 0 0';
const withMap = s => ({ ...s, controller: suggestedController() });

describe('interpreted controller evidence', () => {
  test('does not assume physical mappings; suggested mappings are never verified', () => {
    expect(controllerView(snap(arm)).controls.find(c => c.id === 'start-stop')).toMatchObject({ assignment: 'assigned', mapping: {kind:'unknown'}, mappingSource:'suggested', verified: false });
    const view = controllerView(withMap(snap(arm)));
    expect(view.controls.find(c => c.id === 'start-stop')).toMatchObject({ assignment: 'assigned', verified: false, behaviors: ['Arm/disarm request'] });
    expect(view.controls.find(c => c.id === 'c1')).toMatchObject({ assignment: 'unassigned' });
    expect(controllerView(withMap(snap(arm, 'diff'))).controls.find(c => c.id === 'c1').assignment).toBe('unknown');
  });
  test('normalizes reordered slots and duplicate rules without behavior changes', () => {
    const a = snap(`${arm}\naux 1 13 4 1700 2100 0 0`);
    const b = snap('aux 8 13 4 1700 2100 0 0\naux 7 0 3 1700 2100 0 0\naux 9 0 3 1700 2100 0 0');
    expect(compareControllers(a,b).counts.changed).toBe(0);
    expect(compareControllers(a,b).counts.unknown).toBe(0);
  });
  test('channel moves affect both channels and preserve named behavior', () => {
    const result = compareControllers(snap(arm), snap('aux 0 0 1 1700 2100 0 0'));
    expect(result.counts.changed).toBe(2);
    expect(result.channels.find(c => c.aux === 4)).toMatchObject({ change: 'changed', before: ['Arm/disarm request'], after: [] });
  });
  test('empty ranges are inactive; measured positions use exclusive end and clamp 2100', () => {
    const s = withMap(snap(`${arm}\naux 1 0 0 900 900 0 0`));
    s.controller.controls['start-stop'].positions = [{ label: 'Below', value: 1699 }, { label: 'Active', value: 1700 }, { label: 'High', value: 2100 }];
    expect(controllerView(s).controls.find(c => c.id === 'start-stop').positions.map(p => p.behaviors)).toEqual([[], ['Arm/disarm request'], ['Arm/disarm request']]);
    expect(normalizeModes(s).rules).toHaveLength(1);
  });
  test.each([
    snap(arm,'diff'), snap(arm,'dump','4.6.0'), snap(`${arm}\naux 1 99 1 1700 2100 0 0`),
    snap(`${arm}\naux 1 13 4 1700 2100 1 0`), snap(`${arm}\naux 1 13 4 1700 2100 0 36`),
    snap(`${arm}\nadjrange 0 0 0 900 2100 1 1`), snap(`${arm}\naux 1 broken`), snap(`${arm}\naux 1 13 4 1701 2100 0 0`),
  ])('keeps incomplete/unsupported interpretations out of confirmed changes', s => {
    const result = compareControllers(snap(arm),s);
    expect(result.counts.changed).toBe(0);
    expect(result.counts.unknown).toBe(14);
    expect(normalizeModes(s).complete).toBe(false);
  });
  test('does not call firmware or board changes confirmed behavior', () => {
    const a = snap(arm), b = snap(arm,'dump','4.5.3');
    expect(compareControllers(a,b).counts.unknown).toBe(14);
    b.parsed.firmware.version = '4.5.2'; b.parsed.firmware.boardName = 'OTHER';
    expect(compareControllers(a,b).counts.unknown).toBe(14);
  });
  test('mapping changes and verification changes are separate from mode changes', () => {
    const a = withMap(snap(arm)), b = structuredClone(a);
    b.controller.controls['start-stop'].verified = true;
    expect(compareControllers(a,b).mappingChanges).toEqual([]);
    b.controller.controls['start-stop'].aux = 2;
    expect(compareControllers(a,b).mappingChanges.map(c => c.id)).toEqual(['start-stop']);
    expect(compareControllers(a,b).counts.changed).toBe(0);
  });
  test('inactive adjustment slots do not obscure mode coverage; User 1 is not VTX disable', () => {
    const s=snap(arm+'\naux 1 40 8 900 2100 0 0\nadjrange 0 0 0 900 900 0 0');
    expect(normalizeModes(s).complete).toBe(true);
    expect(normalizeModes(s).rules.find(r=>r.mode===40).label).toBe('User 1 (custom action)');
  });
  test('rejects unrelated aircraft', () => expect(() => compareControllers(snap(arm), { ...snap(arm), aircraftId: 'b' })).toThrow(/same aircraft/));
  test('bounds and validates observations instead of accepting arbitrary metadata', () => {
    const good = { ...suggestedController(), revision:1,updatedAt:'2026-10-24T12:00:00.000Z' };
    expect(() => validateController(good)).not.toThrow();
    for (const mapping of [{ ...good.controls.c1, aux:0 }, { ...good.controls.c1, verified:'yes' }, { ...good.controls.c1, positions:[{label:'High',value:2200}] }]) {
      expect(() => validateController({ ...good, controls: { c1:mapping } })).toThrow();
    }
    expect(() => validateController({ ...good, controls: { imaginary: good.controls.c1 } })).toThrow();
  });
});

describe('realistic CLI warning isolation and unsaved preview', () => {
  const full=(assignments={},options={})=>{const rawText=fullControllerExport(assignments,options);return {aircraftId:'a',rawText,parsed:parseExport(rawText)};};
  test('unrelated warnings do not obscure independently audited complete AUX rows', () => {
    const a=full({0:'0 3 1700 2100 0 0'}),b=full({0:'0 1 1700 2100 0 0'});
    expect(a.parsed.warnings.length).toBeGreaterThan(0);
    expect(normalizeModes(a)).toMatchObject({complete:true});
    expect(compareControllers(a,b).counts).toMatchObject({changed:2,unknown:0});
    expect(normalizeModes(a).notices.length).toBeGreaterThan(0);
  });
  test('a partial AUX domain with parser warnings still cannot establish absence', () => {
    expect(normalizeModes(full({}, {omit:[19]})).complete).toBe(false);
  });
  test.each([
    {extra:'aux broken'},
    {extra:'aux 0 0 2 1700 2100 0 0'},
    {extra:'adjrange broken'},
    {kind:'diff'},
  ])('domain ambiguity and sparse sources remain unknown',options=>{
    expect(normalizeModes(full({},options)).complete).toBe(false);
  });
  test('complete raw AUX rows do not override a truncation warning', () => {
    const a=full();a.rawText=a.rawText.replace(/save\n$/,'');a.parsed=parseExport(a.rawText);
    expect(normalizeModes(a).complete).toBe(false);
  });
  test('raw source must agree with the parsed domain records', () => {
    const a=full();a.parsed.commands=a.parsed.commands.filter(c=>c.key!=='command:aux:19');
    expect(normalizeModes(a).complete).toBe(false);
  });
  test('without original source unrelated warning scope cannot be assumed', () => {
    const a=full();delete a.rawText;expect(normalizeModes(a).complete).toBe(false);
  });
  test('preview assignments are immediately useful but remain unsaved and unverified', () => {
    const a=full({0:'0 3 1700 2100 0 0',1:'1 0 900 1700 0 0'});
    const view=controllerView(a),control=view.controls.find(c=>c.id==='start-stop');
    expect(control).toMatchObject({mapping:{kind:'unknown'},mappingSource:'suggested',displayMapping:{kind:'aux',aux:4},assignment:'assigned',verified:false,behaviors:['Arm/disarm request']});
    expect(a.controller).toBeUndefined();
    expect(view.controls.find(c=>c.id==='power')).toMatchObject({mappingSource:'documented',assignment:'external',verified:false});
  });
  test('an explicitly unknown recorded control does not silently acquire a suggestion', () => {
    const a=full();a.controller={controls:{'start-stop':{kind:'unknown',aux:null,positions:[],note:'Not established',verified:false,verifiedAt:null}}};
    expect(controllerView(a).controls.find(c=>c.id==='start-stop')).toMatchObject({mappingSource:'recorded',displayMapping:{kind:'unknown'},assignment:'unknown'});
  });
});
