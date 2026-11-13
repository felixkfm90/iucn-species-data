import test from 'node:test';
import assert from 'node:assert/strict';
import { createCmsReadbackExpectation,validateCmsReadbackExpectation,verifyCmsReadbackProof } from './cms-readback.mjs';
import { initialDocument,normalizeSpeciesSnapshot,emptySectionHash } from './model.mjs';
import { composePage } from './compose.mjs';
import { createCmsContentSteps } from './cms-content-steps.mjs';
import { fingerprint } from './contract.mjs';

const copy=value=>structuredClone(value),invalid=error=>error.code==='cms_readback_invalid',mismatch=error=>error.code==='cms_readback_mismatch'&&error.status===409;
function fixture(change=()=>{}) {
  const species=normalizeSpeciesSnapshot({slug:'test-art',commonName:'Testart',scientificName:'Testus fixture',taxonomy:[],general:[],status:'',revision:'species-a',dataSha256:'a'.repeat(64),runtimeReady:false,
    normalAssets:{portrait:null,map:null,sound:null,credits:null,spectrogram:null}},'project-cms','test-art');
  const document=initialDocument({templateId:'fn-compact-20261031',species,parentPath:'/wildlife/heimische-tierwelt',title:'Titel mit zwei  Leerzeichen'});
  document.introduction=[{type:'paragraph',text:'A  & <B>\r\nC'},{type:'heading',level:5,text:'Einleitungsüberschrift'}];
  const editorial=document.sections.find(section=>section.kind==='editorial');
  editorial.blocks=[{type:'paragraph',text:'Text vor Liste'},{type:'bullet-list',items:['Erster  Punkt','Zweiter Punkt']},{type:'heading',level:6,text:'Untergliederung'}];
  editorial.sources=[{id:'private-source-id',label:'Sichtbare Fachquelle',url:'https://example.org/fachtext',sha256:'b'.repeat(64)}];
  const empty=document.sections.find(section=>section.kind==='editorial'&&section.id!==editorial.id);
  document.emptyConfirmations[empty.id]={sectionHash:emptySectionHash(empty),actorId:'private-reviewer',confirmedAt:'2026-11-02T12:00:00.000Z',reason:'Bewusst nicht gewünscht'};
  document.sources=[{id:'private-global-source',label:'Globale Quelle'}];
  document.images=['one','two'].map((value,index)=>({id:`private-usage-${value}`,assetId:`private-asset-${value}`,alt:index?'':'Erster Alttext',caption:`Beschriftung ${index+1}`,
    decorative:index===1,asset:{id:`private-asset-${value}`,projectId:'project-cms',sha256:'c'.repeat(64),bytes:123,mimeType:'image/png',attribution:`Sichtbarer Bildcredit ${index+1}`}}));
  change(document);const structure=composePage({id:'draft-cms',revision:fingerprint('fixture-revision'),document},new Map()).structure;
  return {document,structure};
}
function proof(input) {
  const expected=createCmsReadbackExpectation(input.document,input.structure),blocks=copy(expected.blocks);
  const mediaBindings=input.document.images.map((image,index)=>({usageId:image.id,assetId:image.assetId,sha256:image.asset.sha256,bytes:image.asset.bytes,mimeType:image.asset.mimeType,
    cmsAssetId:'cms-shared-original',cmsItemId:`cms-usage-${index+1}`}));
  for(const block of blocks)if(block.type==='gallery')block.items=block.items.map((item,index)=>({...item,cmsAssetId:mediaBindings[index].cmsAssetId,cmsItemId:mediaBindings[index].cmsItemId}));
  return {...input,expected,observation:{schemaVersion:1,observationId:'cms-observation-a',page:{id:'cms-page-a',path:expected.path,title:expected.title,enabled:false,saved:true,reopened:true},blocks},mediaBindings};
}

// The former whole-plan hash is deliberately insufficient: no observed text,
// gallery positions or saved/disabled/reopened state can be inferred from it.
test('a full structure hash alone can never certify CMS editor readback',()=>{
  const value=proof(fixture());value.observation={structureHash:fingerprint(value.structure)};
  assert.throws(()=>verifyCmsReadbackProof(value),invalid);
});

