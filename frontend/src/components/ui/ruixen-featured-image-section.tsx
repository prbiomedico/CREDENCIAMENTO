"use client";
// Adapted from the Ruixen component supplied by the user (21st.dev).
// Real operational panels replace the marketing screenshot; no remote image or unused Lottie player.
import { useId, useRef, type ComponentType, type ReactNode, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
export type FeatureTab = { id:string; title:string; description:string; icon:ComponentType<{className?:string}>; count?:number };
type Props={tabs:FeatureTab[]; selectedTab:number; onSelect:(index:number)=>void; children:ReactNode; label?:string};
export default function RuixenFeaturedImageSection({tabs,selectedTab,onSelect,children,label='Visões do painel'}:Props) {
 const id=useId();const refs=useRef<Array<HTMLButtonElement|null>>([]);const reduce=useReducedMotion();
 function key(e:KeyboardEvent<HTMLButtonElement>,i:number){
  let next=i;if(e.key==='ArrowRight')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;
  e.preventDefault();onSelect(next);refs.current[next]?.focus();
 }
 return <section className="space-y-4" aria-label={label}>
  <div role="tablist" aria-label={label} className="grid gap-2 rounded-xl border border-border bg-muted/40 p-2 sm:grid-cols-3">
   {tabs.map((tab,i)=><button key={tab.id} ref={el=>{refs.current[i]=el;}} type="button" role="tab" id={`${id}-${tab.id}-tab`} aria-controls={`${id}-panel`} aria-selected={selectedTab===i} tabIndex={selectedTab===i?0:-1} onClick={()=>onSelect(i)} onKeyDown={e=>key(e,i)} className={`relative flex min-h-16 items-center gap-3 overflow-hidden rounded-lg border px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedTab===i?'border-[hsl(var(--sigcr-accent))] bg-card text-foreground shadow-sm':'border-transparent text-muted-foreground hover:bg-card/70'}`}>
    {selectedTab===i&&!reduce&&<motion.span aria-hidden="true" layoutId={`${id}-selection`} className="pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded bg-[hsl(var(--sigcr-accent))]" transition={{duration:.18}}/>}
    <tab.icon className="h-4 w-4 shrink-0"/><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{tab.title}</span><span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{tab.description}</span></span>{tab.count!==undefined&&<span className="rounded bg-muted px-2 py-1 text-xs tabular-nums">{tab.count}</span>}
   </button>)}
  </div>
  <motion.div key={tabs[selectedTab]?.id} role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tabs[selectedTab]?.id}-tab`} initial={reduce?false:{opacity:.5}} animate={{opacity:1}} transition={{duration:reduce?0:.15}}>{children}</motion.div>
 </section>;
}
