import fs from 'node:fs';
import path from 'node:path';
import { tmpdir,assertTestTempPath } from '../../scripts/test-temp.mjs';
import { createSqlitePageAuthoringRepository } from './repository.mjs';
import { createPageAuthoringService } from './service.mjs';
import { sha256,fingerprint,clone } from './contract.mjs';
import { editableDocument } from './model.mjs';

export const CLOCK = '2026-10-31T10:00:00.000Z';
export const actors = {publisher:{id:'felix',projectId:'project-a',role:'publisher',online:true},contributor:{id:'bruder',projectId:'project-a',role:'contributor',online:true},
  offline:{id:'bruder',projectId:'project-a',role:'contributor',online:false},reader:{id:'gast',projectId:'project-a',role:'reader',online:true},
  foreign:{id:'gast',projectId:'project-b',role:'publisher',online:true},adapter:{id:'felix',projectId:'project-a',role:'publisher',online:true,channel:'cms-adapter'}};
export function fixture(t) {
  const directory = fs.mkdtempSync(path.join(tmpdir(),'pa-')); const filename = path.join(directory,'drafts.sqlite');
  const bytes = new Map([
    ['portrait',Buffer.from('524946460c000000574542505650384c00000000','hex')],['map',Buffer.from('ffd8ffe00001464effd9','hex')],
    ['photo-a',Buffer.from('89504e470d0a1a0a0000000049454e44ae426082','hex')],['photo-b',Buffer.from('89504e470d0a1a0a0000000049454e44ae426083','hex')],
  ]);
  const metadata = new Map([...bytes].map(([id,b])=>[id,{id,projectId:'project-a',sha256:sha256(b),bytes:b.length,mimeType:id === 'portrait' ? 'image/webp' : id === 'map' ? 'image/jpeg' : 'image/png',attribution:id === 'photo-a' ? 'Felix · eigene Aufnahme' : ''}]));
  const species = {slug:'test-art',scientificName:'Testus fixture',commonName:'Test-Art',taxonomy:[{rank:'Gattung',name:'Testus'}],general:[{label:'Name',value:'Test-Art'}],status:'Teststatus',revision:'species-1',dataSha256:fingerprint({fixture:true}),runtimeReady:true,normalAssets:{portrait:metadata.get('portrait'),map:metadata.get('map'),sound:null,credits:null,spectrogram:null}};
  let targetCalls = 0,readCalls = 0;
  const repos = [];
  const open = () => { const repo=createSqlitePageAuthoringRepository({filename,localStorageConfirmed:true,now:()=>CLOCK}); repos.push(repo); return repo; };
  let repository = open();
  const authorities = {actorAuthority:{resolve:async context=>actors[context]},speciesAuthority:{snapshot:async()=>clone(species)},mediaFacade:{describe:async(_context,id)=>clone(metadata.get(id)),read:async(_context,id)=>{readCalls++; return bytes.get(id);}},
    targetAuthority:{checkNew:async(_context,targetPath)=>{targetCalls++;return {path:targetPath,parentPath:targetPath.slice(0,targetPath.lastIndexOf('/')),parentExists:true,online:true,exists:false,checkedAt:CLOCK,observationId:'observation-1'};}}};
  const build = repo => createPageAuthoringService({repository:repo,...authorities,now:()=>CLOCK});
  let sequence=0; const mutationId=()=>`mutation-${++sequence}`;
  const result = {directory,filename,bytes,metadata,species,authorities,repository,service:build(repository),mutationId,open,build,get targetCalls(){return targetCalls;},get readCalls(){return readCalls;},
    async create(context='contributor',extra={}) { return (await result.service.createDraft(context,{draftId:'draft-a',mutationId:mutationId(),templateId:'fn-compact-20261031',slug:species.slug,parentPath:'/wildlife/heimische-tierwelt',...extra})).draft; },
    async save(value,edit,context='contributor') { const document=editableDocument(value.document);edit(document);return (await result.service.saveDraft(context,{draftId:value.id,mutationId:mutationId(),expectedRevision:value.revision,document})).draft; },
    async ready(context='publisher') { let value=await result.create();value=await result.save(value,document=>{for(const section of document.sections)if(!['general','map'].includes(section.id))section.blocks=[{type:'paragraph',text:`Gelieferter Testtext ${section.id}`}];document.images=[{id:'image-a',assetId:'photo-a',alt:'Bereitgestelltes Testbild',caption:'Beschriftung ohne Punkt',decorative:false}];});return value; },
    async approval(value) { const preview=await result.service.preview('publisher',{draftId:value.id,mutationId:mutationId(),expectedRevision:value.revision});const approved=await result.service.approve('publisher',{draftId:value.id,mutationId:mutationId(),expectedRevision:value.revision,previewId:preview.artifact.id,reportHash:preview.report.reportHash,review:{texts:true,images:true,layout:true},missingAltAcknowledged:[]});return {preview,approved}; },
    async plan(value) {const {approved}=await result.approval(value);return (await result.service.prepareCmsPlan('publisher',{draftId:value.id,mutationId:mutationId(),expectedRevision:value.revision,approvalId:approved.artifact.id})).artifact;},
    close(){for(const repo of repos)repo.close();},
  };
  t.after(()=>{result.close();assertTestTempPath(directory);fs.rmSync(directory,{recursive:true,force:true});});return result;
}