test('expectation preserves all visible slot order, exact rich AST, sources and gallery credits without private metadata',()=>{
  const f=fixture(),before=copy(f),expected=createCmsReadbackExpectation(f.document,f.structure);
  assert.equal(expected.schemaVersion,1);assert.equal(expected.path,'/wildlife/heimische-tierwelt/test-art');
  assert.deepEqual(expected.blocks.map(block=>block.type),f.structure.slots.map(slot=>slot.type));
  assert.deepEqual(expected.blocks[0],{type:'heading',level:3,text:f.document.title});
  assert.equal(expected.blocks[1].blocks[0].text,'A  & <B>\nC');assert.equal(expected.blocks[1].blocks[1].level,5);
  assert.ok(expected.blocks.some(block=>block.type==='source'&&block.text==='Sichtbare Fachquelle · https://example.org/fachtext'));
  assert.deepEqual(expected.blocks.at(-1),{type:'source',text:'Globale Quelle'});
  const gallery=expected.blocks.find(block=>block.type==='gallery');assert.deepEqual(gallery.items.map(item=>item.attribution),['Sichtbarer Bildcredit 1','Sichtbarer Bildcredit 2']);
  assert.deepEqual(Object.keys(gallery.items[0]).sort(),['alt','caption','decorative','attribution'].sort());
  assert.equal(JSON.stringify(expected).includes('private-'),false);assert.equal(JSON.stringify(expected).includes('sha256'),false);
  assert.deepEqual(f,before);const clone=validateCmsReadbackExpectation(expected);clone.blocks[0].text='Independent clone';assert.equal(expected.blocks[0].text,f.document.title);
});

test('browser paste fragments preserve composed order, rich text and source display without private metadata', () => {
  const { document, structure } = fixture();
  const expectation = createCmsReadbackExpectation(document, structure);
  const steps = createCmsContentSteps({ schemaVersion: 2, target: { path: structure.path }, structure, publish: false,
    readback: { schemaVersion: 1, expectation } });

  assert.deepEqual(steps.map(step => step.kind), ['text', 'species', 'text', 'map', 'gallery', 'text']);
  assert.match(steps[0].html, /<h3>Titel mit zwei  Leerzeichen<\/h3>\n<p>A  &amp; &lt;B&gt;<br>C<\/p>\n<h5>Einleitungsüberschrift<\/h5>/u);
  assert.match(steps[2].html, /<p>Text vor Liste<\/p>\n<ul><li>Erster  Punkt<\/li><li>Zweiter Punkt<\/li><\/ul>\n<h6>Untergliederung<\/h6>/u);
  assert.match(steps[2].html, /<p>Sichtbare Fachquelle · https:\/\/example\.org\/fachtext<\/p>/u);
  assert.deepEqual(steps[4], { kind: 'gallery', slotIndex: structure.slots.findIndex(slot => slot.type === 'gallery') });
  assert.equal(steps[5].html, '<p>Globale Quelle</p>');
  assert.doesNotMatch(JSON.stringify(steps), /private-|Bewusst nicht gewünscht/u);
});

test('the map heading and optional editorial text share one physical block without changing the sealed slots', () => {
  const {document,structure}=fixture(value=>{
    const section=value.sections.find(item=>item.kind==='map-module');
    section.title='Karte & Verbreitung';
    section.blocks=[{type:'paragraph',text:'Angaben für <A>.'},{type:'bullet-list',items:['Sommer','Winter']}];
    section.sources=[{id:'map-source',label:'Kartenquelle'}];
  });
  const expectation=createCmsReadbackExpectation(document,structure), original=copy(expectation);
  const plan={schemaVersion:2,target:{path:structure.path},structure,publish:false,readback:{schemaVersion:1,expectation}};
  const steps=createCmsContentSteps(plan), map=steps.find(step=>step.kind==='map');
  assert.deepEqual(map.mapElements,[{type:'heading',level:4,text:'Karte & Verbreitung'},
    {type:'paragraph',text:'Angaben für <A>.'},{type:'bullet-list',items:['Sommer','Winter']}]);
  assert.match(map.code, /<h4>Karte &amp; Verbreitung<\/h4>\n<p>Angaben für &lt;A&gt;\.<\/p>\n<ul><li>Sommer<\/li><li>Winter<\/li><\/ul>\n<div id="map-wrapper"/u);
  assert.equal(steps.some(step=>step.kind==='text'&&step.html.includes('Karte &amp; Verbreitung')),false);
  assert.equal(steps[steps.indexOf(map)+1].html,'<p>Kartenquelle</p>');
  assert.deepEqual(expectation,original);
});

