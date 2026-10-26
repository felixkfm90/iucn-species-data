/* FN header navigation accessibility 1.0.0. */
(() => {
  'use strict';
  const READY='data-fn-header-hover-a11y', DISMISSED='data-fn-header-dismissed';
  const root=document.documentElement;
  if(root.getAttribute(READY)==='1.0.0')return;
  const states=new WeakMap(), entries=new Set(), observed=new WeakSet();
  let queued=false;
  function shown(node){
    if(!node||!node.isConnected)return false;
    const rect=node.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return false;
    for(let current=node;current&&current.nodeType===1;current=current.parentElement){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity||1)<=0.02)return false;}
    return true;
  }
  function hovering(state){return state.folder.matches(':hover');}
  function writeExpanded(state,value){if(state.button.getAttribute('aria-expanded')!==String(value))state.button.setAttribute('aria-expanded',String(value));}
  function clearTemporary(state){if(state.temporaryReported){state.temporaryReported=false;writeExpanded(state,false);}}
  function sync(state){
    if(!state.folder.isConnected){entries.delete(state);return;}
    if(state.actionPending)return;
    if(state.folder.getAttribute(DISMISSED)==='true'){writeExpanded(state,false);return;}
    const visible=shown(state.panel),expanded=state.button.getAttribute('aria-expanded')==='true';
    if(visible&&!expanded){state.temporaryReported=true;writeExpanded(state,true);}
    else if(!visible&&expanded){state.temporaryReported=false;writeExpanded(state,false);}
  }
  function afterNative(state,action){
    state.actionPending=true;
    requestAnimationFrame(()=>{state.actionPending=false;if(state.folder.isConnected)action();schedule();});
  }
  function dismiss(state){
    state.temporaryReported=false;state.folder.setAttribute(DISMISSED,'true');writeExpanded(state,false);
    if(state.folder.contains(document.activeElement))state.button.focus({preventScroll:true});
    if(!hovering(state))state.folder.removeAttribute(DISMISSED);
  }
  function wire(folder){
    if(states.has(folder))return;
    const button=folder.querySelector(':scope > button.header-nav-folder-title');
    const panel=folder.querySelector(':scope > .header-nav-folder-content');
    if(!button||!panel||!panel.id||button.getAttribute('aria-controls')!==panel.id)return;
    const state={folder,button,panel,temporaryReported:false,actionPending:false};states.set(folder,state);entries.add(state);
    folder.addEventListener('pointerenter',schedule);
    folder.addEventListener('pointerleave',()=>{folder.removeAttribute(DISMISSED);if(!panel.contains(document.activeElement))clearTemporary(state);schedule();});
    folder.addEventListener('focusin',schedule);
    folder.addEventListener('focusout',event=>{
      if(!folder.contains(event.relatedTarget)){clearTemporary(state);if(!hovering(state))folder.removeAttribute(DISMISSED);}
      else if(!panel.contains(event.relatedTarget)&&!hovering(state))clearTemporary(state);
      schedule();
    });
    button.addEventListener('click',()=>{
      if(folder.getAttribute(DISMISSED)!=='true')return;
      state.temporaryReported=false;
      // The provider click only prevents navigation. Reset our own dismissal;
      // existing hover CSS and the observed native keyboard state still decide visibility.
      afterNative(state,()=>folder.removeAttribute(DISMISSED));
    },true);
  }
  const observer=new MutationObserver(()=>schedule());
  function discover(){
    for(const header of document.querySelectorAll('header')){
      if(!observed.has(header)){observed.add(header);observer.observe(header,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','aria-expanded']});}
      for(const folder of header.querySelectorAll('.header-display-desktop .header-nav-item--folder'))wire(folder);
    }
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;discover();for(const state of entries)sync(state);});}
  window.addEventListener('keydown',event=>{
    const code=event.code||(event.key===' '?'Space':event.key);
    if(code==='Escape'){
      for(const state of entries)if(shown(state.panel)&&(state.folder.contains(document.activeElement)||hovering(state)))afterNative(state,()=>dismiss(state));
    }else if(code==='Enter'||code==='Space'){
      for(const state of entries)if(document.activeElement===state.button){
        const wasVisible=shown(state.panel),wasDismissed=state.folder.getAttribute(DISMISSED)==='true';state.temporaryReported=false;
        afterNative(state,()=>{
          if(state.button.getAttribute('aria-expanded')==='true')state.folder.removeAttribute(DISMISSED);
          else if(wasVisible||wasDismissed)state.folder.setAttribute(DISMISSED,'true');
        });
      }
    }
  },true);
  window.addEventListener('resize',()=>{for(const state of entries)if(state.temporaryReported&&!hovering(state)&&!state.panel.contains(document.activeElement))clearTemporary(state);schedule();});
  window.addEventListener('pageshow',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{discover();schedule();},{once:true});
  else{discover();schedule();}
  root.setAttribute(READY,'1.0.0');
})();
