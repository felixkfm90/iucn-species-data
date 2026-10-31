import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { squarespaceAutoLayoutDomOperation } from './squarespace-auto-layout-dom.mjs';

const sectionId = '6763055eb0ca8d65d68d1b1f';
const sourceUrl = 'https://images.squarespace-cdn.com/content/v1/67556be0338df718ea064210/9622dd4a-4c08-4910-b3ed-32487f5454cb/IMGP2101.JPG';
const itemTitle = 'Athen';
const payload = operation => ({ operation, sourceUrl, sectionId, itemTitle });

// Browser-shaped fixture, deliberately running ONLY the serialized function in a fresh VM.
// It implements actual containment, label adjacency, viewport hit testing and focus changes.
function fixture({innerWidth,innerHeight}={}) {
  let document;
  const calls=[];
  const box=(x=0,y=0,width=1400,height=1000)=>({left:x,top:y,right:x+width,bottom:y+height,width,height});
  const matches=(node,selector)=>selector.split(',').some(part=>{
    const simple=part.trim(),tag=simple.match(/^[a-z][\w-]*/i)?.[0],id=simple.match(/#([\w-]+)/)?.[1];
    if(tag && tag.toLowerCase()!==node.tagName.toLowerCase() || id && node.getAttribute('id')!==id)return false;
    for(const cls of simple.matchAll(/\.([\w-]+)/g))if(!(node.getAttribute('class')||'').split(/\s+/).includes(cls[1]))return false;
    for(const attr of simple.matchAll(/\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g)){
      const value=node.getAttribute(attr[1]);if(value===null)return false;
      const wanted=attr[2]??attr[3]??attr[4];if(wanted!==undefined && wanted!==value)return false;
    }
    return true;
  });
  function element(tag,{attrs={},text='',value='',rect=box(),css={}}={},children=[]){
    const node={tagName:tag.toUpperCase(),attrs,ownText:text,value,rect,
      css:{display:'block',visibility:'visible',opacity:'1',pointerEvents:'auto',overflow:'visible',...css},children:[],parentElement:null,
      getAttribute(name){return Object.hasOwn(node.attrs,name)?String(node.attrs[name]):null;},
      getBoundingClientRect:()=>node.rect,getClientRects:()=>node.css.display==='none'?[]:[node.rect],matches:selector=>matches(node,selector),
      contains(target){return node===target || node.children.some(child=>child.contains(target));},
      querySelectorAll(selector){return node.children.flatMap(child=>[...(matches(child,selector)?[child]:[]),...child.querySelectorAll(selector)]);},
      closest(selector){for(let current=node;current;current=current.parentElement)if(matches(current,selector))return current;return null;},
      append(...nodes){for(const child of nodes){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(old=>old!==child);child.parentElement=node;node.children.push(child);}},
      scrollIntoView(){calls.push(['scroll',node]);node.onScroll?.();},
      focus(){calls.push(['focus',node]);document.activeElement=node;},
      blur(){calls.push(['blur',node]);if(document.activeElement===node)document.activeElement=null;},
    };
    Object.defineProperties(node,{
      textContent:{get(){return node.ownText+node.children.map(child=>child.textContent).join(' ');}},
      innerText:{get(){const value=node.textContent;return node.css.textTransform==='uppercase'?value.toUpperCase():value;}},
      nextElementSibling:{get(){const siblings=node.parentElement?.children||[];return siblings[siblings.indexOf(node)+1]||null;}},
      disabled:{get(){return node.getAttribute('disabled')!==null;}},readOnly:{get(){return node.getAttribute('readonly')!==null;}},
      type:{get(){return node.getAttribute('type') || (tag==='input'?'text':'');}},
    });
    if(tag==='img')node.currentSrc=attrs.src||'';
    node.append(...children);return node;
  }
  document=element('body');document.baseURI='https://vanilla-gerbil-jwnp.squarespace.com/config/pages';
  document.documentElement={clientWidth:1400,clientHeight:1000};document.activeElement=null;
  document.elementFromPoint=(x,y)=>{
    const visible=node=>{for(let current=node;current;current=current.parentElement)if(current.css.display==='none'||current.css.visibility==='hidden'||current.css.opacity==='0')return false;return true;};
    return document.querySelectorAll('*').filter(node=>visible(node)&&x>=node.rect.left&&x<node.rect.right&&y>=node.rect.top&&y<node.rect.bottom).at(-1)||null;
  };
  const operation=vm.runInNewContext(`(${squarespaceAutoLayoutDomOperation.toString()})`,{document,URL,innerWidth,innerHeight,getComputedStyle:node=>node.css});
  return {document,element,box,calls,run:input=>operation(input)};
}
function preview(options){
  const f=fixture(options),{element:e,box:b}=f;
  const list=e('ul',{attrs:{class:'user-items-list-simple'},rect:b(100,120,1000,800)}),images=[],titles=[],items=[];
  for(let index=0;index<9;index++){
    const x=120+(index%3)*300,y=160+Math.floor(index/3)*220;
    const img=e('img',{attrs:{class:'list-image',src:`${index?sourceUrl.replace('IMGP2101',`IMGP${2200+index}`):sourceUrl}?format=1500w`,alt:index?'Anderes Bild':'Bisheriger Alternativtext. '},rect:b(x,y,240,140)});
    const title=e('h2',{attrs:{class:'list-item-content__title'},text:index?`Reiseziel ${index}`:itemTitle,css:{textTransform:'uppercase'},rect:b(x,y+150,240,30)});
    const item=e('li',{attrs:{class:'list-item'},rect:b(x,y,260,190)},[img,title]);list.append(item);images.push(img);titles.push(title);items.push(item);
  }
  const section=e('section',{attrs:{'data-sqsp-section':'auto-layout','data-section-id':sectionId},rect:b(100,120,1050,800)},[list]);
  const main=e('main',{attrs:{id:'page'}},[section]);f.document.append(main);return{...f,main,section,list,images,titles,items};
}
function dialogFixture({detail=true,semantic='adjacent'}={}){
  const f=fixture(),{element:e,box:b}=f;
  const dialog=e('div',{attrs:{role:'dialog','aria-label':'Formular zur Abschnittsbearbeitung'},rect:b(100,80,1100,850)});
  const makeField=(role,tag,value,y,id)=>{
    const label=e(semantic==='for'?'label':'span',{text:role,attrs:semantic==='for'?{for:id}:{},rect:b(450,y,500,20)});
    const carrier=semantic==='for'?label:e('div',{rect:b(450,y,500,20)},[label]);
    const field=e(tag,{attrs:{id,...(tag==='div'?{contenteditable:'true'}:{}),...(semantic==='aria'?{'aria-label':role}:{})},
      value:tag==='div'?'':value,text:tag==='div'?value:'',rect:b(450,y+30,500,tag==='div'?120:35)});
    const wrapper=e('div',{rect:field.rect},[field]),group=e('div',{rect:b(450,y,520,tag==='div'?160:80)},[carrier,wrapper]);
    dialog.append(group);return{field,label,carrier,wrapper,group};
  };
  if(!detail){
    const tab=e('button',{attrs:{role:'tab'},text:'Inhalt',rect:b(300,100,100,40)});dialog.append(tab);
    const thumb=e('img',{attrs:{src:`${sourceUrl}?format=300w`},rect:b(160,220,70,50)});
    const trash=e('button',{attrs:{'aria-label':'Entfernen'},rect:b(950,230,30,30)});
    const label=e('span',{text:itemTitle,rect:b(260,230,300,30)});
    const row=e('div',{attrs:{role:'button','aria-label':itemTitle},rect:b(140,210,870,80)},[thumb,label,trash]);dialog.append(row);f.document.append(dialog);
    return{...f,dialog,tab,thumb,trash,row};
  }
  const img=e('img',{attrs:{src:`${sourceUrl}?format=500w`},rect:b(150,190,220,140)});
  const back=e('button',{attrs:{'aria-label':`Zurück ${itemTitle}`},rect:b(130,110,300,40)});
  const nestedBack=e('button',{attrs:{'aria-label':'Zurück'},rect:b(130,110,70,40)});back.append(nestedBack,e('span',{text:itemTitle,rect:b(230,110,100,40)}));
  dialog.append(img,back);
  const alt=makeField('BILD-ALTERNATIVTEXT','input','Bisheriger Alternativtext. ',210,'StringField-1');
  const title=makeField('TITEL','input',itemTitle,330,'StringField-2');
  const description=makeField('BESCHREIBUNG','div','Bestehender Absatz.\nZweite Zeile bleibt unverändert.',450,'description-editor');
  const buttonText=makeField('BUTTON: TEXT','input','Mehr erfahren',660,'StringField-3');
  f.document.append(dialog);return{...f,dialog,img,back,nestedBack,alt,title,description,buttonText};
}

test('serialized function binds the exact nine-item preview, raw title and untrimmed alt',()=>{
  const f=preview(),bound=f.run(payload('bind-section'));assert.equal(bound.sectionId,sectionId);assert.equal(bound.itemTitle,'Athen');
  assert.equal(f.titles[0].innerText,'ATHEN');assert.equal(bound.alt,'Bisheriger Alternativtext. ');assert.equal(bound.caption,'');
  assert.equal(bound.sourceUrl,`${sourceUrl}?format=1500w`);assert.equal(bound.viewport.width,1400);
  assert.equal(f.document.elementFromPoint(bound.point.x,bound.point.y),f.images[0]);
});
test('layout viewport includes its scrollbar for source-bound native iframe mapping',()=>{
  const f=preview({innerWidth:1417,innerHeight:1017}),bound=f.run(payload('bind-section'));
  assert.deepEqual(JSON.parse(JSON.stringify(bound.viewport)),{width:1417,height:1017});
});

test('preview rejects foreign source, duplicate matching source/title, absent list context and header/footer',()=>{
  for(const mutate of [f=>{f.images[0].currentSrc=sourceUrl.replace('IMGP2101','OTHER');},
    f=>{f.images[1].currentSrc=f.images[0].currentSrc;f.titles[1].ownText=itemTitle;},
    f=>{f.titles[1].ownText=itemTitle;},f=>{f.list.attrs.class='other-list';},
    f=>{const footer=f.element('footer');footer.append(f.section);f.main.append(footer);},
    f=>{f.main.tagName='HEADER';}]){
    const f=preview();mutate(f);assert.equal(f.run(payload('bind-section')),null);
  }
});
test('CDN format is ignored; other source parameters, credentials and absent HTTPS are not',()=>{
  const f=preview();assert.ok(f.run({...payload('bind-section'),sourceUrl:`${sourceUrl}?format=750w#preview`}));
  for(const value of [`${sourceUrl}?crop=top`,sourceUrl.replace('https:','http:'),sourceUrl.replace('https://','https://user:secret@'),'/IMGP2101.JPG']){
    assert.equal(f.run({...payload('bind-section'),sourceUrl:value}),null);
  }
});
test('section portal containment selects only exact INHALT BEARBEITEN, never section edit/remove',()=>{
  const f=fixture(),{element:e,box:b}=f;
  const wanted=e('button',{text:'INHALT BEARBEITEN',rect:b(200,40,200,40)}),portal=e('div',{attrs:{id:`page-region-${sectionId}-section-editor-ui-mount`},rect:b(190,30,800,60)},[
    wanted,e('button',{text:'ABSCHNITT BEARBEITEN',rect:b(450,40,230,40)}),e('button',{text:'Entfernen',rect:b(700,40,120,40)})]);
  f.document.append(portal,e('button',{text:'INHALT BEARBEITEN',rect:b(1000,40,200,40)}));
  const result=f.run({...payload('content-control'),hovered:true});assert.equal(f.document.elementFromPoint(result.point.x,result.point.y),wanted);
  assert.equal(f.run({...payload('content-control'),sectionId:'not-a-section',hovered:true}),null);
  assert.equal(f.run(payload('content-control')),null);
  wanted.attrs.disabled='';assert.equal(f.run({...payload('content-control'),hovered:true}),null);
});
test('confirmed source hover binds a unique visible CMS portal even when its ID differs from the public section',()=>{
  const f=fixture(),button=f.element('button',{text:'INHALT BEARBEITEN',rect:f.box(200,40,200,40)});
  f.document.append(f.element('div',{attrs:{id:'page-region-681d2465734168ddb225c06e-section-editor-ui-mount'}},[button]));
  const result=f.run({...payload('content-control'),hovered:true});
  assert.ok(result?.point,'Observed CMS portal must not be equated with the source-bound public section ID');
  assert.equal(f.document.elementFromPoint(result.point.x,result.point.y),button);
});
test('portal fallback requires literal true from the source-bound hover, including when IDs happen to match',()=>{
  const f=fixture(),button=f.element('button',{text:'INHALT BEARBEITEN',rect:f.box(200,40,200,40)});
  f.document.append(f.element('div',{attrs:{id:`page-region-${sectionId}-section-editor-ui-mount`}},[button]));
  for(const hovered of [undefined,false,'true',1])assert.equal(f.run({...payload('content-control'),hovered}),null);
  assert.ok(f.run({...payload('content-control'),hovered:true}));
});
test('multiple visible portal controls stop fallback; hidden neighbours do not become targets',()=>{
  const f=fixture(),buttons=[],portals=[];
  for(const [index,id] of [sectionId,'681d2465734168ddb225c06e'].entries()){
    const button=f.element('button',{text:'INHALT BEARBEITEN',rect:f.box(200+300*index,40,200,40)});
    const portal=f.element('div',{attrs:{id:`page-region-${id}-section-editor-ui-mount`}},[button]);f.document.append(portal);buttons.push(button);portals.push(portal);
  }
  assert.equal(f.run({...payload('content-control'),hovered:true}),null);
  portals[1].css.display='none';const result=f.run({...payload('content-control'),hovered:true});
  assert.equal(f.document.elementFromPoint(result.point.x,result.point.y),buttons[0]);
});
test('invalid, nested, header and footer portals never qualify for fallback',()=>{
  for(const mode of ['invalid','nested','header','footer']){
    const f=fixture(),button=f.element('button',{text:'INHALT BEARBEITEN',rect:f.box(200,40,200,40)});
    const portal=f.element('div',{attrs:{id:mode==='invalid'?'page-region-wrong-section-editor-ui-mount':`page-region-${sectionId}-section-editor-ui-mount`}},[button]);
    if(mode==='header'||mode==='footer')f.document.append(f.element(mode,{},[portal]));
    else if(mode==='nested')f.document.append(f.element('div',{attrs:{id:'page-region-681d2465734168ddb225c06e-section-editor-ui-mount'}},[portal]));
    else f.document.append(portal);
    assert.equal(f.run({...payload('content-control'),hovered:true}),null,mode);
  }
});
test('content-control diagnostics return bounded counts and hover status without identifiers or content',()=>{
  const f=fixture(),button=f.element('button',{text:'INHALT BEARBEITEN',rect:f.box(200,40,200,40)});
  f.document.append(f.element('div',{attrs:{id:'page-region-681d2465734168ddb225c06e-section-editor-ui-mount'}},[button]));
  const diagnostic=f.run({...payload('content-control-diagnostic'),hovered:true}),serialized=JSON.stringify(diagnostic);
  assert.equal(diagnostic.hoverConfirmed,true);assert.equal(diagnostic.validPortalCount,1);assert.equal(diagnostic.portalControls,1);
  assert.ok(!serialized.includes(sourceUrl));assert.ok(!serialized.includes(sectionId));assert.ok(!serialized.includes('681d2465734168ddb225c06e'));assert.deepEqual(f.calls,[]);
});
test('visible foreign dialogs and occluding overlays prevent section actions',()=>{
  const f=fixture(),button=f.element('button',{text:'INHALT BEARBEITEN',rect:f.box(200,40,200,40)});
  f.document.append(f.element('div',{attrs:{id:`page-region-${sectionId}-section-editor-ui-mount`}},[button]));
  f.document.append(f.element('div',{attrs:{role:'dialog','aria-label':'Andere Bearbeitung'}}));assert.equal(f.run({...payload('content-control'),hovered:true}),null);
  f.document.children.pop();f.document.append(f.element('div',{rect:f.box(0,0,1400,1000)}));assert.equal(f.run({...payload('content-control'),hovered:true}),null);
});
test('content tab is unique inside the named section dialog',()=>{
  const f=dialogFixture({detail:false}),result=f.run(payload('content-tab'));assert.equal(f.document.elementFromPoint(result.point.x,result.point.y),f.tab);
  f.dialog.append(f.element('button',{attrs:{role:'tab'},text:'Inhalt'}));assert.equal(f.run(payload('content-tab')),null);
});
test('item selection requires both exact source and title and never targets nested trash',()=>{
  const f=dialogFixture({detail:false}),result=f.run(payload('select-item'));assert.ok(result?.point);
  const hit=f.document.elementFromPoint(result.point.x,result.point.y);assert.equal(f.row.contains(hit),true);assert.equal(f.trash.contains(hit),false);
  f.row.attrs['aria-label']='Delphi';assert.equal(f.run(payload('select-item')),null);f.row.attrs['aria-label']=itemTitle;
  f.thumb.currentSrc=sourceUrl.replace('IMGP2101','OTHER');assert.equal(f.run(payload('select-item')),null);
});
test('trash overlapping the center is avoided; an entirely covered item is rejected',()=>{
  const f=dialogFixture({detail:false});f.trash.rect=f.box(540,210,80,80);
  const result=f.run(payload('select-item'));assert.ok(result?.point);assert.equal(f.trash.contains(f.document.elementFromPoint(result.point.x,result.point.y)),false);
  f.trash.rect=f.row.rect;assert.equal(f.run(payload('select-item')),null);
});
test('nested exact-title sortable wrapper and inner image button select only the inner button',()=>{
  const f=dialogFixture({detail:false});
  const drag=f.element('div',{attrs:{role:'button','aria-label':itemTitle,'aria-roledescription':'sortable'},rect:f.box(120,200,910,110)});
  f.dialog.append(drag);drag.append(f.row);
  const result=f.run(payload('select-item'));assert.ok(result?.point);
  assert.equal(f.row.contains(f.document.elementFromPoint(result.point.x,result.point.y)),true);
});
test('disabled inner source button never falls back to the outer sortable wrapper',()=>{
  const f=dialogFixture({detail:false}),drag=f.element('div',{attrs:{role:'button','aria-label':itemTitle,'aria-roledescription':'sortable'},rect:f.box(120,200,910,110)});
  f.dialog.append(drag);drag.append(f.row);f.row.attrs.disabled='';assert.equal(f.run(payload('select-item')),null);
  delete f.row.attrs.role;assert.equal(f.run(payload('select-item')),null);
});
test('equal source/title controls in separate branches stay ambiguous',()=>{
  const f=dialogFixture({detail:false}),other=f.element('button',{text:itemTitle,rect:f.box(140,350,870,80)},[
    f.element('img',{attrs:{src:`${sourceUrl}?format=300w`},rect:f.box(160,360,70,50)})]);
  f.dialog.append(other);assert.equal(f.run(payload('select-item')),null);
  const diagnostic=f.run(payload('field-diagnostic'));assert.equal(diagnostic.selection.innermostControls,2);assert.equal(diagnostic.sourceMatches,2);
});
test('sibling miniature relationship is diagnosed but does not authorize a broader row selector',()=>{
  const f=dialogFixture({detail:false}),group=f.element('div',{rect:f.box(120,200,910,110)});
  f.dialog.append(group);group.append(f.thumb,f.row);assert.equal(f.run(payload('select-item')),null);
  const diagnostic=f.run(payload('field-diagnostic'));assert.equal(diagnostic.sourceControls[0].nearestControl,null);
  assert.ok(diagnostic.sourceControls[0].parentChain.some(node=>node.sourceImageCount===1 && node.exactTitleControls===1 && node.exactTitleControlsContainingImage===0));
  assert.equal(diagnostic.selection.controls[0].containsSourceImage,false);
});
test('source miniature diagnostic distinguishes nested candidates without reading out names, classes or values',()=>{
  const f=dialogFixture({detail:false}),drag=f.element('div',{attrs:{role:'button','aria-label':itemTitle,'aria-roledescription':'sortable',class:'SECRET-CLASS'},rect:f.box(120,200,910,110)});
  f.dialog.append(drag);drag.append(f.row);
  const diagnostic=f.run(payload('field-diagnostic')),serialized=JSON.stringify(diagnostic);
  assert.equal(diagnostic.selection.matchingControls,2);assert.equal(diagnostic.selection.innermostControls,1);
  assert.equal(diagnostic.sourceControls[0].nearestControl.exactTitleControl,true);
  assert.ok(diagnostic.sourceControls[0].parentChain.some(node=>node.dragControl));
  assert.ok(diagnostic.selection.controls.some(control=>control.containsSourceImage && control.point));
  for(const privateValue of [sourceUrl,itemTitle,'SECRET-CLASS'])assert.ok(!serialized.includes(privateValue));
  assert.deepEqual(f.calls,[]);
});
for(const semantic of ['adjacent','for','aria'])test(`alt field uses ${semantic} label binding without StringField indexes`,()=>{
  const f=dialogFixture({semantic}),before={title:f.title.field.value,description:f.description.field.textContent,button:f.buttonText.field.value};
  f.alt.field.attrs.id='UnrelatedStableField-9';if(semantic==='for')f.alt.label.attrs.for='UnrelatedStableField-9';
  const result=f.run(payload('alt-field'));assert.equal(result.alt,'Bisheriger Alternativtext. ');assert.equal(result.caption,'');assert.equal(result.isAltField,true);assert.equal(result.editable,true);
  assert.equal(result.title,itemTitle);assert.equal(result.description,before.description);
  assert.ok(f.run(payload('focus-alt')));assert.equal(f.document.activeElement,f.alt.field);assert.ok(f.run(payload('blur-alt')));assert.equal(f.document.activeElement,null);
  assert.equal(f.title.field.value,before.title);assert.equal(f.description.field.textContent,before.description);assert.equal(f.buttonText.field.value,before.button);
});
test('semantic label contradiction cannot be replaced by a nearby visual label',()=>{
  const f=dialogFixture();f.alt.field.attrs['aria-label']='Dateiname';assert.equal(f.run(payload('alt-field')),null);
});
test('aria-labelledby and empty native contenteditable attributes bind without index assumptions',()=>{
  const f=dialogFixture();f.alt.label.attrs.id='alt-label';f.alt.field.attrs['aria-labelledby']='alt-label';f.description.field.attrs.contenteditable='';
  const result=f.run(payload('alt-field'));assert.equal(result.alt,'Bisheriger Alternativtext. ');assert.equal(result.description,f.description.field.textContent);
});
test('nested foreign modal blocks field access even when its rectangle does not cover the field',()=>{
  const f=dialogFixture();f.dialog.append(f.element('div',{attrs:{role:'alertdialog'},rect:f.box(100,100,50,40)}));
  assert.equal(f.run(payload('alt-field')),null);assert.equal(f.run(payload('content-tab')),null);
});
test('title mismatch, another preview, duplicated field and read-only states all fail closed',()=>{
  for(const mutate of [f=>{f.title.field.value='ATHEN';},f=>{f.img.currentSrc=sourceUrl.replace('IMGP2101','OTHER');},
    f=>{f.dialog.append(f.element('img',{attrs:{src:sourceUrl.replace('IMGP2101','OTHER')}}));},
    f=>{f.alt.group.append(f.element('input',{attrs:{'aria-label':'BILD-ALTERNATIVTEXT'},value:'foreign'}));},
    f=>{f.alt.field.attrs.readonly='';},f=>{f.alt.field.attrs.disabled='';},
    f=>{f.alt.field.attrs['aria-readonly']='true';},f=>{f.alt.field.css.pointerEvents='none';}]){
    const f=dialogFixture();mutate(f);for(const operation of ['alt-field','focus-alt','blur-alt'])assert.equal(f.run(payload(operation)),null);
    assert.equal(f.document.activeElement,null);
  }
});
test('nonsemantic broad dialog labels and ambiguous distant groups never identify the alt input',()=>{
  const f=dialogFixture();f.alt.carrier.parentElement.children=f.alt.carrier.parentElement.children.filter(node=>node!==f.alt.carrier);f.dialog.append(f.alt.carrier);
  assert.equal(f.run(payload('alt-field')),null);
});

test('nested visual labels remain bound to their own single-field group',()=>{
  const f=dialogFixture();
  for(const field of [f.alt,f.title,f.description]) {
    let nested=field.carrier;
    for(let index=0;index<4;index++) nested=f.element('div',{rect:field.carrier.rect},[nested]);
    field.group.children=field.group.children.filter(node=>node!==field.carrier);
    field.group.children.unshift(nested);nested.parentElement=field.group;
  }
  const result=f.run(payload('alt-field'));
  assert.equal(result?.alt,'Bisheriger Alternativtext. ');assert.equal(result?.title,'Athen');
});

test('a native group label excludes editable contents when it contains its own field',()=>{
  const f=dialogFixture();
  for(const [field,label] of [[f.alt,'BILD-ALTERNATIVTEXT'],[f.title,'TITEL'],[f.description,'BESCHREIBUNG']]) {
    field.group.children=field.group.children.filter(node=>node!==field.carrier);
    field.wrapper.nodeType=1;field.field.nodeType=1;
    field.group.childNodes=[{nodeType:3,nodeValue:label},field.wrapper];
    field.wrapper.childNodes=[field.field];
  }
  const result=f.run(payload('alt-field'));
  assert.equal(result?.alt,'Bisheriger Alternativtext. ');assert.equal(result?.title,'Athen');
  assert.equal(result?.description,f.description.field.textContent);
});

test('a shared grid binds each immediately adjacent label and single field without counting other rows',()=>{
  const f=dialogFixture(),grid=f.element('div',{rect:f.box(440,190,530,600)});
  for(const field of [f.alt,f.title,f.description,f.buttonText]) {
    field.group.children=[];
    grid.append(field.carrier,field.wrapper);
  }
  f.dialog.append(grid);
  const result=f.run(payload('alt-field'));assert.equal(result?.alt,'Bisheriger Alternativtext. ');assert.equal(result?.title,'Athen');
  const extra=f.element('input',{attrs:{type:'text'},rect:f.box(450,240,500,35)});f.alt.wrapper.append(extra);
  assert.equal(f.run(payload('alt-field')),null);
});
test('offscreen fields may scroll into view but overlays and ancestor clipping remain authoritative',()=>{
  const f=dialogFixture();f.alt.field.rect=f.box(450,1100,500,35);f.alt.field.onScroll=()=>{f.alt.field.rect=f.box(450,250,500,35);};
  assert.ok(f.run(payload('alt-field')));assert.ok(f.calls.some(([kind,node])=>kind==='scroll'&&node===f.alt.field));
  f.document.append(f.element('div',{rect:f.box(440,240,520,60)}));assert.equal(f.run(payload('focus-alt')),null);
  const clipped=dialogFixture();clipped.alt.wrapper.css.overflow='hidden';clipped.alt.wrapper.rect=clipped.box(0,0,5,5);assert.equal(clipped.run(payload('focus-alt')),null);
});
test('back operation remains bound to the selected item and chooses the nested actual back control',()=>{
  const f=dialogFixture(),result=f.run(payload('back-item'));assert.equal(f.document.elementFromPoint(result.point.x,result.point.y),f.nestedBack);
  assert.equal(f.run({...payload('back-item'),sourceUrl:sourceUrl.replace('IMGP2101','OTHER')}),null);
});
test('dialog-closed is true only after every visible modal is gone',()=>{
  const f=fixture();assert.equal(f.run(payload('dialog-closed')),true);f.document.append(f.element('div',{attrs:{role:'dialog','aria-label':'Andere Bearbeitung'}}));
  assert.equal(f.run(payload('dialog-closed')),false);f.document.children[0].css.display='none';assert.equal(f.run(payload('dialog-closed')),true);
});
test('diagnostics contain counts, known label classes and attribute types but no field values/URLs/IDs',()=>{
  const f=dialogFixture();f.alt.field.value='SECRET-ALT';f.title.field.value='SECRET-TITLE';f.description.field.ownText='SECRET-DESCRIPTION';f.buttonText.field.value='SECRET-BUTTON';
  const diagnostic=f.run(payload('field-diagnostic')),serialized=JSON.stringify(diagnostic);
  assert.equal(diagnostic.boundDialog,true);assert.equal(diagnostic.sourceMatches,1);assert.equal(diagnostic.fields.length,4);
  assert.ok(diagnostic.fields.some(field=>field.label==='alt'));assert.ok(!serialized.includes('SECRET'));assert.ok(!serialized.includes(sourceUrl));assert.ok(!serialized.includes('StringField-1'));
  assert.deepEqual(f.calls,[]);
});
test('unexpected operations have no focus/value/click side effects',()=>{
  const f=dialogFixture();assert.equal(f.run(payload('write-value')),null);assert.deepEqual(f.calls,[]);assert.equal(f.alt.field.value,'Bisheriger Alternativtext. ');
});
