import { constants } from 'node:fs';
import { access, chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createServer as createNetServer } from 'node:net';
import { pathToFileURL } from 'node:url';

const execFile=promisify(execFileCallback);
const required=['node/bin/node','node/LICENSE','app/package.json','app/src/server.mjs','app/src/macos-service.mjs','app/src/macos-installer.mjs','app/LICENSE','app/THIRD_PARTY_NOTICES.md','app/node_modules/dji-log-parser-js/package.json','licenses/BUNDLED_NOTICES.md'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exists=async path=>{try{return await lstat(path);}catch(error){if(error.code==='ENOENT')return null;throw error;}};
const hasControl=value=>[...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127);
const safeRelative=path=>typeof path==='string'&&path.length<=500&&!path.startsWith('/')&&!path.includes('\\')&&!hasControl(path)&&path.split('/').every(part=>part&&part!=='.'&&part!=='..');
const allowed=path=>required.includes(path)||/^app\/(src|public|examples)\//.test(path)||path.startsWith('app/node_modules/dji-log-parser-js/')||path==='app/package-lock.json'||path.startsWith('licenses/');
function object(value,fields){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!fields.includes(key)))throw new Error('Invalid installer manifest.');
}
async function regularFile(path){
  const info=await lstat(path);
  if(info.isSymbolicLink())throw new Error('Installer inputs must not be symbolic links.');
  if(!info.isFile())throw new Error('A regular installer file is required.');
  return info;
}
async function tree(root,prefix='',listed=new Set()){
  const entries=[];
  for(const name of await readdir(join(root,prefix))){
    const relative=prefix?prefix+'/'+name:name;
    if(!safeRelative(relative))throw new Error('Invalid payload path.');
    const info=await lstat(join(root,relative));
    if(info.isSymbolicLink())throw new Error('Installer inputs must not be symbolic links.');
    if(info.isDirectory()){if(![...listed].some(path=>path.startsWith(relative+'/')))throw new Error('Unexpected or unlisted payload directory.');entries.push(...await tree(root,relative,listed));}
    else if(info.isFile())entries.push(relative);
    else throw new Error('Unexpected payload file type.');
    if(entries.length>10000)throw new Error('The installer payload contains too many files.');
  }
  return entries;
}

/** Verify local bundle integrity and its complete bounded allowlist before any user installation mutation. */
export async function validatePayload(payloadRoot){
  if(!isAbsolute(payloadRoot))throw new Error('Use an absolute installer payload path.');
  const info=await lstat(payloadRoot);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('A real installer payload directory is required.');
  const manifestInfo=await regularFile(join(payloadRoot,'manifest.json'));
  if(manifestInfo.size>2*1024*1024)throw new Error('Installer manifest is too large.');
  const raw=await readFile(join(payloadRoot,'manifest.json'));if(raw.length>2*1024*1024)throw new Error('Installer manifest is too large.');
  const manifest=JSON.parse(raw);
  object(manifest,['schema','application','version','platform','arch','nodeVersion','files']);
  if(manifest.schema!==1||manifest.application!=='FPVBench'||manifest.platform!=='darwin'||manifest.arch!=='arm64'||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version)||!/^v24\.\d+\.\d+$/.test(manifest.nodeVersion)||!Array.isArray(manifest.files)||manifest.files.length<required.length||manifest.files.length>10000)throw new Error('Unsupported installer manifest.');
  const seen=new Set();let size=0;
  for(const f of manifest.files){
    object(f,['path','size','sha256','executable']);
    if(!safeRelative(f.path)||!allowed(f.path)||seen.has(f.path)||!Number.isSafeInteger(f.size)||f.size<0||f.size>256*1024*1024||!/^[a-f0-9]{64}$/.test(f.sha256)||typeof f.executable!=='boolean'||f.executable!==(f.path==='node/bin/node'))throw new Error('Invalid or duplicate payload entry.');
    seen.add(f.path);size+=f.size;if(size>1024*1024*1024)throw new Error('Installer payload is too large.');
  }
  if(required.some(path=>!seen.has(path)))throw new Error('Installer payload is missing required files or notices.');
  const actual=await tree(payloadRoot,'',seen);if(actual.some(path=>path!=='manifest.json'&&!seen.has(path))||actual.length!==seen.size+1)throw new Error('Unexpected or unlisted payload files.');
  for(const f of manifest.files){
    const fileInfo=await regularFile(join(payloadRoot,f.path));if(fileInfo.size!==f.size)throw new Error('Installer payload size does not match.');
    if(hash(await readFile(join(payloadRoot,f.path)))!==f.sha256)throw new Error('Installer payload checksum does not match. Download or build a fresh copy.');
  }
  const pkg=JSON.parse(await readFile(join(payloadRoot,'app/package.json'),'utf8'));
  if(pkg.name!=='fpvbench'||pkg.version!==manifest.version||pkg.license!=='MIT')throw new Error('Application metadata does not match the installer.');
  const decoder=JSON.parse(await readFile(join(payloadRoot,'app/node_modules/dji-log-parser-js/package.json'),'utf8'));
  if(decoder.name!=='dji-log-parser-js'||decoder.version!=='0.5.7')throw new Error('Unexpected runtime dependency.');
  return {...manifest,payloadId:hash(raw).slice(0,16)};
}
async function safeAncestors(path){
  let current=resolve(path);
  while(current!==dirname(current)){
    const info=await exists(current);if(info?.isSymbolicLink())throw new Error('Installation paths must not use symbolic links.');
    if(info&&!info.isDirectory())throw new Error('An installation parent is not a directory.');
    current=dirname(current);
  }
}

