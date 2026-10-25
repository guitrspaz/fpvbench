import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, isAbsolute } from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
const execFile=promisify(execFileCallback);
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const inputs=JSON.parse(await readFile(new URL('./runtime-inputs.json',import.meta.url),'utf8'));

/** Download pinned bytes into a private cache; no downloaded script is executed. */
export async function pinnedDownload(url,sha256,cache,filename,maxBytes=160*1024*1024){
  if(!isAbsolute(cache)||!/^[a-f0-9]{64}$/.test(sha256)||!/^https:\/\/(nodejs\.org|raw\.githubusercontent\.com|static\.crates\.io)\//.test(url)||!/^[-a-zA-Z0-9_.+]+$/.test(filename))throw new Error('Invalid pinned download input.');
  await mkdir(cache,{recursive:true,mode:0o700});const path=join(cache,filename);
  let cached;try{cached=await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(cached){if(digest(cached)!==sha256)throw new Error('Cached input checksum mismatch: '+filename);return path;}
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw new Error('Cannot download pinned input '+filename+' ('+response.status+').');
  const parts=[];let size=0;for await(const part of response.body){size+=part.length;if(size>maxBytes)throw new Error('Pinned input exceeded its size bound.');parts.push(part);}
  const bytes=Buffer.concat(parts);if(digest(bytes)!==sha256)throw new Error('Downloaded input checksum mismatch: '+filename);
  await writeFile(path,bytes,{mode:0o600,flag:'wx'});return path;
}

/** Read only registry lock records. Source identity and checksums remain explicit. */
export function registryCrates(lock){
  return lock.split('[[package]]').slice(1).flatMap(section=>{
    const take=key=>new RegExp('^'+key+' = "([^"\\n]+)"','m').exec(section)?.[1];
    const name=take('name'),version=take('version'),source=take('source'),checksum=take('checksum');
    if(!source)return [];
    if(source!=='registry+https://github.com/rust-lang/crates.io-index'||!/^[-a-zA-Z0-9_]+$/.test(name??'')||!/^[-a-zA-Z0-9_.+]+$/.test(version??'')||!/^[a-f0-9]{64}$/.test(checksum??''))throw new Error('Unsupported Cargo source or missing checksum.');
    return [{name,version,checksum}];
  });
}
async function archiveText(archive,path){
  return (await execFile('/usr/bin/tar',['-xOf',archive,path],{maxBuffer:4*1024*1024})).stdout;
}

/** Preserve a conservative superset of decoder crate notices; unresolved inputs block distributable notice completion. */
export async function generateNotices({out,cache}){
  if(!isAbsolute(out)||!isAbsolute(cache))throw new Error('Use absolute notices and cache paths.');
  await mkdir(out,{recursive:true,mode:0o700});
  const lockPath=await pinnedDownload(inputs.decoder.cargoLockURL,inputs.decoder.cargoLockSha256,cache,'decoder-0.5.7-Cargo.lock',1024*1024);
  const crates=registryCrates(await readFile(lockPath,'utf8')),inventory=[],unresolved=[];
  let cursor=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(cursor<crates.length){
      const crate=crates[cursor++],id=crate.name+'-'+crate.version;
      const archive=await pinnedDownload('https://static.crates.io/crates/'+crate.name+'/'+id+'.crate',crate.checksum,cache,id+'.crate',64*1024*1024);
      const files=(await execFile('/usr/bin/tar',['-tzf',archive],{maxBuffer:8*1024*1024})).stdout.split('\n').filter(Boolean);
      if(files.some(path=>!path.startsWith(id+'/')||path.split('/').includes('..')||[...path].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127)))throw new Error('Unsafe crate archive paths: '+id);
      const metadata=await archiveText(archive,id+'/Cargo.toml');
      const packageBlock=(metadata.split(/^\[package\]\s*$/m)[1]??'').split(/^\[/m)[0];
      const licenseFile=/^license-file\s*=\s*"([^"\n]+)"/m.exec(packageBlock)?.[1]??null;
      const license=/^license\s*=\s*"([^"\n]+)"/m.exec(packageBlock)?.[1]??(licenseFile?'Source license-file: '+licenseFile:null);
      const licenseNames=files.filter(path=>/(^|\/)(LICENSE(?:[-_.][^/]*)?|LICENCE(?:[-_.][^/]*)?|COPYING(?:[-_.][^/]*)?|NOTICE(?:[-_.][^/]*)?)$/i.test(path));
      const retained=[];
      for(const name of licenseNames){
        let text;try{text=await archiveText(archive,name);}catch{continue;}
        if(!text.trim())continue;
        const outputName=id+'-'+String(retained.length+1)+'.txt';
        await writeFile(join(out,outputName),'Source: '+name+'\nCrate SHA256: '+crate.checksum+'\n\n'+text,{mode:0o600});
        retained.push({source:name,file:outputName,sha256:digest(text)});
      }
      const embedded=inputs.embeddedNoticeHeaders?.[id];
      if(!retained.length&&embedded){
        const source=await archiveText(archive,id+'/'+embedded);
        const header=/^(?:\/\/[^\n]*\n)+/.exec(source)?.[0]??'';
        if(/Copyright/i.test(header)&&/Redistribution/.test(header)&&/AS IS/.test(header)){
          const outputName=id+'-embedded-license.txt';
          await writeFile(join(out,outputName),'Source: '+id+'/'+embedded+' (leading license header)\nCrate SHA256: '+crate.checksum+'\n\n'+header,{mode:0o600});
          retained.push({source:id+'/'+embedded,file:outputName,sha256:digest(header)});
        }
      }
      for(const [index,supplement] of (inputs.supplementalNotices??[]).filter(n=>n.crates.includes(id)).entries()){
        const source=await pinnedDownload(supplement.url,supplement.sha256,cache,id+'-upstream-'+(index+1)+'.txt',1024*1024);
        const text=await readFile(source,'utf8'),outputName=id+'-upstream-'+(index+1)+'.txt';
        await writeFile(join(out,outputName),'Pinned upstream source: '+supplement.url+'\nSHA256: '+supplement.sha256+'\n\n'+text,{mode:0o600});
        retained.push({source:supplement.url,file:outputName,sha256:digest(text)});
      }
      if(!license||!retained.length)unresolved.push({crate:id,reason:!license?'No declared license in normalized Cargo metadata':'No license/notice text found in source archive or pinned supplements'});
      let correspondingSource=null;
      if (license && /MPL-2\.0/.test(license)) {
        await mkdir(join(out,'sources'),{recursive:true,mode:0o700});
        correspondingSource='sources/'+id+'.crate';
        await copyFile(archive,join(out,correspondingSource));
      }
      inventory.push({...crate,license,notices:retained,correspondingSource});
    }
  }));
  inventory.sort((a,b)=>(a.name+'-'+a.version).localeCompare(b.name+'-'+b.version));
  const heading='# Bundled component notices\n\nThis installer includes Node '+inputs.node.version+' (its full bundled LICENSE is node/LICENSE), FPVBench (app/LICENSE), and dji-log-parser-js '+inputs.decoder.version+' (app/THIRD_PARTY_NOTICES.md).\n\nThe decoder includes precompiled WebAssembly. The following inventory conservatively retains notices for every registry crate in its pinned upstream workspace Cargo.lock, including target/dev/build entries that may not be linked into the shipped Wasm. It is not a claim that every entry is shipped. Source commit: '+inputs.decoder.commit+'. Cargo.lock SHA256: '+inputs.decoder.cargoLockSha256+'. Each crate archive was checked against the lockfile checksum.\n\n';
  const rows=inventory.map(c=>'- '+c.name+' '+c.version+' — '+(c.license??'UNRESOLVED')+' — '+c.notices.map(n=>'['+n.file+']('+n.file+')').join(', ')+(c.correspondingSource?' — [unmodified source archive]('+c.correspondingSource+') (MPL-2.0 source form)':'')).join('\n');
  await writeFile(join(out,'BUNDLED_NOTICES.md'),heading+rows+'\n\nThe exact unmodified source archives for MPL-2.0 inventory components are included under sources/ next to this notice. Their source remains governed by MPL-2.0; its full license text is retained with the component notices. Crate checksums in inventory.json identify the original source bytes.\n\n'+(unresolved.length?'Unresolved notice inputs are recorded in inventory.json. This is not ready for public binary distribution.\n':'All inventory entries have declared licenses and retained source notice text, including embedded headers and pinned upstream workspace notices where crate archives omit them.\n'),{mode:0o600});
  await writeFile(join(out,'inventory.json'),JSON.stringify({schema:1,decoder:inputs.decoder,node:inputs.node,complete:unresolved.length===0,inventory,unresolved},null,2)+'\n',{mode:0o600});
  return {crates:inventory.length,complete:!unresolved.length,unresolved};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const outFlag=process.argv.indexOf('--out'),cacheFlag=process.argv.indexOf('--cache');
  if(outFlag<2||!process.argv[outFlag+1])throw new Error('Use --out ABSOLUTE_DIRECTORY and optional --cache ABSOLUTE_DIRECTORY.');
  const scratch=cacheFlag===-1?await mkdtemp('/private/tmp/fpvbench-notice-cache-'):null;
  try{console.log(JSON.stringify(await generateNotices({out:resolve(process.argv[outFlag+1]??''),cache:scratch??resolve(process.argv[cacheFlag+1])}),null,2));}
  finally{if(scratch)await rm(scratch,{recursive:true,force:true});}
}
