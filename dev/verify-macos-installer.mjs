import { mkdtemp, mkdir, readFile, readdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { validatePayload, inspectInstallation, installPayload } from '../src/macos-installer.mjs';
const execFile=promisify(execFileCallback);

/** Explicit operational proof: real payload/runtime, disposable staging, mocked OS lifecycle, no database or user install. */
export async function verifyMacosInstaller(payloadRoot){
  if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Run this proof on an Apple Silicon Mac.');
  const scratch=await realpath(await mkdtemp(join(tmpdir(),'fpvbench-installer-proof-')));
  try{
    const home=join(scratch,'Synthetic Home');await mkdir(home,{mode:0o700});
    const manifest=await validatePayload(payloadRoot);
    const check=await inspectInstallation({payloadRoot,home,probePort:async()=>true});
    assert.equal(check.status,'ready');assert.deepEqual(await readdir(home),[]);
    let activationCalls=0,deactivationCalls=0,version;
    const installed=await installPayload({
      payloadRoot,home,login:false,probePort:async()=>true,
      activate:async(node,args,options)=>{
        activationCalls++;
        assert.equal(args[1],'install');assert.equal(args[2],'--no-login');
        assert.equal(options.env.FPVBENCH_DATA_DIR,join(home,'.fpvbench'));
        assert.equal(options.env.PORT,'4173');assert.equal(options.env.NODE_OPTIONS,undefined);
        version=(await execFile(node,['--version'])).stdout.trim();
        assert.equal(version,manifest.nodeVersion);
        const imported=await execFile(node,['--input-type=module','-e','import * as decoder from "dji-log-parser-js"; if (!Object.keys(decoder).length) throw Error("Decoder unavailable"); console.log("decoder import ready");'],{cwd:options.cwd});
        assert.match(imported.stdout,/decoder import ready/);
      },
      deactivate:async()=>{deactivationCalls++;},
    });
    assert.equal(installed.status,'installed');assert.equal(activationCalls,1);assert.equal(deactivationCalls,0);
    const staged=await validatePayload(installed.release);assert.equal(staged.payloadId,manifest.payloadId);
    const inventory=JSON.parse(await readFile(join(installed.release,'licenses/inventory.json'),'utf8'));
    assert.equal(inventory.complete,true);assert.equal(inventory.unresolved.length,0);
    let sourceArchives=0;
    for(const crate of inventory.inventory.filter(c=>/MPL-2\.0/.test(c.license))){
      assert.ok(crate.correspondingSource);
      const bytes=await readFile(join(installed.release,'licenses',crate.correspondingSource));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),crate.checksum);sourceArchives++;
    }
    const files=await readdir(home);assert.deepEqual(files,['Library']);
    return {version:manifest.version,node:version,payloadFiles:manifest.files.length,noticeCrates:inventory.inventory.length,correspondingSourceArchives:sourceArchives,activation:'injected; no OS service registered',decoderImport:true,personalWorkspaceOpened:false,databaseOpened:false};
  }finally{await rm(scratch,{recursive:true,force:true});}
}

if(process.argv.length!==3)throw new Error('Usage: node dev/verify-macos-installer.mjs /absolute/payload/directory');
console.log(JSON.stringify(await verifyMacosInstaller(resolve(process.argv[2])),null,2));
