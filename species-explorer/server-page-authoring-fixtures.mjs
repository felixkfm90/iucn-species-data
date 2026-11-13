import assert from 'node:assert/strict';
import { readFile,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExplorerServer } from './server.mjs';
import { createMemoryCredentialStore } from './shared-project/client.mjs';
import { fixture as createProjectFixture } from './shared-project/test-fixtures.mjs';
import { createSharedProjectHttp } from './shared-project/http.mjs';
import { createExplorerPageAuthorities } from './page-authoring/explorer-authorities.mjs';
import { sha256 } from './page-authoring/contract.mjs';
import { assertTestTempPath } from '../scripts/test-temp.mjs';
import { validateImageDecode } from '../scripts/image-validation.mjs';
import { resolveFfmpegPath } from '../scripts/spectrogram-renderer.mjs';
import { createEditableFixture,createTestJpeg,createTestWebp,createTestPng,serverFixtureStoragePaths,
  withServerFixtureStorageEnvironment } from './server-test-fixtures.mjs';

const PUBLIC='https://felixkfm90.github.io/iucn-species-data/';
const WORKSPACE_ROOT=fileURLToPath(new URL('../',import.meta.url));
async function json(response,status,code) {
  const value=await response.json();
  assert.equal(response.status,status,JSON.stringify({code:value.code,error:value.error}));
  if(code!==undefined)assert.equal(value.code,code);
  return value;
}

