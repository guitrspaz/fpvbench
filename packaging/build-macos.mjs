import { access, chmod, copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateNotices, inputs, pinnedDownload } from './bundled-notices.mjs';
import { validatePayload } from '../src/macos-installer.mjs';
const execFile=promisify(execFileCallback);
const rootDefault=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const safeAbsolute=value=>typeof value==='string'&&isAbsolute(value)&&![...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127);

async function canonicalDirectory(path){
  const missing=[];let cursor=resolve(path);
  for(;;){
    try{
      const canonical=await realpath(cursor);
      if(!(await lstat(canonical)).isDirectory())throw new Error('Build paths must name directories.');
      return join(canonical,...missing);
    }catch(error){
      if(error.code!=='ENOENT')throw error;
      if(cursor===dirname(cursor))throw error;
      missing.unshift(basename(cursor));cursor=dirname(cursor);
    }
  }
}

/** Build outputs and caches must stay outside source, including through directory aliases. */
export async function validateBuildLocations({out,cache,root=rootDefault}){
  if(!safeAbsolute(out)||!safeAbsolute(cache)||!safeAbsolute(root))throw new Error('Use absolute build, cache and source paths.');
  const [source,output,downloadCache]=await Promise.all([canonicalDirectory(root),canonicalDirectory(out),canonicalDirectory(cache)]);
  if([output,downloadCache].some(path=>path===source||path.startsWith(source+sep)))throw new Error('Installer output and cache must be outside the source root to avoid recursive copying.');
  return {root:source,out:output,cache:downloadCache};
}

async function copyRegularTree(source,target){
  const info=await lstat(source);if(info.isSymbolicLink())throw new Error('Source allowlist must not contain symlinks.');
  if(info.isDirectory()){
    await mkdir(target,{recursive:true,mode:0o700});
    for(const name of await readdir(source)){if(name==='.DS_Store')continue;await copyRegularTree(join(source,name),join(target,name));}
  }else if(info.isFile()){await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(source,target);await chmod(target,0o600);}
  else throw new Error('Unsupported source file type.');
}
async function listFiles(root,prefix=''){
  const entries=[];for(const name of await readdir(join(root,prefix))){
    const path=prefix?prefix+'/'+name:name,info=await lstat(join(root,path));
    if(info.isSymbolicLink())throw new Error('Payload contains a symlink.');
    if(info.isDirectory())entries.push(...await listFiles(root,path));
    else if(info.isFile())entries.push(path);
    else throw new Error('Payload contains a special file.');
  }return entries.sort();
}

