import { describe, test, expect } from '@jest/globals';
import { demoControllerComparison } from '../public/demo-controller.js';

describe('read-only synthetic start-here example', () => {
  test('keeps demo assignments complete and physically unverified', () => {
    const comparison = demoControllerComparison();
    expect(comparison.counts.unknown).toBe(0);
    expect(comparison.counts.changed).toBe(4);
    for (const view of [comparison.before, comparison.after]) {
      expect(view.complete).toBe(true);
      expect(view.revision).toBe(0);
      expect(view.updatedAt).toBeNull();
      expect(view.controls.every(control => !control.verified && control.mapping.verifiedAt === null)).toBe(true);
      expect(view.controls.filter(control => control.mappingSource === 'suggested')).toHaveLength(5);
    }
  });
  test('returns independent demo copies', () => {
    const comparison = demoControllerComparison();
    comparison.after.controls[0].verified = true;
    comparison.after.controls[0].mapping.note = 'local mutation';
    const next = demoControllerComparison();
    expect(next.after.controls[0].verified).toBe(false);
    expect(next.after.controls[0].mapping.note).toBe('');
  });
});

test('downloadable controller examples match the demo mode evidence', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parseExport } = await import('../src/parser.mjs');
  const { controllerView } = await import('../src/controller.mjs');
  const comparison=demoControllerComparison();
  for(const [key,name] of [['before','original'],['after','revised']]){
    const rawText=await readFile(new URL('../examples/controller-'+name+'.txt',import.meta.url),'utf8');
    const view=controllerView({rawText,parsed:parseExport(rawText)});
    expect(view.complete).toBe(true);
    const rules=v=>v.channels.flatMap(c=>c.rules).map(r=>[r.mode,r.aux,r.start,r.end,r.logic,r.linked]).sort();
    expect(rules(view)).toEqual(rules(comparison[key]));
  }
});
