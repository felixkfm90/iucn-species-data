import { isProxy } from 'node:util/types';
import { PageAuthoringError,identifier,text,escapeHtml } from './contract.mjs';
import { normalizeBlocks,normalizeDocument,normalizeSpeciesSnapshot,normalizeAssetMetadata,editableDocument,emptySectionHash,hasContent,NORMAL_ASSET_FILES } from './model.mjs';
import { getPageTemplate } from './templates.mjs';
import { canonicalJson,digest } from '../shared-project/security.mjs';

const MiB=1024*1024,MAX_IMAGES=200,MAX_BLOCKS=1000;
const DOC_KEYS=['schemaVersion','templateId','templateHash','slug','parentPath','title','introduction','sections','images','sources','galleryRequested','emptyConfirmations','species'];
const STRUCTURE_KEYS=['schemaVersion','templateId','templateHash','title','path','siteShell','runtimeScripts','normalAssets','normalAssetBindings','slots','intendedCmsState','publish'];
const invalid=condition=>{if(!condition)throw new PageAuthoringError(400,'cms_readback_invalid','Die CMS-Lesebeobachtung besitzt ein ungültiges oder unvollständiges Format.');};
const match=condition=>{if(!condition)throw new PageAuthoringError(409,'cms_readback_mismatch','Die beobachtete CMS-Fassung oder Bildzuordnung stimmt nicht exakt mit dem freigegebenen Auftrag überein.');};
const size=condition=>{if(!condition)throw new PageAuthoringError(413,'cms_readback_too_large','Die CMS-Lesebeobachtung überschreitet ihren begrenzten Prüfumfang.');};
const lf=value=>value.replace(/\r\n?/g,'\n');
const json=value=>canonicalJson(value,{maxBytes:8*MiB,maxNodes:300000});
const equal=(a,b)=>json(a)===json(b);
function exact(value,keys) {invalid(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)));}

// Inspect descriptors before reading any object value or making a JSON copy.
// Byte/node/depth budgets apply to this one proof scope, never to arbitrary data.
function pure(raw,maxBytes,maxNodes=300000) {
  let bytes=0,nodes=0;const ancestors=new Set();
  function add(count){bytes+=count;size(bytes<=maxBytes);}
  function walk(value,depth) {
    size(depth<=32&&++nodes<=maxNodes);
    if(value===null||typeof value==='boolean'){add(value===null?4:value?4:5);return value;}
    if(typeof value==='string'){size(value.length<=maxBytes);add(Buffer.byteLength(JSON.stringify(value)));return value;}
    if(typeof value==='number'){invalid(Number.isFinite(value));add(JSON.stringify(value).length);return value;}
    invalid(value&&typeof value==='object'&&!isProxy(value));invalid(!ancestors.has(value));
    const array=Array.isArray(value);invalid(Object.getPrototypeOf(value)===(array?Array.prototype:Object.prototype));
    if(array)size(value.length<=maxNodes-nodes);
    const keys=Reflect.ownKeys(value);size(keys.length<=maxNodes-nodes+1);ancestors.add(value);add(2);
    const result=array?[]:{};let count=0;
    if(array)invalid(keys.length===value.length+1);
    for(const key of keys) {
      const descriptor=Object.getOwnPropertyDescriptor(value,key);
      if(array&&key==='length')continue;
      invalid(typeof key==='string'&&!['__proto__','prototype','constructor'].includes(key)&&descriptor.enumerable&&Object.hasOwn(descriptor,'value'));
      if(array)invalid(/^(?:0|[1-9][0-9]*)$/.test(key)&&Number(key)<value.length);
      else add(Buffer.byteLength(JSON.stringify(key))+1);
      if(count++)add(1);result[key]=walk(descriptor.value,depth+1);
    }
    ancestors.delete(value);return result;
  }
  return walk(raw,0);
}
function model(work) {try{return work();}catch(error){if(error instanceof PageAuthoringError&&error.code?.startsWith('cms_readback_'))throw error;
  if(error?.code==='document_too_large')size(false);invalid(false);}}
function string(value,max,empty=true) {invalid(typeof value==='string');const normalized=lf(value);invalid(normalized.length<=max&&(empty||normalized.trim())
  &&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized));return normalized;}
