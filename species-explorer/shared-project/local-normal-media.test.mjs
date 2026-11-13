import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir,assertTestTempPath } from '../../scripts/test-temp.mjs';
import { digest } from './security.mjs';
import { createLocalNormalMediaReader } from './local-normal-media.mjs';

const projectId='local-normal-project',mimes={'portrait.webp':'image/webp','map.jpg':'image/jpeg','sound.mp3':'audio/mpeg','spectrogram.webp':'image/webp'};
const code=(...codes)=>error=>codes.includes(error.code);
async function writeWith(open,filename,bytes) {const handle=await open(filename,'w');try{await handle.writeFile(bytes);}finally{await handle.close();}}
// Deliberately synthetic byte records: decoding belongs to the existing media
// service. These cases qualify file access, identity and original-byte binding.
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(tmpdir(),'local-normal-'));
  const record={type:'fn-species-record',schemaVersion:1,id:'fixture-owl',input:{german:'Neuer Anzeigename',genus:'Strix',species:'fixture'},
    generated:{},taxonomyOverride:null,assessmentBinding:null,assets:{assetName:'Historischer Testkauz',files:{},overrides:{},credits:null,portraitMetadata:null},
    editorial:{websiteUrl:null,sections:[],gallery:[],generalSectionId:null,embeddedGeneralText:null}};
  const buffers=new Map();
  for(const [slot,mimeType] of Object.entries(mimes)) {
    const buffer=Buffer.from(`synthetic byte-exact local storage fixture: ${slot}`);buffers.set(slot,buffer);
    record.assets.files[slot]={id:`original-${slot}`,sha256:digest(buffer),bytes:buffer.length,mimeType};
  }
  const filename=slot=>path.join(root,'species-assets',record.assets.assetName,slot),reader=createLocalNormalMediaReader({repoRoot:root});
  t.after(()=>fs.rm(assertTestTempPath(root),{recursive:true,force:true,maxRetries:5,retryDelay:25}));
  return {root,record,buffers,reader,filename,
    async write(slot,buffer=buffers.get(slot)){await fs.mkdir(path.dirname(filename(slot)),{recursive:true});await fs.writeFile(filename(slot),buffer);return filename(slot);},
    read(slot='portrait.webp'){return reader.read(record,{projectId,slot});}};
}