test('exact readback with repeated original bytes uses distinct CMS items and hashes observation/upload binding separately',()=>{
  const value=proof(fixture()),before=copy(value),result=verifyCmsReadbackProof(value);
  assert.match(result.observationHash,/^[a-f0-9]{64}$/);assert.match(result.mediaBindingsHash,/^[a-f0-9]{64}$/);assert.notEqual(result.observationHash,result.mediaBindingsHash);
  assert.deepEqual(value,before);value.observation.observationId='cms-observation-b';assert.notEqual(verifyCmsReadbackProof(value).observationHash,result.observationHash);
});

test('enabled, unsaved, unreopened, wrong path/title, missing blocks and altered order cannot report success',()=>{
  for(const mutate of [value=>{value.observation.page.enabled=true;},value=>{value.observation.page.saved=false;},value=>{value.observation.page.reopened=false;},
    value=>{value.observation.page.path+='/other';},value=>{value.observation.page.title+=' ';},value=>{value.observation.blocks.pop();},
    value=>{[value.observation.blocks[0],value.observation.blocks[1]]=[value.observation.blocks[1],value.observation.blocks[0]];}]) {
    const value=proof(fixture());mutate(value);assert.throws(()=>verifyCmsReadbackProof(value),mismatch);
  }
});

test('only CRLF/CR normalize to LF; spaces, HTML entities, text order and exact code remain significant',()=>{
  const baseline=proof(fixture()),hash=verifyCmsReadbackProof(baseline).observationHash,lines=copy(baseline);
  lines.observation.blocks[1].blocks[0].text='A  & <B>\r\nC';
  for(const block of lines.observation.blocks)if(block.type==='code')block.code=block.code.replaceAll('\n','\r\n');
  assert.equal(verifyCmsReadbackProof(lines).observationHash,hash);
  for(const mutate of [value=>{value.observation.blocks[1].blocks[0].text='A & <B>\nC';},value=>{value.observation.blocks[1].blocks[0].text='A  & &lt;B&gt;\nC';},
    value=>{value.observation.blocks.find(block=>block.type==='code').code+=' ';},value=>{value.observation.blocks.find(block=>block.type==='source').text+=' ';}]) {
    const value=copy(baseline);mutate(value);assert.throws(()=>verifyCmsReadbackProof(value),mismatch);
  }
});

test('reconstruction rejects an expectation and compose-slot structure forged consistently away from the actual document',()=>{
  for(const mutate of [value=>{value.structure.slots[0].text='Forged heading';value.expected.blocks[0].text='Forged heading';value.observation.blocks[0].text='Forged heading';},
    value=>{value.structure.slots[1].html='<p>Different HTML</p>';},value=>{value.structure.slots.find(slot=>slot.type==='source').source.label='Forged source';},
    value=>{value.structure.slots.find(slot=>slot.type==='gallery').items[0].sha256='f'.repeat(64);},value=>{value.structure.slots.splice(2,1);},
    value=>{value.expected.blocks.find(block=>block.type==='gallery').items[0].attribution='';}]) {
    const value=proof(fixture());mutate(value);assert.throws(()=>verifyCmsReadbackProof(value),mismatch);
  }
});