function id(value){return model(()=>identifier(value));}
function path(value){invalid(typeof value==='string'&&/^\/wildlife\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)&&value.length<=500);return value;}
function observedPath(value){invalid(typeof value==='string'&&value.length<=2048&&value.startsWith('/')&&!value.startsWith('//')&&!/[\\?#\u0000-\u0020\u007f]/u.test(value));return value;}
function lines(value) {if(typeof value==='string')return lf(value);if(Array.isArray(value))return value.map(lines);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,lines(item)]));return value;}
function ast(raw) {const normalized=lines(raw),checked=model(()=>normalizeBlocks(normalized));invalid(equal(checked,normalized));return checked;}
function document(raw) {
  const value=pure(raw,2*MiB,200000);
  return model(()=>{
    exact(value,DOC_KEYS);invalid(value.schemaVersion===1&&value.species?.slug===value.slug);
    const projectId=Object.values(value.species.normalAssets).find(Boolean)?.projectId||value.images[0]?.asset?.projectId||'unbound-project';
    const species=normalizeSpeciesSnapshot(value.species,projectId,value.slug),normalized=normalizeDocument(editableDocument(value),{species,previous:value});
    normalized.images=value.images.map((image,index)=>{exact(image,['id','assetId','alt','caption','decorative','asset']);const asset=normalizeAssetMetadata(image.asset,projectId);
      invalid(asset.id===image.assetId&&['image/jpeg','image/png','image/webp'].includes(asset.mimeType));return {...normalized.images[index],asset};});
    invalid(equal(normalized,value));
    for(const [sectionId,confirmation] of Object.entries(value.emptyConfirmations)) {
      exact(confirmation,['sectionHash','actorId','confirmedAt','reason']);const section=value.sections.find(item=>item.id===sectionId);
      invalid(section&&!hasContent(section.blocks)&&confirmation.sectionHash===emptySectionHash(section));identifier(confirmation.actorId);text(confirmation.confirmedAt,80);text(confirmation.reason,1000);
    }
    return value;
  });
}
function html(blocks) {return blocks.map(block=>block.type==='paragraph'?`<p>${escapeHtml(block.text).replaceAll('\n','<br>')}</p>`
  :block.type==='heading'?`<h${block.level}>${escapeHtml(block.text)}</h${block.level}>`
    :`<${block.type==='bullet-list'?'ul':'ol'}>${block.items.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</${block.type==='bullet-list'?'ul':'ol'}>`).join('\n');}

/** Rebuild the compose slots independently; private plan values never become editor observations. */
function reconstruct(value) {
  const template=getPageTemplate(value.templateId),slots=[],blocks=[];
  const push=(slot,visible)=>{slots.push(slot);blocks.push(visible);};
  const heading=(level,text,sectionId)=>push({type:'heading',level,text,...(sectionId===undefined?{}:{sectionId})},{type:'heading',level,text:lf(text)});
  const rich=(items,sectionId)=>push({type:'richtext',html:html(items),...(sectionId===undefined?{}:{sectionId})},{type:'richtext',blocks:ast(items)});
  const source=(item,sectionId)=>push({type:'source',source:{...item},...(sectionId===undefined?{}:{sectionId})},{type:'source',text:lf(item.label+(item.url?` · ${item.url}`:''))});
  const code=(text,module)=>push({type:'code',code:text,executeInPreview:false,module},{type:'code',code:lf(text)});
  heading(3,value.title);if(hasContent(value.introduction))rich(value.introduction);
  for(const section of value.sections) {
    heading(4,section.title,section.id);
    if(section.kind==='general-module')code(template.speciesCode,'existing-fn-species');
    if(hasContent(section.blocks))rich(section.blocks,section.id);
    if(section.kind==='map-module')code(template.mapCode,'existing-fn-map');
    for(const item of section.sources)source(item,section.id);
  }
  push({type:'gallery',items:value.images.map((image,order)=>({id:image.id,assetId:image.assetId,sha256:image.asset.sha256,bytes:image.asset.bytes,mimeType:image.asset.mimeType,
    alt:image.alt,caption:image.caption,decorative:image.decorative,order,attribution:image.asset.attribution}))},
  {type:'gallery',items:value.images.map(image=>({alt:lf(image.alt),caption:lf(image.caption),decorative:image.decorative,attribution:lf(image.asset.attribution)}))});
  for(const item of value.sources)source(item);
  const path=`${value.parentPath}/${value.slug}`,base=`https://felixkfm90.github.io/iucn-species-data/species-assets/${encodeURIComponent(value.species.assetName)}`;
  return {structure:{schemaVersion:1,templateId:template.id,templateHash:template.templateHash,title:value.title,path,siteShell:template.siteShell,runtimeScripts:template.runtimeScripts,
    normalAssets:Object.fromEntries(Object.entries(NORMAL_ASSET_FILES).map(([role,file])=>[role,`${base}/${file}`])),normalAssetBindings:value.species.normalAssets,
    slots,intendedCmsState:'unpublished',publish:false},expected:{schemaVersion:1,path,title:lf(value.title),blocks}};
}
function visibleBlocks(raw,observation=false) {
  invalid(Array.isArray(raw)&&raw.length<=MAX_BLOCKS);
  return raw.map(block=>{
    invalid(block&&typeof block==='object');
    if(block.type==='heading'){exact(block,['type','level','text']);invalid(Number.isInteger(block.level)&&block.level>=1&&block.level<=6);return {type:'heading',level:block.level,text:string(block.text,300,false)};}
    if(block.type==='richtext'){exact(block,['type','blocks']);return {type:'richtext',blocks:ast(block.blocks)};}
    if(block.type==='source'){exact(block,['type','text']);return {type:'source',text:string(block.text,5099,false)};}
    if(block.type==='code'){exact(block,['type','code']);return {type:'code',code:string(block.code,100000,false)};}
    invalid(block.type==='gallery');exact(block,['type','items']);invalid(Array.isArray(block.items)&&block.items.length<=MAX_IMAGES);
    return {type:'gallery',items:block.items.map(item=>{
      exact(item,['alt','caption','decorative','attribution',...(observation?['cmsItemId','cmsAssetId']:[])]);invalid(typeof item.decorative==='boolean');
      const result={alt:string(item.alt,3000),caption:string(item.caption,3000),decorative:item.decorative,attribution:string(item.attribution,8000)};
      if(!observation)invalid(!result.decorative||result.alt==='');
      return {...result,...(observation?{cmsItemId:id(item.cmsItemId),cmsAssetId:id(item.cmsAssetId)}:{})};
    })};
  });
}
export function validateCmsReadbackExpectation(raw) {
  const value=pure(raw,4*MiB);exact(value,['schemaVersion','path','title','blocks']);invalid(value.schemaVersion===1);
  return {schemaVersion:1,path:path(value.path),title:string(value.title,300,false),blocks:visibleBlocks(value.blocks)};
}
export function createCmsReadbackExpectation(rawDocument,rawStructure) {
  const value=document(rawDocument),structure=pure(rawStructure,8*MiB);exact(structure,STRUCTURE_KEYS);
  const expected=reconstruct(value);match(equal(lines(structure),lines(expected.structure)));return validateCmsReadbackExpectation(expected.expected);
}

