import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { isProxy } from 'node:util/types';
import { check,ProjectError } from './errors.mjs';
import { canonicalJson,digest } from './security.mjs';
import { normalMediaBinding } from './normal-media.mjs';

const unsafe=condition=>check(condition,409,'unsafe_normal_media_path','Die gebundene Artdatei besitzt keinen unverknüpften sicheren lokalen Dateipfad.');
const unchanged=condition=>check(condition,409,'normal_media_changed','Die normale Artdatei oder ihre Quellenbindung wurde während des Lesens verändert. Das Original bleibt erhalten.');
const identity=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.mode===b.mode;
const sameFile=(a,b)=>identity(a,b)&&b.isFile()&&a.nlink===1n&&b.nlink===1n&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;

/** Node-only fixed-slot reader. No discovery, decoder, network, writes or renderer paths. */
export function createLocalNormalMediaReader({repoRoot}={}) {
  check(typeof repoRoot==='string'&&path.isAbsolute(repoRoot)&&!repoRoot.includes('\0')&&!/^(?:\\\\|\/\/)/.test(repoRoot),
    400,'unsafe_normal_media_path','Die Artdateien benötigen einen festen lokalen Programmordner.');
  const root=path.resolve(repoRoot);
  async function inspect(filename,prior) {
    const parts=filename.slice(path.parse(filename).root.length).split(path.sep).filter(Boolean),chain=[];
    let current=path.parse(filename).root;
    for(let index=-1;index<parts.length;index++) {
      if(index>=0)current=path.join(current,parts[index]);
      const stat=await fs.lstat(current,{bigint:true}),leaf=current===filename;
      unsafe(!stat.isSymbolicLink()&&(leaf?stat.isFile()&&stat.nlink===1n:stat.isDirectory()));
      unsafe(await fs.realpath(current)===current);
      if(prior)unchanged(prior[chain.length]?.filename===current&&identity(prior[chain.length].stat,stat));
      chain.push({filename:current,stat});
    }
    if(prior)unchanged(chain.length===prior.length&&sameFile(prior.at(-1).stat,chain.at(-1).stat));
    return chain;
  }
  return Object.freeze({async read(record,options={}) {
    check(options&&typeof options==='object'&&!isProxy(options)&&Object.getPrototypeOf(options)===Object.prototype
      &&Reflect.ownKeys(options).length===2&&Object.keys(options).every(key=>['projectId','slot'].includes(key))
      &&Object.values(Object.getOwnPropertyDescriptors(options)).every(item=>item.enumerable&&Object.hasOwn(item,'value')),
      400,'invalid_normal_media','Der lokale Leser benötigt ausschließlich Projektkennung und festen Dateislot.');
    const {projectId,slot}=options;
    const binding=normalMediaBinding(record,{projectId,slot});
    check(binding,409,'normal_media_not_bound','Für diese normale Artdatei ist kein positives gebundenes Original vorhanden.');
    const assetName=record.assets.assetName,sourceProof=canonicalJson({assetName,binding});
    unsafe(!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(assetName));
    const filename=path.join(root,'species-assets',assetName,slot),relative=path.relative(root,filename);
    unsafe(relative===path.join('species-assets',assetName,slot)&&!path.isAbsolute(relative)&&!relative.startsWith(`..${path.sep}`));
    let inspected=false,opened=false;
    try {
      const chain=await inspect(filename),leaf=chain.at(-1).stat;inspected=true;
      unchanged(leaf.size===BigInt(binding.asset.bytes));
      const handle=await fs.open(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0));opened=true;
      try {
        const before=await handle.stat({bigint:true});unchanged(sameFile(leaf,before));
        await inspect(filename,chain);
        const assertHandle=async()=>unchanged(sameFile(before,await handle.stat({bigint:true})));
        const buffer=Buffer.alloc(binding.asset.bytes);let offset=0;
        while(offset<buffer.length) {
          await assertHandle();const part=await handle.read(buffer,offset,buffer.length-offset,offset);
          unchanged(Number.isInteger(part.bytesRead)&&part.bytesRead>0&&part.bytesRead<=buffer.length-offset);offset+=part.bytesRead;
        }
        await assertHandle();const extra=await handle.read(Buffer.alloc(1),0,1,buffer.length);unchanged(extra.bytesRead===0);
        await assertHandle();await inspect(filename,chain);
        unchanged(digest(buffer)===binding.asset.sha256);
        let current;
        try{current=normalMediaBinding(record,{projectId,slot});}catch{unchanged(false);}
        unchanged(canonicalJson({assetName:record.assets.assetName,binding:current})===sourceProof);
        return {binding,buffer};
      }finally{await handle.close();}
    }catch(error) {
      if(error instanceof ProjectError)throw error;
      if(error?.code==='ENOENT')throw new ProjectError(409,inspected||opened?'normal_media_changed':'normal_media_not_local',
        inspected||opened?'Die gebundene Artdatei wurde während des Lesens entfernt oder ersetzt.':'Diese Artdatei ist auf diesem Gerät noch nicht lokal vorhanden.');
      if(['ELOOP','ENOTDIR'].includes(error?.code))throw new ProjectError(409,'unsafe_normal_media_path','Die gebundene Artdatei besitzt keinen unverknüpften sicheren lokalen Dateipfad.');
      throw new ProjectError(409,'normal_media_read_failed','Die gebundene lokale Artdatei konnte nicht sicher gelesen werden. Das Original bleibt erhalten.');
    }
  }});
}