async function availablePort(){
  return new Promise(resolve=>{
    const server=createNetServer();
    const timer=setTimeout(()=>{server.close();resolve(false);},1500);timer.unref();
    server.once('error',()=>{clearTimeout(timer);resolve(false);});
    server.listen(4173,'127.0.0.1',()=>server.close(()=>{clearTimeout(timer);resolve(true);}));
  });
}

/** Read-only preflight. Existing managed installations are reused and are never upgraded by this preview. */
export async function inspectInstallation({payloadRoot,home=homedir(),platform=process.platform,arch=process.arch,probePort=availablePort}={}){
  if(platform!=='darwin'||arch!=='arm64')throw new Error('This preview requires an Apple Silicon Mac.');
  if(!isAbsolute(home)||hasControl(home))throw new Error('Use an absolute user home path.');
  const manifest=await validatePayload(payloadRoot);
  const support=join(home,'Library','Application Support','FPVBench'),launcher=join(home,'Applications','FPVBench.app');
  await safeAncestors(support);await safeAncestors(dirname(launcher));
  const configPath=join(support,'launch-config.json'),configInfo=await exists(configPath);
  if(configInfo){
    await regularFile(configPath);
    const installed=JSON.parse(await readFile(configPath,'utf8'));
    if(installed.managedVersion!==1||![installed.root,installed.node,installed.dataDir].every(value=>typeof value==='string'&&isAbsolute(value))||!Number.isInteger(installed.port)||installed.port<1||installed.port>65535||typeof installed.login!=='boolean')throw new Error('The existing installation configuration is not recognized. Preserve it before repair.');
    const appInfo=await exists(launcher);
    if(!appInfo?.isDirectory()||appInfo.isSymbolicLink())throw new Error('The existing launcher ownership cannot be verified.');
    const marker=join(launcher,'Contents','.fpvbench-managed');await regularFile(marker);
    if((await readFile(marker,'utf8')).trim()!=='FPVBench launcher version 1')throw new Error('The existing launcher ownership cannot be verified.');
    return {status:'already-installed',launcher,version:manifest.version};
  }
  for(const path of [launcher,join(home,'Applications','FPVBench Controls'),join(home,'Library','LaunchAgents','local.fpvbench.server.plist'),join(home,'.fpvbench')]){
    if(await exists(path))throw new Error('An existing or unowned FPVBench launcher, workspace or service was found. This preview leaves it alone; use the documented update procedure.');
  }
  if(await exists(support)&& (await readdir(support)).length)throw new Error('Existing FPVBench support files were found. Preserve them before repair.');
  if(!await probePort())throw new Error('Port 4173 is already in use or unavailable. Stop the other local app before installing FPVBench. Nothing was installed.');
  return {status:'ready',launcher,version:manifest.version,support,manifest};
}