/** Checks trusted-adapter editor/upload claims, never downloads or hashes CMS originals. */
export function verifyCmsReadbackProof(raw) {
  invalid(raw&&typeof raw==='object'&&!isProxy(raw)&&Object.getPrototypeOf(raw)===Object.prototype);
  const descriptors=Object.getOwnPropertyDescriptors(raw);invalid(Reflect.ownKeys(descriptors).length===5&&['document','structure','expected','observation','mediaBindings'].every(key=>descriptors[key]?.enumerable&&Object.hasOwn(descriptors[key],'value')));
  const value=document(raw.document),actual=createCmsReadbackExpectation(value,raw.structure),expected=validateCmsReadbackExpectation(raw.expected);match(equal(expected,actual));
  const input=pure(raw.observation,4*MiB);exact(input,['schemaVersion','observationId','page','blocks']);exact(input.page,['id','path','title','enabled','saved','reopened']);
  invalid(input.schemaVersion===1&&['enabled','saved','reopened'].every(key=>typeof input.page[key]==='boolean'));
  const observation={schemaVersion:1,observationId:id(input.observationId),page:{id:id(input.page.id),path:observedPath(input.page.path),title:string(input.page.title,300,false),
    enabled:input.page.enabled,saved:input.page.saved,reopened:input.page.reopened},blocks:visibleBlocks(input.blocks,true)};
  match(observation.page.path===expected.path&&observation.page.title===expected.title&&observation.page.enabled===false&&observation.page.saved===true&&observation.page.reopened===true);
  const visible=observation.blocks.map(block=>block.type==='gallery'?{type:'gallery',items:block.items.map(({alt,caption,decorative,attribution})=>({alt,caption,decorative,attribution}))}:block);
  match(equal(visible,expected.blocks));const bindings=pure(raw.mediaBindings,512*1024);invalid(Array.isArray(bindings)&&bindings.length<=MAX_IMAGES);match(bindings.length===value.images.length);
  const observed=observation.blocks.filter(block=>block.type==='gallery').flatMap(block=>block.items),items=new Set(),assets=new Map();match(observed.length===bindings.length);
  bindings.forEach((item,index)=>{
    exact(item,['usageId','assetId','sha256','bytes','mimeType','cmsAssetId','cmsItemId']);id(item.usageId);id(item.assetId);id(item.cmsAssetId);id(item.cmsItemId);
    invalid(typeof item.sha256==='string'&&/^[a-f0-9]{64}$/.test(item.sha256)&&Number.isSafeInteger(item.bytes)&&item.bytes>0&&item.bytes<=32*MiB&&['image/jpeg','image/png','image/webp'].includes(item.mimeType));
    const image=value.images[index],position=observed[index];match(item.usageId===image.id&&item.assetId===image.assetId&&item.sha256===image.asset.sha256
      &&item.bytes===image.asset.bytes&&item.mimeType===image.asset.mimeType&&position.cmsItemId===item.cmsItemId&&position.cmsAssetId===item.cmsAssetId&&!items.has(item.cmsItemId));
    items.add(item.cmsItemId);const physical=json([item.sha256,item.bytes,item.mimeType]),prior=assets.get(item.cmsAssetId);match(prior===undefined||prior===physical);assets.set(item.cmsAssetId,physical);
  });
  return {observationHash:digest(json(observation)),mediaBindingsHash:digest(json(bindings))};
}
