import { afterEach, beforeEach, expect, test } from '@jest/globals';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, realpath, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { validateBuildLocations, buildMacosInstaller } from '../packaging/build-macos.mjs';
import { registryCrates, pinnedDownload } from '../packaging/bundled-notices.mjs';
import { validatePayload, inspectInstallation, installPayload } from '../src/macos-installer.mjs';
let dir,payload,home;
const digest=value=>createHash('sha256').update(value).digest('hex');
async function fixture(){
  const files={
    'node/bin/node':'synthetic executable',
    'node/LICENSE':'synthetic runtime license',
    'app/package.json':'{"name":"fpvbench","version":"0.8.0-alpha.1","license":"MIT"}',
    'app/src/server.mjs':'synthetic server',
    'app/src/macos-service.mjs':'synthetic service',
    'app/src/macos-installer.mjs':'synthetic installer',
    'app/LICENSE':'synthetic project license',
    'app/THIRD_PARTY_NOTICES.md':'synthetic upstream license',
    'app/node_modules/dji-log-parser-js/package.json':'{"name":"dji-log-parser-js","version":"0.5.7"}',
    'licenses/BUNDLED_NOTICES.md':'synthetic component inventory',
  };
  const manifest={schema:1,application:'FPVBench',version:'0.8.0-alpha.1',platform:'darwin',arch:'arm64',nodeVersion:'v24.22.1',files:[]};
  for(const [path,value]of Object.entries(files)){
    await mkdir(join(payload,path,'..'),{recursive:true});await writeFile(join(payload,path),value);
    manifest.files.push({path,size:Buffer.byteLength(value),sha256:digest(value),executable:path==='node/bin/node'});
  }
  await writeFile(join(payload,'manifest.json'),JSON.stringify(manifest));return manifest;
}
beforeEach(async()=>{dir=await mkdtemp(join(await realpath(tmpdir()),'fpvbench-installer-test-'));payload=join(dir,'payload');home=join(dir,'Synthetic Home');await mkdir(home);await mkdir(payload);await fixture();});
afterEach(async()=>rm(dir,{recursive:true,force:true}));
const options=()=>({payloadRoot:payload,home,platform:'darwin',arch:'arm64',probePort:async()=>true,activate:async()=>{},deactivate:async()=>{}});
async function mutateManifest(fn){const path=join(payload,'manifest.json');const value=JSON.parse(await readFile(path));fn(value);await writeFile(path,JSON.stringify(value));}

test('validates a complete bounded payload and dry check creates no user files',async()=>{
  expect((await validatePayload(payload)).version).toBe('0.8.0-alpha.1');
  expect(await inspectInstallation(options())).toMatchObject({status:'ready',launcher:join(home,'Applications','FPVBench.app')});
  expect(await readdir(home)).toEqual([]);
});

test('rejects traversal, duplicate paths, missing required inputs and unexpected executable entries',async()=>{
  for(const mutation of [
    m=>m.files[0].path='../outside',
    m=>m.files.push(m.files[0]),
    m=>m.files=m.files.filter(f=>f.path!=='app/LICENSE'),
    m=>m.files[2].executable=true,
    m=>m.version='../escape',
  ]){
    await fixture();await mutateManifest(mutation);await expect(validatePayload(payload)).rejects.toThrow();
  }
});

test('rejects changed content, unlisted files, symlinks and unsupported platforms',async()=>{
  await writeFile(join(payload,'app/LICENSE'),'changed');
  await expect(validatePayload(payload)).rejects.toThrow(/checksum|size/i);
  await fixture();await writeFile(join(payload,'unlisted.txt'),'extra');await expect(validatePayload(payload)).rejects.toThrow(/unlisted|unexpected/i);
  await rm(join(payload,'unlisted.txt'));await rm(join(payload,'app/LICENSE'));await symlink(join(payload,'node/LICENSE'),join(payload,'app/LICENSE'));
  await expect(validatePayload(payload)).rejects.toThrow(/symbolic/i);
  await expect(inspectInstallation({...options(),platform:'win32'})).rejects.toThrow(/Apple Silicon Mac/);
});