/** Maintainer-only builder: official pinned runtime, complete notices, production allowlist and local preview archive. */
export async function buildMacosInstaller({out,cache,root=rootDefault}){
  ({out,cache,root}=await validateBuildLocations({out,cache,root}));
  if(process.platform!=='darwin'||process.arch!=='arm64')throw new Error('Build this preview on an Apple Silicon Mac.');
  const native=join(root,'packaging','installer-main.m');await access(native);
  await mkdir(out,{recursive:true,mode:0o700});await mkdir(cache,{recursive:true,mode:0o700});
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  if(pkg.license!=='MIT'||!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/.test(pkg.version))throw new Error('Build requires approved MIT source and a safe version.');
  const name='Install FPVBench.app',destination=join(out,name),archive=join(out,'FPVBench-'+pkg.version+'-macOS-arm64-preview.zip');
  for(const path of [destination,archive]){try{await lstat(path);throw new Error('Output already exists; choose a new output folder.');}catch(error){if(error.code!=='ENOENT')throw error;}}
  const scratch=await mkdtemp(join(out,'.build-'));
  try{
    const bundle=join(scratch,name),resources=join(bundle,'Contents','Resources'),payload=join(resources,'payload'),app=join(payload,'app');
    await mkdir(join(bundle,'Contents','MacOS'),{recursive:true,mode:0o700});await mkdir(app,{recursive:true,mode:0o700});
    const runtimeArchive=await pinnedDownload(inputs.node.url,inputs.node.sha256,cache,inputs.node.filename);
    const runtimeStage=join(scratch,'runtime');await mkdir(runtimeStage,{mode:0o700});
    const nodeFolder='node-'+inputs.node.version+'-darwin-arm64';
    await execFile('/usr/bin/tar',['-xzf',runtimeArchive,'-C',runtimeStage,nodeFolder+'/bin/node',nodeFolder+'/LICENSE']);
    await mkdir(join(payload,'node','bin'),{recursive:true,mode:0o700});
    await copyFile(join(runtimeStage,nodeFolder,'bin/node'),join(payload,'node/bin/node'));await chmod(join(payload,'node/bin/node'),0o700);
    await copyFile(join(runtimeStage,nodeFolder,'LICENSE'),join(payload,'node/LICENSE'));
    const node=join(payload,'node/bin/node');
    if((await execFile(node,['--version'])).stdout.trim()!==inputs.node.version)throw new Error('Bundled runtime version mismatch.');
    for(const name of ['src','public','examples','package.json','package-lock.json','LICENSE','THIRD_PARTY_NOTICES.md'])await copyRegularTree(join(root,name),join(app,name));
    const dependencyRoot=join(scratch,'production-dependencies');await mkdir(dependencyRoot);
    for(const name of ['package.json','package-lock.json'])await copyFile(join(root,name),join(dependencyRoot,name));
    await execFile('npm',['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund','--cache',join(cache,'npm')],{cwd:dependencyRoot,timeout:120000,maxBuffer:2*1024*1024});
    const entries=(await readdir(join(dependencyRoot,'node_modules'))).filter(name=>name!=='.package-lock.json');
    if(entries.length!==1||entries[0]!=='dji-log-parser-js')throw new Error('Production dependency inventory changed; review the payload allowlist and bundled notices.');
    await copyRegularTree(join(dependencyRoot,'node_modules','dji-log-parser-js'),join(app,'node_modules','dji-log-parser-js'));
    const notices=await generateNotices({out:join(payload,'licenses'),cache});
    if(!notices.complete)throw new Error('Bundled notice inventory has unresolved entries. See the generated notices and review before binary distribution.');
    const files=[];
    for(const path of await listFiles(payload)){
      const bytes=await readFile(join(payload,path));files.push({path,size:bytes.length,sha256:digest(bytes),executable:path==='node/bin/node'});
    }
    const manifest={schema:1,application:'FPVBench',version:pkg.version,platform:'darwin',arch:'arm64',nodeVersion:inputs.node.version,files};
    await writeFile(join(payload,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});await validatePayload(payload);
    const executable=join(bundle,'Contents','MacOS','InstallFPVBench');
    await execFile('/usr/bin/xcrun',['clang','-fobjc-arc','-arch','arm64','-mmacosx-version-min=14.0','-framework','Cocoa',native,'-o',executable],{timeout:120000,maxBuffer:2*1024*1024});
    await chmod(executable,0o700);
    const plist='<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>InstallFPVBench</string><key>CFBundleIdentifier</key><string>local.fpvbench.installer</string><key>CFBundleName</key><string>Install FPVBench</string><key>CFBundleDisplayName</key><string>Install FPVBench</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleShortVersionString</key><string>'+xml(pkg.version.split('-')[0])+'</string><key>CFBundleVersion</key><string>'+xml(pkg.version.split('-')[0])+'</string><key>LSMinimumSystemVersion</key><string>14.0</string><key>NSHighResolutionCapable</key><true/></dict></plist>\n';
    await writeFile(join(bundle,'Contents','Info.plist'),plist);
    let commit=null,dirty=null;try{commit=(await execFile('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();dirty=!!(await execFile('git',['status','--porcelain'],{cwd:root})).stdout;}catch{/* Source archives may not carry Git metadata. */}
    const provenance={schema:1,application:'FPVBench',version:pkg.version,sourceCommit:commit,workingTreeDirty:dirty,payloadManifestSha256:digest(await readFile(join(payload,'manifest.json'))),runtime:inputs.node,decoder:inputs.decoder,noticeCrates:notices.crates,signing:'ad-hoc local preview only',notarized:false,minimumMacOS:'14.0',architecture:'arm64'};
    await writeFile(join(resources,'source-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
    await writeFile(join(resources,'PREVIEW-NOTICE.txt'),'FPVBench local installer preview\n\nThis Apple Silicon build is ad-hoc signed for local testing. It is not Developer-ID signed or notarized and is not a public download release. Do not disable Gatekeeper or remove quarantine attributes. Existing FPVBench installations are reused, not upgraded. macOS 14 or newer is required.\n');
    await execFile('/usr/bin/plutil',['-lint',join(bundle,'Contents','Info.plist')]);
    await execFile('/usr/bin/codesign',['--force','--sign','-',bundle],{timeout:120000,maxBuffer:2*1024*1024});
    await execFile('/usr/bin/codesign',['--verify','--deep','--strict',bundle],{timeout:120000,maxBuffer:2*1024*1024});
    await rename(bundle,destination);
    await execFile('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',destination,archive],{timeout:120000,maxBuffer:2*1024*1024});
    const checksum=digest(await readFile(archive));
    await writeFile(archive+'.sha256',checksum+'  '+archive.split('/').at(-1)+'\n');
    await cp(join(destination,'Contents/Resources/source-provenance.json'),join(out,'source-provenance.json'));
    return {app:destination,archive,sha256:checksum,version:pkg.version,notarized:false,signing:'ad-hoc',noticeCrates:notices.crates};
  }finally{await rm(scratch,{recursive:true,force:true});}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),out=args.indexOf('--out'),cache=args.indexOf('--cache');
  if(out===-1||!args[out+1]||args.some((arg,index)=>!['--out','--cache'].includes(arg)&&!['--out','--cache'].includes(args[index-1])))throw new Error('Use --out ABSOLUTE_DIRECTORY and optional --cache ABSOLUTE_DIRECTORY.');
  console.log(JSON.stringify(await buildMacosInstaller({out:resolve(args[out+1]),cache:cache===-1?join(resolve(args[out+1]),'.download-cache'):resolve(args[cache+1])}),null,2));
}
