import { describe, test, expect } from '@jest/globals';
import { parseExport } from '../src/parser.mjs';
import { compareSnapshots } from '../src/compare.mjs';

const header = '# Betaflight / STM32F405 (S405) 4.5.1 Jun 2024 / MSP API: 1.46';
const source = (text, kind = 'dump all') => `# ${kind}\n${header}\nboard_name TESTBOARD\nmanufacturer_id TEST\n${text}\nsave\n`;
const snapshot = (id, rawText) => ({ id, aircraftId: 'quad', parsed: parseExport(rawText) });

describe('Betaflight text imports', () => {
  test('parses metadata, BOM/CRLF/prompts, profiles and explicit active markers', () => {
    const parsed = parseExport('\ufeff' + source('# set gyro_lpf1_static_hz = 150\nprofile 0\nset p_roll = 42\nprofile 1\nset p_roll = 48\nrateprofile 0\nset roll_rc_rate = 100\n# restore original profile selection\nprofile 0\n# restore original rateprofile selection\nrateprofile 0').replaceAll('\n', '\r\n'));
    expect(parsed.firmware).toEqual({ version: '4.5.1', board: 'STM32F405 (S405)', mspApi: '1.46', boardName: 'TESTBOARD', manufacturer: 'TEST' });
    expect(parsed.settings.map(s => s.key)).toEqual(['global:gyro_lpf1_static_hz', 'pid:0:p_roll', 'pid:1:p_roll', 'rate:0:roll_rc_rate']);
    expect(parsed.activeProfile).toBe(0);
    expect(parsed.activeRateProfile).toBe(0);
    expect(parsed.warnings).toEqual([]);
  });
  test('keys feature toggles and indexed configuration by identity, not mutable values', () => {
    const parsed = parseExport(source('feature -GPS\nfeature RX_SERIAL\naux 0 1 2 900 1200 0 0\nresource MOTOR 1 A01\nserial 0 64 115200 57600 0 115200'));
    expect(parsed.commands.map(s => s.key)).toEqual(['command:feature:GPS', 'command:feature:RX_SERIAL', 'command:aux:0', 'command:resource:MOTOR:1', 'command:serial:0']);
    expect(parsed.commands[0].value).toBe('-GPS');
  });
  test('keeps unknown settings and reports unknown commands, duplicates, incomplete exports', () => {
    const parsed = parseExport(`${header}\nset future_setting = literal value\nset future_setting = other\nfuture_command 42`);
    expect(parsed.settings[0].value).toBe('other');
    expect(parsed.warnings.join(' ')).toMatch(/Duplicate.*Unknown command.*export.*save/i);
  });
  test.each(['', 'set p_roll = 40', `${header}\nstatus`, `${header}\nset x = \u0000`, source('set x = 1').repeat(20000)])('rejects unusable content', text => {
    expect(() => parseExport(text)).toThrow();
  });
  test('identifies missing firmware version and partial exports', () => {
    const parsed = parseExport('# diff master\n# Betaflight\nset x = 1\nbatch end');
    expect(parsed.exportScope).toBe('partial');
    expect(parsed.warnings.join(' ')).toMatch(/version.*partial/i);
  });
  test('commented defaults are not explicit values and metadata comments are supported', () => {
    const parsed = parseExport(source('#set default_only = 1\nset explicit = 2\n# board_name: COMMENTBOARD\n# manufacturer_id: CMNT', 'diff all defaults'));
    expect(parsed.settings.map(setting => setting.name)).toEqual(['explicit']);
    expect(parsed.firmware.boardName).toBe('COMMENTBOARD');
    expect(parsed.firmware.manufacturer).toBe('CMNT');
  });
});

describe('snapshot comparison', () => {
  test('compares profile-aware literal values and common command identities', () => {
    const from = snapshot('old', source('feature GPS\naux 0 1 2 900 1200 0 0\nset global_setting = 1\nprofile 0\nset p_roll = 40\nprofile 1\nset p_roll = 45'));
    const to = snapshot('new', source('feature -GPS\naux 0 1 2 900 1300 0 0\nset new_setting = 2\nprofile 0\nset p_roll = 41\nprofile 1\nset p_roll = 45'));
    const result = compareSnapshots(from, to);
    expect(result.counts).toEqual({ changed: 3, added: 1, removed: 1, unchanged: 1, unknown: 0 });
    expect(result.rows.find(r => r.key === 'command:aux:0')).toMatchObject({ from: '0 1 2 900 1200 0 0', to: '0 1 2 900 1300 0 0', change: 'changed' });
  });
  test('missing sparse values stay unknown in either direction', () => {
    const from = snapshot('old', source('set x = 1', 'diff all'));
    const to = snapshot('new', source('set y = 2'));
    const result = compareSnapshots(from, to);
    expect(result.rows.find(r => r.name === 'y').change).toBe('unknown');
    expect(result.rows.find(r => r.name === 'x').change).toBe('removed');
    expect(compareSnapshots(to, from).rows.find(r => r.name === 'y').change).toBe('unknown');
  });
  test('warns about firmware and board mismatch, rejects cross-aircraft', () => {
    const from = snapshot('a', source('set x = 1'));
    const to = snapshot('b', source('set x = 1').replace('4.5.1', '4.4.0').replace('STM32F405', 'STM32F411'));
    expect(compareSnapshots(from, to).warnings.join(' ')).toMatch(/firmware.*board/i);
    expect(() => compareSnapshots(from, { ...to, aircraftId: 'other' })).toThrow(/same aircraft/i);
  });
  test('active profile metadata is compared, and omitted selections remain unknown', () => {
    const from = snapshot('old', source('set x = 1\n# restore original profile selection\nprofile 0'));
    const to = snapshot('new', source('set x = 1\n# restore original profile selection\nprofile 1'));
    expect(compareSnapshots(from, to).rows.find(row => row.key === 'selection:activeProfile')).toMatchObject({ change: 'changed', from: '0', to: '1', category: 'Selected profiles' });
    const missing = snapshot('missing', source('set x = 1'));
    expect(compareSnapshots(from, missing).rows.find(row => row.key === 'selection:activeProfile').change).toBe('unknown');
  });
});
