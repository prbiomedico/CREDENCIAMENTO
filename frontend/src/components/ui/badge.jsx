import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// Redesign bento/glow (item 31): transition-all no lugar de transition-colors
// (a maioria dos usos já sobrescreve bg/border via className com cores por
// perfil/status — a troca só garante que essas mudanças de estado, quando a
// tela já anima algo em cima, ficam suaves em vez de instantâneas).
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }
