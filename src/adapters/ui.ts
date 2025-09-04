/**
 * UI adapter
 * WHAT: Keep DOM in sync with USM: sets data-state on <html>, toggles [data-show],
 *       lets you set text/classes from states safely.
 */
import { createAdapter } from '../usm-core';

export interface UIAdapterOpts {
  root?: HTMLElement; // default document.documentElement
}

export function uiAdapter({ root }: UIAdapterOpts = {}){
  return createAdapter('ui','1.2.0',['ui'], (usm)=>{
    const host = root || document.documentElement;

    function setText(sel: string, text: string){
      document.querySelectorAll(sel).forEach(el => { (el as HTMLElement).textContent = text; });
    }
    function setHTML(sel: string, html: string){
      document.querySelectorAll(sel).forEach(el => { (el as HTMLElement).innerHTML = html; });
    }
    function setClass(sel: string, className: string, on: boolean){
      document.querySelectorAll(sel).forEach(el => (on ? el.classList.add(className) : el.classList.remove(className)));
    }

    (usm.context as any).ui = { setText, setHTML, setClass };

    return {
      onEnter({ state }){
        host.dataset.state = state; // <html data-state="play">
        // Toggle visibility for any element with data-show="stateName"
        document.querySelectorAll<HTMLElement>('[data-show]').forEach(el=>{
          const want = (el.getAttribute('data-show')||'').split(/\s*,\s*|\s+/);
          el.style.display = want.includes(state) ? '' : 'none';
        });
      },
      onStop(){ delete host.dataset.state; }
    };
  });
}