test('four fixed slots read exact originals from the historic asset name, preserve metadata and never mutate their source',async t=>{
  const f=await fixture(t),before=structuredClone(f.record);
  for(const slot of Object.keys(mimes)) {
    await f.write(slot);const result=await f.read(slot),original=f.buffers.get(slot);
    assert.deepEqual(result.buffer,original);assert.equal(Buffer.isBuffer(result.buffer),true);
    assert.equal(result.binding.projectId,projectId);assert.equal(result.binding.speciesId,f.record.id);assert.equal(result.binding.slot,slot);
    assert.deepEqual(result.binding.asset,{...f.record.assets.files[slot],projectId,attribution:''});
    assert.equal(result.binding.asset.sha256,digest(original));assert.match(result.binding.contentId,/^normal-[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(result).sort(),['binding','buffer']);assert.equal(JSON.stringify(result.binding).includes(f.root),false);
    assert.deepEqual(await fs.readFile(f.filename(slot)),original);
  }
  assert.deepEqual(f.record,before);
});

test('missing local bytes, absent/zero bindings and invalid roots or slots fail before opening arbitrary paths',async t=>{
  const f=await fixture(t),opens=[];const open=fs.open.bind(fs);t.mock.method(fs,'open',(...args)=>{opens.push(args[0]);return open(...args);});
  await assert.rejects(f.read(),error=>error.code==='normal_media_not_local'&&!error.message.includes(f.root));
  await assert.rejects(f.reader.read(f.record,{projectId,slot:'portrait.webp',filename:'../outside'}),code('invalid_normal_media'));
  for(const slot of ['credits.json','../outside','https://example.org/portrait.webp'])await assert.rejects(f.read(slot),code('invalid_normal_media'));
  delete f.record.assets.files['portrait.webp'];await assert.rejects(f.read(),code('normal_media_not_bound'));
  f.record.assets.files['portrait.webp']={id:'missing',sha256:'a'.repeat(64),bytes:0,mimeType:'image/webp'};
  await assert.rejects(f.read(),code('normal_media_not_bound'));assert.equal(opens.length,0);
  for(const repoRoot of ['relative/root','\\\\server\\share','https://example.org/'])assert.throws(()=>createLocalNormalMediaReader({repoRoot}),code('unsafe_normal_media_path'));
});

test('unsafe bound folders and hardlinks are rejected before a file handle is opened',async t=>{
  const f=await fixture(t),file=await f.write('portrait.webp'),alias=path.join(f.root,'hardlink.webp');let opens=0;
  const open=fs.open.bind(fs);t.mock.method(fs,'open',(...args)=>{opens++;return open(...args);});
  await fs.link(file,alias);await assert.rejects(f.read(),code('unsafe_normal_media_path'));assert.equal(opens,0);await fs.unlink(alias);
  for(const assetName of ['../outside','..','CON','portrait.webp:stream']) {
    f.record.assets.assetName=assetName;await assert.rejects(f.read());
  }
  assert.equal(opens,0);
});

test('directory junctions/symlinks in the species path or the repository path are refused',async t=>{
  const f=await fixture(t),file=await f.write('portrait.webp'),directory=path.dirname(file),retained=path.join(f.root,'retained-original');
  await fs.rename(directory,retained);await fs.symlink(retained,directory,process.platform==='win32'?'junction':'dir');
  try{await assert.rejects(f.read(),code('unsafe_normal_media_path'));}finally{await fs.unlink(directory);await fs.rename(retained,directory);}
  const alias=path.join(f.root,'repository-alias');await fs.symlink(f.root,alias,process.platform==='win32'?'junction':'dir');
  try{await assert.rejects(createLocalNormalMediaReader({repoRoot:alias}).read(f.record,{projectId,slot:'portrait.webp'}),code('unsafe_normal_media_path'));}
  finally{await fs.unlink(alias);}
});

test('a final file symlink is refused without reading its target',async t=>{
  const f=await fixture(t),file=await f.write('portrait.webp'),target=path.join(f.root,'retained-target.webp');await fs.rename(file,target);
  try{await fs.symlink(target,file,'file');}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.skip('File symlink creation is unavailable to this test account.');return;}throw error;}
  try{await assert.rejects(f.read(),code('unsafe_normal_media_path'));assert.deepEqual(await fs.readFile(target),f.buffers.get('portrait.webp'));}
  finally{await fs.unlink(file);}
});

test('wrong original hashes, truncated files and extra bytes never return a partial or trimmed original',async t=>{
  const f=await fixture(t),original=f.buffers.get('portrait.webp');
  for(const bytes of [Buffer.alloc(original.length),original.subarray(0,-1),Buffer.concat([original,Buffer.from('extra')])]) {
    await f.write('portrait.webp',bytes);await assert.rejects(f.read(),code('normal_media_changed'));
    assert.deepEqual(await fs.readFile(f.filename('portrait.webp')),bytes);
  }
});

test('replacement between path validation and open closes the unexpected handle before any byte read',async t=>{
  const f=await fixture(t),file=await f.write('portrait.webp'),retained=path.join(f.root,'retained.webp'),open=fs.open.bind(fs);let reads=0,closes=0,swapped=false;
  t.mock.method(fs,'open',async(name,...options)=>{
    if(name===file&&!swapped){swapped=true;await fs.rename(file,retained);await writeWith(open,file,Buffer.alloc(f.buffers.get('portrait.webp').length,120));}
    const handle=await open(name,...options);if(name===file){const close=handle.close.bind(handle),read=handle.read.bind(handle);
      t.mock.method(handle,'read',(...args)=>{reads++;return read(...args);});t.mock.method(handle,'close',(...args)=>{closes++;return close(...args);});}return handle;
  });
  await assert.rejects(f.read(),code('normal_media_changed'));assert.equal(reads,0);assert.equal(closes,1);
  assert.deepEqual(await fs.readFile(retained),f.buffers.get('portrait.webp'));
});