test('refuses unowned app, support files or an existing unmanaged workspace without changing them',async()=>{
  for(const relative of ['Applications/FPVBench.app','Library/Application Support/FPVBench/unknown.txt','.fpvbench/retain.txt']){
    const path=join(home,relative);await mkdir(join(path,'..'),{recursive:true});await writeFile(path,'retain');
    await expect(inspectInstallation(options())).rejects.toThrow(/existing|unowned|already/i);
    expect(await readFile(path,'utf8')).toBe('retain');
    await rm(path,{force:true});await rm(join(home,'Library'),{recursive:true,force:true});await rm(join(home,'.fpvbench'),{recursive:true,force:true});await rm(join(home,'Applications'),{recursive:true,force:true});
  }
});

test('recognizes a managed installation and reuses its launcher without activation',async()=>{
  const support=join(home,'Library/Application Support/FPVBench');const app=join(home,'Applications/FPVBench.app');
  await mkdir(support,{recursive:true});await mkdir(join(app,'Contents'),{recursive:true});
  await writeFile(join(app,'Contents/.fpvbench-managed'),'FPVBench launcher version 1\n');
  await writeFile(join(support,'launch-config.json'),JSON.stringify({managedVersion:1,root:'/synthetic/existing root',node:'/synthetic/existing node',dataDir:'/synthetic/workspace',port:4173,login:true}));
  let called=false;const before=await readFile(join(support,'launch-config.json'),'utf8');
  const result=await installPayload({...options(),activate:async()=>{called=true;}});
  expect(result).toMatchObject({status:'already-installed',launcher:app});expect(called).toBe(false);
  expect(await readFile(join(support,'launch-config.json'),'utf8')).toBe(before);
});

test('stages only the validated payload and passes exact activation args without a shell',async()=>{
  let invocation;const result=await installPayload({...options(),login:false,activate:async(...args)=>{invocation=args;}});
  expect(result.status).toBe('installed');expect(invocation[1]).toEqual([join(result.release,'app/src/macos-service.mjs'),'install','--no-login']);
  expect(invocation[0]).toBe(join(result.release,'node/bin/node'));
  expect(invocation[2]).toMatchObject({cwd:join(result.release,'app')});
  expect((await validatePayload(result.release)).version).toBe('0.8.0-alpha.1');
  expect(await readdir(home)).toEqual(['Library']);
});

test('activation failure retains only bounded installer-owned recovery information and payload',async()=>{
  await expect(installPayload({...options(),activate:async()=>{throw new Error('synthetic failure');}})).rejects.toThrow(/could not finish/i);
  const support=join(home,'Library/Application Support/FPVBench');
  expect(await readFile(join(support,'INSTALLATION-INCOMPLETE.txt'),'utf8')).toMatch(/Preserve/);
  expect(await readdir(join(support,'releases'))).toHaveLength(1);
});

test('directory symlinks are rejected before listed content is opened',async()=>{
  const outside=join(dir,'outside-source');await mkdir(outside);await writeFile(join(outside,'server.mjs'),'changed content that does not match');
  await rm(join(payload,'app/src'),{recursive:true});await symlink(outside,join(payload,'app/src'));
  await expect(validatePayload(payload)).rejects.toThrow(/symbolic/i);
});
test('oversized manifest is rejected from file metadata before parsing',async()=>{
  await truncate(join(payload,'manifest.json'),2*1024*1024+1);
  await expect(validatePayload(payload)).rejects.toThrow(/manifest is too large/i);
});
test('occupied default port refuses before home mutations or service activation',async()=>{
  let activated=false;
  await expect(installPayload({...options(),probePort:async()=>false,activate:async()=>{activated=true;}})).rejects.toThrow(/4173/);
  expect(activated).toBe(false);expect(await readdir(home)).toEqual([]);
});
test('activation failure stops only the newly registered matching service',async()=>{
  let stopped=null;
  const activate=async(node,args)=>{
    const support=join(home,'Library/Application Support/FPVBench');
    await writeFile(join(support,'launch-config.json'),JSON.stringify({managedVersion:1,node,root:join(args[0],'../..'),dataDir:join(home,'.fpvbench'),port:4173,login:true}));
    throw new Error('failed after registration');
  };
  await expect(installPayload({...options(),activate,deactivate:async(...args)=>{stopped=args;}})).rejects.toThrow(/could not finish/);
  expect(stopped?.[1][1]).toBe('stop');
  expect(await readFile(join(home,'Library/Application Support/FPVBench/INSTALLATION-INCOMPLETE.txt'),'utf8')).toMatch(/newly registered service was stopped/);
});

