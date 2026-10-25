import { beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pinnedDownload, registryCrates } from '../packaging/bundled-notices.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const url='https://nodejs.org/download/release/synthetic-input.txt';
let dir;
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'fpvbench-packaging-inputs-'));});
afterEach(async()=>{jest.restoreAllMocks();await rm(dir,{recursive:true,force:true});});

test('pinned downloads preserve matching bytes and reuse only matching cache entries',async()=>{
  const bytes=Buffer.from('synthetic bounded runtime input');
  const fetcher=jest.spyOn(globalThis,'fetch').mockResolvedValue(new Response(bytes));
  const path=await pinnedDownload(url,sha(bytes),dir,'runtime.txt',1024);
  expect(await readFile(path)).toEqual(bytes);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await pinnedDownload(url,sha(bytes),dir,'runtime.txt',1024)).toBe(path);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await writeFile(path,'tampered');
  await expect(pinnedDownload(url,sha(bytes),dir,'runtime.txt',1024)).rejects.toThrow(/Cached input checksum mismatch/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test('bad checksum, oversized download and untrusted inputs never produce a cached executable',async()=>{
  const bytes=Buffer.from('synthetic');
  const fetcher=jest.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(bytes));
  await expect(pinnedDownload(url,'0'.repeat(64),dir,'wrong.txt',1024)).rejects.toThrow(/checksum mismatch/);
  await expect(access(join(dir,'wrong.txt'))).rejects.toMatchObject({code:'ENOENT'});
  await expect(pinnedDownload(url,sha(bytes),dir,'large.txt',2)).rejects.toThrow(/size bound/);
  await expect(access(join(dir,'large.txt'))).rejects.toMatchObject({code:'ENOENT'});
  const count=fetcher.mock.calls.length;
  for(const args of [
    ['https://nodejs.org.evil.example/runtime',sha(bytes),dir,'safe.txt'],
    [url,sha(bytes),dir,'../outside'],
    [url,'invalid',dir,'safe.txt'],
  ])await expect(pinnedDownload(...args)).rejects.toThrow(/Invalid pinned/);
  expect(fetcher).toHaveBeenCalledTimes(count);
});
test('crate inventory keeps exact registry checksums and rejects unresolved external sources',()=>{
  const checksum='a'.repeat(64);
  const local='[[package]]\nname = "own-crate"\nversion = "0.5.7"\n';
  const registry='[[package]]\nname = "example_crate"\nversion = "1.2.3"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "'+checksum+'"\n';
  expect(registryCrates(local+registry)).toEqual([{name:'example_crate',version:'1.2.3',checksum}]);
  expect(()=>registryCrates(registry.replace(checksum,'invalid'))).toThrow(/missing checksum/);
  expect(()=>registryCrates(registry.replace('registry+https://github.com/rust-lang/crates.io-index','git+https://example.invalid/source'))).toThrow(/Unsupported Cargo source/);
});