/** Explicit fresh install, with injectable activation for isolated operational and automated proofs. */
export async function installPayload(options={}){
  if(resolve(options.home??homedir())!==resolve(homedir())&&(typeof options.activate!=='function'||typeof options.deactivate!=='function'))throw new Error('Custom-home installation requires both lifecycle operations to be explicitly injected. Use inspect-only for a read-only check.');
  const check=await inspectInstallation(options);if(check.status==='already-installed')return check;
  const {payloadRoot,login=true,activate=execFile,deactivate=execFile}=options;
  if(typeof login!=='boolean')throw new Error('Choose whether to start at login.');
  const supportExisted=!!await exists(check.support);
  await mkdir(check.support,{recursive:true,mode:0o700});await chmod(check.support,0o700);
  const releases=join(check.support,'releases');await mkdir(releases,{mode:0o700});
  const staging=join(releases,'.install-'+randomUUID()),release=join(releases,check.version+'-'+check.manifest.payloadId);
  let activationStarted=false,renamed=false;
  try{
    await mkdir(staging,{mode:0o700});
    for(const f of check.manifest.files){
      const target=join(staging,f.path);await mkdir(dirname(target),{recursive:true,mode:0o700});
      await copyFile(join(payloadRoot,f.path),target,constants.COPYFILE_EXCL);await chmod(target,f.executable?0o700:0o600);
    }
    await copyFile(join(payloadRoot,'manifest.json'),join(staging,'manifest.json'),constants.COPYFILE_EXCL);await chmod(join(staging,'manifest.json'),0o600);
    await validatePayload(staging);await rename(staging,release);renamed=true;
    activationStarted=true;
    const node=join(release,'node/bin/node'),app=join(release,'app');
    await access(node,constants.X_OK);
    const environment={...process.env,FPVBENCH_DATA_DIR:join(options.home??homedir(),'.fpvbench'),PORT:'4173'};
    delete environment.NODE_OPTIONS;delete environment.NODE_PATH;
    await activate(node,[join(app,'src/macos-service.mjs'),'install',...(!login?['--no-login']:[])],{cwd:app,env:environment,timeout:120000,maxBuffer:1024*1024});
    return {status:'installed',launcher:check.launcher,version:check.version,release};
  }catch(error){
    if(activationStarted){
      let stopped=false;
      try {
        const configPath=join(check.support,'launch-config.json');
        const info=await regularFile(configPath);
        if(info.size>16384)throw new Error('Unexpected service config size.',{cause:error});
        const config=JSON.parse(await readFile(configPath,'utf8'));
        if(config.managedVersion===1&&config.root===join(release,'app')&&config.node===join(release,'node/bin/node')&&config.dataDir===join(options.home??homedir(),'.fpvbench')&&config.port===4173&&config.login===login){
          await deactivate(config.node,[join(config.root,'src/macos-service.mjs'),'stop'],{cwd:config.root,timeout:40000,maxBuffer:1024*1024});stopped=true;
        }
      }catch{/* Never stop an unknown installation; retained recovery details are the next step. */}
      await writeFile(join(check.support,'INSTALLATION-INCOMPLETE.txt'),'Installation could not finish. Preserve this folder and any workspace data. The installer retained its versioned payload for diagnosis. '+(stopped?'The newly registered service was stopped.':'No matching new service could be confirmed stopped; inspect the local service before retrying.')+' Open the source installation guide or contact the project maintainer before retrying.\n',{mode:0o600});
      throw new Error('FPVBench installation could not finish. Its files were retained for recovery; your existing workspace was not replaced.',{cause:error});
    }
    await rm(renamed?release:staging,{recursive:true,force:true});
    await rmdir(releases).catch(error=>{if(!['ENOENT','ENOTEMPTY'].includes(error.code))throw error;});
    if(!supportExisted)await rmdir(check.support).catch(error=>{if(!['ENOENT','ENOTEMPTY'].includes(error.code))throw error;});
    throw error;
  }
}

export async function runMacosInstaller(args=process.argv.slice(2)){
  const allowedFlags=new Set(['--payload','--check','--install','--no-login']);
  if(args.some((arg,i)=>!allowedFlags.has(arg)&&args[i-1]!=='--payload')||args.filter(arg=>arg==='--payload').length!==1||args.includes('--check')===args.includes('--install'))throw new Error('Use --payload ABSOLUTE_PATH with exactly one of --check or --install, and optional --no-login.');
  const index=args.indexOf('--payload'),payloadRoot=args[index+1];
  if(!payloadRoot||payloadRoot.startsWith('--'))throw new Error('An installer payload path is required.');
  const result=await (args.includes('--install')?installPayload({payloadRoot,login:!args.includes('--no-login')}):inspectInstallation({payloadRoot}));
  return Object.fromEntries(['status','launcher','version','release'].filter(key=>result[key]!==undefined).map(key=>[key,result[key]]));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  runMacosInstaller().then(value=>console.log(JSON.stringify(value)),error=>{console.log(JSON.stringify({status:'error',message:error.message}));process.exitCode=1;});
}
