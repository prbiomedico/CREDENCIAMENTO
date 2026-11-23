import React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon, Monitor } from 'lucide-react';
export default function ThemeToggle() {
 const {theme='system',setTheme}=useTheme();
 return <div role="group" aria-label="Aparência do sistema" className="inline-flex shrink-0 items-center rounded-lg border border-border bg-card p-1 text-foreground">
  {[['light','Claro',Sun],['dark','Escuro',Moon],['system','Automático',Monitor]].map(([value,label,Icon])=><button key={value} type="button" aria-label={`Tema ${label.toLowerCase()}`} aria-pressed={theme===value} title={label} onClick={()=>setTheme(value)} className={`inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${theme===value?'bg-muted font-semibold text-foreground':'text-muted-foreground hover:bg-muted'}`}><Icon className="h-3.5 w-3.5"/><span className="hidden xl:inline">{label}</span></button>)}
 </div>;
}
