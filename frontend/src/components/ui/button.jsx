import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// Redesign bento/glow (2026-08-25, SIGCR-Design-System-Fase1.md Passo 2,
// PENDING_ACTIONS.md item 31): microinteração via CSS puro (scale + shadow),
// não `motion`, de propósito — Button é usado com `asChild` (Radix Slot) em
// vários lugares (ex: `<Button asChild><Link>`), e envolver isso num
// componente `motion.*` quebraria esse contrato sem necessidade real.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary to-primary-600 text-primary-foreground shadow hover:shadow-[0_0_24px_-4px_hsl(var(--primary)/0.6)] hover:brightness-110",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:shadow-[0_0_20px_-4px_hsl(var(--destructive)/0.55)] hover:brightness-110",
        outline:
          "border border-input shadow-sm hover:border-primary/40 hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-gradient-to-br from-secondary to-secondary-600 text-secondary-foreground shadow-sm hover:shadow-[0_0_20px_-4px_hsl(var(--secondary)/0.55)] hover:brightness-110",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