test('ancestor replacement with identical bytes is still rejected before reading through the replacement handle',async t=>{
  const f=await fixture(t),file=await f.write('portrait.webp'),directory=path.dirname(file),retained=path.join(f.root,'retained-directory'),open=fs.open.bind(fs);let reads=0,closes=0,swapped=false;
  t.mock.method(fs,'open',async(name,...options)=>{
    if(name===file&&!swapped){swapped=true;await fs.rename(directory,retained);await fs.mkdir(directory);await writeWith(open,file,f.buffers.get('portrait.webp'));}
    const handle=await open(name,...options);if(name===file){const read=handle.read.bind(handle),close=handle.close.bind(handle);
      t.mock.method(handle,'read',(...args)=>{reads++;return read(...args);});t.mock.method(handle,'close',(...args)=>{closes++;return close(...args);});}return handle;
  });
  await assert.rejects(f.read(),code('normal_media_changed'));assert.equal(reads,0);assert.equal(closes,1);
  assert.deepEqual(await fs.readFile(path.join(retained,'portrait.webp')),f.buffers.get('portrait.webp'));
});

test('in-place writes, truncation and growth during a partial read are rejected and every accepted handle is closed',async t=>{
  for(const change of [bytes=>Buffer.alloc(bytes.length,120),bytes=>bytes.subarray(0,3),bytes=>Buffer.concat([bytes,Buffer.from('extra')])]) {
    const f=await fixture(t),file=await f.write('portrait.webp'),open=fs.open.bind(fs);let changed=false,closes=0;
    const mocked=t.mock.method(fs,'open',async(name,...options)=>{
      const handle=await open(name,...options);if(name===file){const read=handle.read.bind(handle),close=handle.close.bind(handle);
        t.mock.method(handle,'read',async(buffer,offset,length,position)=>{const result=await read(buffer,offset,Math.min(length,5),position);
          if(!changed){changed=true;await writeWith(open,file,change(f.buffers.get('portrait.webp')));}return result;});
        t.mock.method(handle,'close',(...args)=>{closes++;return close(...args);});}return handle;
    });
    await assert.rejects(f.read(),code('normal_media_changed'));assert.equal(closes,1);mocked.mock.restore();
  }
});

test('source metadata changes during IO cannot attach original bytes to a newer claimed normal binding',async t=>{
  const f=await fixture(t),file=await f.write('portrait.webp'),open=fs.open.bind(fs);let changed=false,closes=0;
  t.mock.method(fs,'open',async(name,...options)=>{const handle=await open(name,...options);
    if(name===file&&!changed){changed=true;f.record.assets.files['portrait.webp'].id='newer-original-identity';const close=handle.close.bind(handle);
      t.mock.method(handle,'close',(...args)=>{closes++;return close(...args);});}return handle;});
  await assert.rejects(f.read(),code('normal_media_changed'));assert.equal(closes,1);
});

test('uncertain permission/read failures do not leak paths, become a missing-file fallback or leave open handles',async t=>{
  const f=await fixture(t),file=await f.write('portrait.webp'),open=fs.open.bind(fs);let closes=0;
  t.mock.method(fs,'open',async(name,...options)=>{if(name===file)throw Object.assign(new Error(`private ${file}`),{code:'EACCES'});return open(name,...options);});
  await assert.rejects(f.read(),error=>error.code==='normal_media_read_failed'&&!error.message.includes(f.root));t.mock.restoreAll();
  t.mock.method(fs,'open',async(name,...options)=>{const handle=await open(name,...options);if(name===file){const close=handle.close.bind(handle);
    t.mock.method(handle,'read',async()=>{throw Object.assign(new Error(`private ${file}`),{code:'EIO'});});
    t.mock.method(handle,'close',(...args)=>{closes++;return close(...args);});}return handle;});
  await assert.rejects(f.read(),error=>error.code==='normal_media_read_failed'&&!error.message.includes(f.root));assert.equal(closes,1);
});

test('bound audio/mpeg bytes may exceed the image budget while out-of-budget declarations fail before filesystem opening',async t=>{
  const f=await fixture(t),bytes=Buffer.alloc(20*1024*1024+1,77),asset=f.record.assets.files['sound.mp3'];asset.bytes=bytes.length;asset.sha256=digest(bytes);
  await f.write('sound.mp3',bytes);assert.deepEqual((await f.read('sound.mp3')).buffer,bytes);
  let opens=0;const open=fs.open.bind(fs);t.mock.method(fs,'open',(...args)=>{opens++;return open(...args);});
  f.record.assets.files['portrait.webp'].bytes=20*1024*1024+1;await assert.rejects(f.read(),code('normal_media_too_large'));
  asset.bytes=50*1024*1024+1;await assert.rejects(f.read('sound.mp3'),code('normal_media_too_large'));assert.equal(opens,0);
});
