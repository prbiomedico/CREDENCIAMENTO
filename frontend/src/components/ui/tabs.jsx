import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props} />
))
TabsList.displayName = TabsPrimitive.List.displayName

// Padrão único de clicáveis (Fase 3): antes, o item ativo virava um fundo
// neutro (`bg-background`/`shadow` puro shadcn) — nada a ver com a cor de
// marca que já era usada no AppMenuBar do Dashboard. Agora os dois puxam a
// mesma variante `tab` de ui/button.jsx, então "Portarias|Editais" e
// "Dashboard|Transparência|Notificações" têm exatamente a mesma cor de
// ativo, raio e tipografia.
const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(buttonVariants({ variant: "tab" }), className)}
    {...props} />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