test('gallery alternative text, captions, decorative decisions, visible attribution and usage positions are exact',()=>{
  for(const mutate of [item=>{item.alt+='changed';},item=>{item.caption+=' ';},item=>{item.decorative=!item.decorative;},item=>{item.attribution='';}]) {
    const value=proof(fixture());mutate(value.observation.blocks.find(block=>block.type==='gallery').items[0]);assert.throws(()=>verifyCmsReadbackProof(value),mismatch);
  }
  const value=proof(fixture());value.observation.blocks.find(block=>block.type==='gallery').items.reverse();assert.throws(()=>verifyCmsReadbackProof(value),mismatch);
});

test('every original upload binding is positional and must match the actual plan rather than a claim about downloaded CMS originals',()=>{
  for(const mutate of [value=>{value.mediaBindings[0].usageId='other-usage';},value=>{value.mediaBindings[0].assetId='other-original';},
    value=>{value.mediaBindings[0].sha256='f'.repeat(64);},value=>{value.mediaBindings[0].bytes++;},value=>{value.mediaBindings[0].mimeType='image/jpeg';},
    value=>{value.mediaBindings.reverse();},value=>{value.mediaBindings.pop();},value=>{value.mediaBindings[0].cmsItemId='other-cms-item';}]) {
    const value=proof(fixture());mutate(value);assert.throws(()=>verifyCmsReadbackProof(value),mismatch);
  }
});

test('CMS item reuse is forbidden and CMS asset reuse is allowed only for byte-identical hash/size/MIME',()=>{
  const duplicate=proof(fixture());duplicate.mediaBindings[1].cmsItemId=duplicate.mediaBindings[0].cmsItemId;
  duplicate.observation.blocks.find(block=>block.type==='gallery').items[1].cmsItemId=duplicate.mediaBindings[0].cmsItemId;
  assert.throws(()=>verifyCmsReadbackProof(duplicate),mismatch);
  const other=proof(fixture(document=>{document.images[1].asset.sha256='d'.repeat(64);}));assert.throws(()=>verifyCmsReadbackProof(other),mismatch);
});

test('empty unrequested gallery stays empty and intentional empty editorial slots do not invent visible confirmation text',()=>{
  const value=proof(fixture(document=>{document.images=[];document.galleryRequested=false;}));
  assert.deepEqual(value.expected.blocks.find(block=>block.type==='gallery').items,[]);assert.deepEqual(value.mediaBindings,[]);
  assert.equal(JSON.stringify(value.expected).includes('Bewusst leer'),false);assert.ok(verifyCmsReadbackProof(value).observationHash);
});

test('Proxy/accessor/symbol/hidden properties and extra local metadata are rejected without evaluating them',()=>{
  let accessed=false;const proxy=new Proxy({}, {get(){accessed=true;throw new Error('Do not access');},getPrototypeOf(){accessed=true;throw new Error('Do not inspect');}});
  const value=proof(fixture());for(const raw of [proxy,{...value.expected,projectId:'private-project'}])assert.throws(()=>validateCmsReadbackExpectation(raw),invalid);
  for(const mutate of [raw=>{Object.defineProperty(raw,'title',{enumerable:true,get(){accessed=true;return 'wrong';}});},raw=>{raw[Symbol('hidden')]=true;},
    raw=>{Object.defineProperty(raw,'hidden',{value:true});},raw=>{raw.blocks.find(block=>block.type==='gallery').items[0].assetId='private-id';}]) {
    const raw=copy(value.expected);mutate(raw);assert.throws(()=>validateCmsReadbackExpectation(raw),invalid);
  }
  assert.equal(accessed,false);
});

test('bounded pure data rejects oversized values and model-overlimit galleries before cloning or accepting a proof',()=>{
  const value=proof(fixture()),huge={...value.expected,title:'x'.repeat(4*1024*1024+1)};
  assert.throws(()=>validateCmsReadbackExpectation(huge),error=>error.code==='cms_readback_too_large');
  const sparse={...value.expected,blocks:new Array(300001)};assert.throws(()=>validateCmsReadbackExpectation(sparse),error=>error.code==='cms_readback_too_large');
  const over=copy(value.document);over.images=Array.from({length:201},(_,index)=>({...copy(value.document.images[0]),id:`usage-${index}`}));
  assert.throws(()=>createCmsReadbackExpectation(over,value.structure),invalid);
});