// Creates files, decoder work and servers only when explicitly called.
export async function createPageAuthoringExplorerFixture(t,{localAiOptions=null,websiteAltTextsService=null,
  mediaFactory=null,imageDecode:providedDecode=null,publicRuntimeAvailable=true,normalSlots=null,cmsAdapter=null}={}) {
  const project=createProjectFixture();let repoRoot,remote,server,authorities,closedAuthorities=0,offline=false,uncertainChanges=false;
  t.after(async()=>{
    let failure;
    for(const close of [()=>server?.close(),()=>authorities&&!authorities.blockingState().closed?authorities.close():undefined,()=>remote?.close()]) {
      try{await close();}catch(error){failure??=error;}
    }
    try{project.cleanup();}catch(error){failure??=error;}
    if(repoRoot)try{await rm(assertTestTempPath(repoRoot),{recursive:true,force:true,maxRetries:8,retryDelay:80});}catch(error){failure??=error;}
    if(failure)throw failure;
  });
  repoRoot=await createEditableFixture();
  const ffmpegPath=providedDecode?null:resolveFfmpegPath({repoRoot:WORKSPACE_ROOT}),decodeCalls=[];
  const imageDecode=(bytes,options={})=>{decodeCalls.push({format:options.format,repoRoot:options.repoRoot});
    return providedDecode?providedDecode(bytes,options):validateImageDecode(bytes,{...options,ffmpegPath});};
  const {store,a,b}=await project.initialized({imageDecode});
  const {portrait,map,spectrogram,photo}=mediaFactory?await mediaFactory():
    {portrait:createTestWebp(7),map:createTestJpeg(12,8),spectrogram:createTestWebp(9),photo:createTestPng(14,10)};
  await Promise.all([writeFile(join(repoRoot,'species-assets','Amsel','portrait.webp'),portrait),
    writeFile(join(repoRoot,'species-assets','Amsel','map.jpg'),map),
    writeFile(join(repoRoot,'species-assets','Amsel','spectrogram.webp'),spectrogram),
    writeFile(join(repoRoot,'species-assets-overrides.json'),JSON.stringify({version:1,assets:{Amsel:{map:{protectFromPipeline:true,reason:'Synthetic protected fixture'}}}}),{flag:'wx'})]);
  const [input]=JSON.parse(await readFile(join(repoRoot,'species_list.json'),'utf8'));
  const [generated]=JSON.parse(await readFile(join(repoRoot,'speciesData.json'),'utf8'));
  const assetName='Amsel',files={};
  for(const [filename,mimeType]of [['portrait.webp','image/webp'],['map.jpg','image/jpeg'],['sound.mp3','audio/mpeg'],
    ['spectrogram.webp','image/webp'],['credits.json','application/json']]) {
    const bytes=await readFile(join(repoRoot,'species-assets',assetName,filename));
    files[filename]={id:`normal-amsel-${filename.replace('.','-')}`,sha256:sha256(bytes),bytes:bytes.length,mimeType};
  }
  if(normalSlots)for(const filename of Object.keys(files))if(!normalSlots.includes(filename))delete files[filename];
  const record={type:'fn-species-record',schemaVersion:1,id:generated.URLSlug,
    input:{...input,privateInputSentinel:'private original input'},generated:{...generated,privateGeneratedSentinel:'private original generated record'},
    taxonomyOverride:null,assessmentBinding:{id:generated['Assessment ID']},
    assets:{assetName,files,overrides:{map:{protectFromPipeline:true,source:'Eigene synthetische Karte'}},
      credits:JSON.parse(await readFile(join(repoRoot,'species-assets',assetName,'credits.json'),'utf8')),
      portraitMetadata:{type:'Foto',source:'Synthetisches Prüfbild',privatePrompt:'private original prompt'}},
    editorial:{websiteUrl:null,sections:[],gallery:[],generalSectionId:null,embeddedGeneralText:null}};
  store.createObject(a.token,{kind:'species',id:record.id,data:record});
  const originalFiles=['species_list.json','speciesData.json','fehlende_elemente_report.json','species-assets-overrides.json','docs/manual-map-overrides.md',
    ...Object.keys(files).map(filename=>`species-assets/${assetName}/${filename}`)];
  const originalBytes=await Promise.all(originalFiles.map(filename=>readFile(join(repoRoot,filename))));
  const publicFiles=new Map([
    [`${PUBLIC}speciesData.json`,{bytes:await readFile(join(repoRoot,'speciesData.json')),mimeType:'application/json'}],
    [`${PUBLIC}species-assets/${assetName}/portrait.webp`,{bytes:portrait,mimeType:'image/webp'}],
    [`${PUBLIC}species-assets/${assetName}/map.jpg`,{bytes:map,mimeType:'image/jpeg'}],
  ]),publicRequests=[];
  remote=createSharedProjectHttp({store});const address=await remote.listen();
  const profileRoot=join(repoRoot,'personal-fixture'),authoringFile=join(profileRoot,'page-authoring.sqlite');
  const credentialStore=createMemoryCredentialStore(),projectRequests=[];
  async function start() {
    const realAuthorities=createExplorerPageAuthorities({repoRoot,imageDecode,fetchImpl:async(url,options)=>{
      const href=String(url),file=publicFiles.get(href);publicRequests.push({url:href,options});
      assert.ok(file,`Only the fixed synthetic public FN sources are permitted: ${href}`);
      assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
      assert.equal(Object.keys(options.headers).some(key=>/authorization|cookie/i.test(key)),false);
      if(offline)throw new Error('Synthetic public connection unavailable');
      if(!publicRuntimeAvailable&&href===`${PUBLIC}speciesData.json`)return new Response('{}',{status:404,headers:{'Content-Type':'application/json'}});
      return new Response(file.bytes,{status:200,headers:{'Content-Type':file.mimeType,'Content-Length':String(file.bytes.length)}});
    }});
    authorities={...realAuthorities,async close(){closedAuthorities++;return realAuthorities.close();}};
    server=await withServerFixtureStorageEnvironment(repoRoot,()=>createExplorerServer({repoRoot,...serverFixtureStoragePaths(repoRoot),port:0,
      nasBackupRoot:join(repoRoot,'unused-fixture-backups'),
      websitePagesService:{snapshot:async()=>({pages:[]})},
      websiteAltTextsService:websiteAltTextsService||{snapshot:async()=>({pages:[],scan:{running:false},transfer:{running:false}}),close:async()=>{}},
      websiteAltTransferAdapter:cmsAdapter,
      sharedProjectOptions:{filename:join(profileRoot,'project-cache.sqlite'),localStorageConfirmed:true,allowLoopbackHttp:true,credentialStore,
        fetchImpl:async (url,options)=>{projectRequests.push({url,method:options.method});
          if(offline||uncertainChanges&&options.method==='POST'&&new URL(url).pathname.endsWith('/changes'))throw new Error('Synthetic project connection unavailable');
          return fetch(url,options);},
        imageDecode,imageDecodeOptions:{repoRoot}},
      pageAuthoringOptions:{filename:authoringFile,localStorageConfirmed:true,authorities},
      localAiOptions:typeof localAiOptions==='function'?localAiOptions({repoRoot,profileRoot}):localAiOptions}));
    const listening=await server.listen(),base=`http://127.0.0.1:${listening.port}`;
    const {token}=await json(await fetch(`${base}/api/session`),200);
    const post=(path,payload={},extra={})=>fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json',
      'X-Species-Explorer-Session':token,Origin:base,...extra},body:JSON.stringify(payload)});
    return {server,base,post};
  }
  const first=await start();
  return {...first,repoRoot,store,a,b,project,address,photo,record,publicRequests,projectRequests,decodeCalls,originalFiles,originalBytes,authoringFile,
    setOffline(value){offline=value;},setChangeRequestsUncertain(value){uncertainChanges=value;},async restart(){await server.close();return start();},
    authorityCloseCount:()=>closedAuthorities};
}