test('failed activation does not stop a different installation',async()=>{
  let stopped=false;
  const activate=async()=>{
    await writeFile(join(home,'Library/Application Support/FPVBench/launch-config.json'),JSON.stringify({managedVersion:1,node:'/other/node',root:'/other/app',dataDir:join(home,'.fpvbench'),port:4173,login:true}));
    throw new Error('failure after another configuration appeared');
  };
  await expect(installPayload({...options(),activate,deactivate:async()=>{stopped=true;}})).rejects.toThrow(/could not finish/);
  expect(stopped).toBe(false);
});
test('Cargo notice inputs retain exact registry versions and reject unsupported sources',()=>{
  const lock='[[package]]\nname = "example"\nversion = "1.2.3"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "'+'a'.repeat(64)+'"\n';
  expect(registryCrates(lock)).toEqual([{name:'example',version:'1.2.3',checksum:'a'.repeat(64)}]);
  expect(()=>registryCrates(lock.replace('registry+https://github.com/rust-lang/crates.io-index','git+https://invalid.example/source'))).toThrow(/Unsupported Cargo/);
});
test('corrupt cached downloads fail without making a request',async()=>{
  const cache=join(dir,'cache');await mkdir(cache);await writeFile(join(cache,'synthetic.tar.gz'),'bad');
  await expect(pinnedDownload('https://nodejs.org/download/release/synthetic.tar.gz','a'.repeat(64),cache,'synthetic.tar.gz')).rejects.toThrow(/Cached input checksum/);
  await expect(pinnedDownload('https://untrusted.example/archive','a'.repeat(64),cache,'example.tar.gz')).rejects.toThrow(/Invalid pinned/);
});

test('custom-home installation refuses default lifecycle operations before mutation',async()=>{
  let activated=false,deactivated=false;
  const call=options();
  await expect(installPayload({...call,activate:undefined,deactivate:async()=>{deactivated=true;}})).rejects.toThrow(/both lifecycle/);
  await expect(installPayload({...call,activate:async()=>{activated=true;},deactivate:undefined})).rejects.toThrow(/both lifecycle/);
  await expect(installPayload({...call,activate:undefined,deactivate:undefined})).rejects.toThrow(/both lifecycle/);
  expect(activated).toBe(false);expect(deactivated).toBe(false);expect(await readdir(home)).toEqual([]);
  expect((await inspectInstallation({...call,activate:undefined,deactivate:undefined})).status).toBe('ready');
});
test('builder rejects output or cache within source before creating build files',async()=>{
  const root=join(dir,'source');await mkdir(root);await mkdir(join(root,'src'));await mkdir(join(root,'public'));
  const cache=join(dir,'cache');
  await expect(buildMacosInstaller({root,out:join(root,'src','output'),cache})).rejects.toThrow(/outside the source root/);
  await expect(validateBuildLocations({root,out:join(dir,'output'),cache:join(root,'public','cache')})).rejects.toThrow(/outside the source root/);
  expect(await readdir(join(root,'src'))).toEqual([]);expect(await readdir(join(root,'public'))).toEqual([]);
});
test('builder resolves existing symlink ancestors before checking source containment',async()=>{
  const root=join(dir,'source');await mkdir(root);await mkdir(join(root,'src'));const alias=join(dir,'alias');await symlink(join(root,'src'),alias);
  await expect(validateBuildLocations({root,out:join(alias,'nested','output'),cache:join(dir,'cache')})).rejects.toThrow(/outside the source root/);
  const result=await validateBuildLocations({root,out:join(dir,'outside','output'),cache:join(dir,'cache')});
  expect(result).toEqual({root,out:join(dir,'outside','output'),cache:join(dir,'cache')});
  expect(await readdir(join(root,'src'))).toEqual([]);
});
