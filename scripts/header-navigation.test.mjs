import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import fs from 'node:fs/promises';
export function runHeaderNavigationProviderTests(source,css,{historicalSource=null,register=null}={}){
 const checks=[];const check=(name,fn)=>{if(register)register(name,fn);else fn();checks.push({name,passed:!register});};
 function fixture({withAddon=true,candidateSource=source,interListenerCheckpoints=false}={}){
  const micros=[],frames=[],observers=[],focusCalls=[],nativeCalls=[],providerObservations=[],keyObservations=[];
  class Node{
   constructor(name,attrs={}){this.name=name;this.attrs={...attrs};this.parentElement=null;this.nodeType=1;this.isConnected=true;this.listeners=new Map();this.children=[];this.hover=false;this.hiddenDesktop=false;}
   get id(){return this.attrs.id||'';}getAttribute(k){return this.attrs[k]??null;}
   setAttribute(k,v){this.attrs[k]=String(v);for(const observer of observers)if(observer.header?.contains(this)&&observer.options.attributeFilter.includes(k))observer.records.push({type:'attributes',target:this,attributeName:k});}
   removeAttribute(k){delete this.attrs[k];}
   addEventListener(type,callback,options){const list=this.listeners.get(type)||[];list.push({callback,capture:options===true||options?.capture});this.listeners.set(type,list);}
   emit(type,event={}){for(const row of this.listeners.get(type)||[])row.callback(event);}
   contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
   matches(selector){return selector===':hover'&&this.hover;}
   append(node){node.parentElement=this;this.children.push(node);return node;}
   querySelector(selector){if(selector===':scope > button.header-nav-folder-title')return this.button;if(selector===':scope > .header-nav-folder-content')return this.panel;return null;}
   querySelectorAll(selector){if(selector==='.header-display-desktop .header-nav-item--folder')return this.folders;return[];}
   focus(){document.activeElement=this;focusCalls.push(this);}
   getBoundingClientRect(){const visible=this===this.folder?.panel?panelShown(this.folder):!this.hiddenDesktop;return{x:0,top:0,bottom:visible?50:0,right:visible?200:0,width:visible?200:0,height:visible?50:0};}
  }
  const root=new Node('html'),body=root.append(new Node('body')),header=body.append(new Node('header')),outside=body.append(new Node('outside'));
  const folders=[];
  for(const [id,hidden]of[['wildlife',false],['reisen',true],['wildlife',true],['reisen',true]]){const folder=header.append(new Node('folder',{'class':'header-nav-item header-nav-item--folder'}));folder.hiddenDesktop=hidden;
   folder.button=folder.append(new Node('button',{'class':'header-nav-folder-title','aria-expanded':'false','aria-controls':id,'data-href':id==='reisen'?'/reisen-1':'/wildlife'}));
   folder.panel=folder.append(new Node('panel',{id,'class':'header-nav-folder-content'}));folder.panel.folder=folder;
   folder.link=folder.panel.append(new Node('a',{href:'https://www.fnwildlifetravel.de/'+id+'/uebersicht'}));folders.push(folder);
  }
  header.folders=folders;const folder=folders[0],button=folder.button,panel=folder.panel,link=folder.link;
  const mobile=header.append(new Node('mobile-folder',{'data-folder':'/wildlife'}));
  const document={documentElement:root,activeElement:outside,readyState:'complete',querySelectorAll:selector=>selector==='header'?[header]:[],addEventListener(){}};
  const window={listeners:new Map(),addEventListener(type,callback){const list=this.listeners.get(type)||[];list.push(callback);this.listeners.set(type,list);}};
  class Observer{constructor(callback){this.callback=callback;this.records=[];observers.push(this);}observe(node,options){this.header=node;this.options=options;}takeRecords(){const rows=this.records;this.records=[];return rows;}}
  function panelShown(f){return!f.hiddenDesktop&&f.getAttribute('data-fn-header-dismissed')!=='true'&&(f.hover||f.button.getAttribute('aria-expanded')==='true');}
  function getComputedStyle(node){return{display:node===node.folder?.panel&&!panelShown(node.folder)?'none':'block',visibility:'visible',opacity:'1'};}
  const context={document,window,MutationObserver:Observer,requestAnimationFrame:cb=>frames.push(cb),queueMicrotask:cb=>micros.push(cb),getComputedStyle,WeakMap,WeakSet,Set,Promise};
  function install(){vm.runInNewContext(candidateSource,context);}
  function flush(){let rounds=0;while(micros.length||frames.length||observers.some(o=>o.records.length)){assert(++rounds<40,'Event-driven update must settle');while(micros.length)micros.shift()();for(const o of observers){if(o.records.length)o.callback(o.takeRecords());}const current=frames.splice(0);for(const cb of current)cb();}}
  if(withAddon){install();flush();}
  const event=(key,target=button)=>({key,target,relatedTarget:null,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){throw Error('Candidate must preserve propagation');}});
  function hover(value){folder.hover=value;folder.emit(value?'pointerenter':'pointerleave',event('',button));flush();}
  function nativeClick(event){nativeCalls.push('click');providerObservations.push({visible:panelShown(folder),dismissed:folder.getAttribute('data-fn-header-dismissed'),expanded:button.getAttribute('aria-expanded')});event.preventDefault();}
  function microCheckpoint(){let rounds=0;while(micros.length||observers.some(o=>o.records.length)){assert(++rounds<30);while(micros.length)micros.shift()();for(const o of observers)if(o.records.length)o.callback(o.takeRecords());}}
  function click({provider=true,leaveBeforeFrame=false}={}){const e=event('',button);button.emit('click',e);if(interListenerCheckpoints)microCheckpoint();if(provider)nativeClick(e);if(interListenerCheckpoints)microCheckpoint();if(leaveBeforeFrame){folder.hover=false;folder.emit('pointerleave',event('',button));if(interListenerCheckpoints)microCheckpoint();}flush();return e;}
  function key(code,{shiftKey=false}={}){
   const e=event(code==='Space'?' ':code,document.activeElement);e.code=code;e.shiftKey=shiftKey;
   for(const cb of window.listeners.get('keydown')||[])cb(e);
   microCheckpoint();
   keyObservations.push({code,expanded:button.getAttribute('aria-expanded'),dismissed:folder.getAttribute('data-fn-header-dismissed')});
   nativeCalls.push('keydown:'+code);
   // Exact behavior of the bound provider leaf: click is preventDefault only;
   // Escape sets false/focus, Enter/Space toggle the attribute on the active button.
   if(code==='Escape'){e.preventDefault();button.setAttribute('aria-expanded','false');button.focus();}
   else if((code==='Enter'||code==='Space')&&document.activeElement===button){e.preventDefault();button.setAttribute('aria-expanded',button.getAttribute('aria-expanded')==='false');}
   microCheckpoint();flush();return e;
  }
  const escape=()=>key('Escape');
  function focus(node){const before=document.activeElement;document.activeElement=node;if(folder.contains(before))folder.emit('focusout',{relatedTarget:node});if(folder.contains(node))folder.emit('focusin',{relatedTarget:before});flush();}
  const targetSnapshot=()=>JSON.stringify(folders.map(f=>({href:f.link.getAttribute('href'),dataHref:f.button.getAttribute('data-href'),controls:f.button.getAttribute('aria-controls'),panel:f.panel.id})));
  return{root,document,window,folder,button,panel,link,outside,mobile,folders,hover,click,escape,focus,flush,install,nativeCalls,focusCalls,providerObservations,keyObservations,key,panelShown:()=>panelShown(folder),targetSnapshot};
 }

 const sourcePath={click:'provider only preventDefault',keyboard:'provider code Escape=false/focus; Enter/Space native ARIA toggle'};
 check('baseline-hover-ARIA-and-Escape-defect',()=>{const f=fixture({withAddon:false});f.hover(true);assert(f.panelShown());assert.equal(f.button.getAttribute('aria-expanded'),'false');f.focus(f.button);f.key('Escape');assert(f.panelShown());});
 if(historicalSource)check('RED private3-real-provider-no-op-click-and-keyboard-remain-dismissed',()=>{const f=fixture({candidateSource:historicalSource,interListenerCheckpoints:true});f.hover(true);f.focus(f.button);f.key('Escape');f.click();assert.equal(f.panelShown(),false);f.key('Enter');assert.equal(f.panelShown(),false);});
 check('hover-status-and-leave-do-not-latch',()=>{const f=fixture();f.hover(true);assert.equal(f.button.getAttribute('aria-expanded'),'true');f.focus(f.button);f.hover(false);assert.equal(f.panelShown(),false);assert.equal(f.button.getAttribute('aria-expanded'),'false');});
 check('Escape-runs-after-native-handler-observes-truthful-open-state',()=>{const f=fixture({interListenerCheckpoints:true});f.hover(true);f.focus(f.link);const e=f.key('Escape');assert.equal(f.keyObservations[0].expanded,'true');assert.equal(f.keyObservations[0].dismissed,null);assert.equal(f.panelShown(),false);assert.equal(f.button.getAttribute('aria-expanded'),'false');assert.equal(f.document.activeElement,f.button);assert.equal(e.defaultPrevented,true);});
 check('ONE-real-no-op-provider-click-resets-only-own-dismissal',()=>{const f=fixture({interListenerCheckpoints:true});f.hover(true);f.focus(f.button);f.key('Escape');f.click();assert.equal(f.providerObservations[0].dismissed,'true');assert(f.panelShown());assert.equal(f.button.getAttribute('aria-expanded'),'true');assert.equal(f.nativeCalls.filter(v=>v==='click').length,1);assert.equal(f.folder.getAttribute('data-fn-header-dismissed'),null);});
 check('second-mouse-click-retains-original-no-op-provider-concept',()=>{const f=fixture();f.hover(true);f.focus(f.button);f.key('Escape');f.click();f.click();assert(f.panelShown());assert.equal(f.nativeCalls.filter(v=>v==='click').length,2);});
 check('native-Enter-and-Space-open-and-close-after-dismissal',()=>{const f=fixture({interListenerCheckpoints:true});f.hover(true);f.focus(f.button);f.key('Escape');f.key('Enter');assert(f.panelShown());assert.equal(f.button.getAttribute('aria-expanded'),'true');f.key('Space');assert.equal(f.panelShown(),false);f.key('Space');assert(f.panelShown());});
 check('leave-reenter-restores-original-hover',()=>{const f=fixture();f.hover(true);f.focus(f.button);f.key('Escape');f.hover(false);f.hover(true);assert(f.panelShown());});
 check('duplicate-IDs-mobile-and-targets-remain-scoped',()=>{const f=fixture(),before=f.targetSnapshot();f.hover(true);f.focus(f.button);f.key('Escape');f.click();assert.equal(f.targetSnapshot(),before);assert.equal(f.folders[2].button.getAttribute('aria-expanded'),'false');assert.equal(f.mobile.listeners.size,0);});
 check('idempotent-install-and-no-Vendor-History-prototype-patch',()=>{const f=fixture(),count=f.window.listeners.get('keydown').length;f.install();assert.equal(f.window.listeners.get('keydown').length,count);assert(!/\b(?:pushState|replaceState|dispatchEvent|preventDefault|stopPropagation|stopImmediatePropagation)\s*\(/.test(source));assert(!/\.prototype\b|innerHTML|outerHTML|\.href\s*=/.test(source));});
 check('CSS-only-dismissed-desktop-folder',()=>{assert(css.includes('header .header-display-desktop .header-nav-item--folder[data-fn-header-dismissed="true"] > .header-nav-folder-content'));assert.equal((css.match(/{/g)||[]).length,1);assert(!/\b(?:color|background|font|order|grid|width|height)\s*:/.test(css));});
 return{kind:'actual-provider-path-small-fake-DOM-regression-v1',passed:!register,count:checks.length,checks,sourcePath,limits:['Bound vendor source was read, not imported or activated. This fake DOM reproduces its actual click/keyboard leaf behavior.','Actual native mouse/keyboard/mobile approval remains mandatory; source matches do not constitute actual listener execution evidence.']};
}

const source=await fs.readFile(new URL('../header-navigation.js',import.meta.url),'utf8');
const fullCSS=await fs.readFile(new URL('../docs/squarespace-custom.css',import.meta.url),'utf8');
const rules=[...fullCSS.matchAll(/header\s+\.header-display-desktop\s+\.header-nav-item--folder\[data-fn-header-dismissed="true"\]\s*>\s*\.header-nav-folder-content\s*\{[^}]*\}/g)];
assert.equal(rules.length,1);
runHeaderNavigationProviderTests(source,rules[0][0],{register:test});
