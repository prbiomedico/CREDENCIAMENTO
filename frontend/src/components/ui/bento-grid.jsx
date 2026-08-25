import * as React from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"
import { Card } from "./card"

// BentoGrid/BentoCard (2026-08-25, SIGCR-Design-System-Fase1.md Passo 3,
// PENDING_ACTIONS.md item 32) — wrapper sobre ui/card.jsx, não substitui.
// Primeiro uso real: Landing pública (Passo 4). `motion` aqui é seguro
// (diferente do Button) porque BentoCard nunca precisa de `asChild` — quem
// usa o grid passa conteúdo como children, não substitui a tag raiz.

const SIZE_CLASSES = {
  "1x1": "col-span-1 row-span-1",
  "2x1": "col-span-2 row-span-1",
  "1x2": "col-span-1 row-span-2",
  "2x2": "col-span-2 row-span-2",
}

const BentoGrid = React.forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "grid grid-cols-2 md:grid-cols-4 auto-rows-[minmax(160px,auto)] gap-4",
      className
    )}
    {...props}>
    {children}
  </div>
))
BentoGrid.displayName = "BentoGrid"

// `size` aceita "1x1"|"2x1"|"1x2"|"2x2" (célula base é 1 coluna em telas
// pequenas — 2x1/2x2 só ocupam 2 colunas a partir de md, pra não quebrar o
// grid em telas de 2 colunas no mobile). `interactive=false` desliga o
// hover pra células que só exibem dado, sem ação nenhuma associada.
const BentoCard = React.forwardRef(
  ({ className, size = "1x1", interactive = true, children, ...props }, ref) => {
    const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES["1x1"]
    const responsiveSizeClass = sizeClass.replace(/col-span-2/, "col-span-1 md:col-span-2")
    return (
      <motion.div
        className={cn(responsiveSizeClass)}
        whileHover={interactive ? { scale: 1.015 } : undefined}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}>
        <Card
          ref={ref}
          className={cn(
            "h-full w-full overflow-hidden relative",
            interactive &&
              "cursor-pointer hover:border-primary/40 hover:shadow-[0_0_32px_-8px_hsl(var(--primary)/0.35)]",
            className
          )}
          {...props}>
          {children}
        </Card>
      </motion.div>
    )
  }
)
BentoCard.displayName = "BentoCard"

export { BentoGrid, BentoCard }
