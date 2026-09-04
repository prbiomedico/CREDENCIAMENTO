import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// Redesign bento/glow (2026-08-25, SIGCR-Design-System-Fase1.md Passo 2,
// PENDING_ACTIONS.md item 31): microinteração via CSS puro (scale + shadow),
// não `motion`, de propósito — Button é usado com `asChild` (Radix Slot) em
// vários lugares (ex: `<Button asChild><Link>`), e envolver isso num
// componente `motion.*` quebraria esse contrato sem necessidade real.
//
// Refinamento de raio/sombra (2026-08-27): `rounded-md` deriva de `--radius`
// (0.8rem, index.css) — não é mais um valor Tailwind fixo. `shadow-sm
// shadow-black/5` dá uma elevação de repouso quase imperceptível (mesmo
// padrão nas 3 variantes coloridas: default/destructive/outline); o glow
// colorido de hover já existente continua sendo o destaque visual forte.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Padrão único de "Fase 3" (SIGCR-Design-System, item de unificação
        // de clicáveis): antes desta variante, cada tela reescrevia sua
        // própria versão de "ação destrutiva secundária" à mão — pelo menos
        // 4 tons de vermelho diferentes coexistiam. `destructive-outline` é
        // pra ação destrutiva que não é a principal da tela (ex: "Revogar"
        // num card de lista); `destructive-ghost` é pra ação inline sem
        // moldura nenhuma (ex: "Excluir" ao lado de "Editar" numa linha).
        "destructive-outline":
          "border border-destructive/40 text-destructive shadow-sm shadow-black/5 hover:bg-destructive/10 hover:border-destructive/60",
        "destructive-ghost":
          "text-destructive hover:text-destructive hover:bg-destructive/10",
        outline:
          "border border-input bg-card text-foreground hover:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-accent underline-offset-4 hover:underline",
        // Pill de navegação (tabs/menubar) — mesmo raio (`rounded-md`, herdado
        // da base) e mesma família tipográfica dos botões, só muda a forma.
        // `data-[state=active]` é o atributo que o Radix Tabs já expõe no
        // TabsTrigger nativamente; MenubarTrigger não tem esse conceito (seu
        // `data-state` é sobre o próprio submenu estar aberto, não sobre rota
        // ativa), então app-menu-bar.js aplica a mesma cor via className
        // condicional em vez de depender do atributo — ver comentário lá.
        tab:
          "text-muted-foreground shadow-none hover:text-foreground hover:bg-muted data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none",
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

// bg-gradient-to-br é uma camada de background-image — o `cn()` deste projeto
// (lib/utils.js) é só um join de strings, sem merge de conflito Tailwind, e
// mesmo com merge um background-image sempre pinta por cima de um
// background-color, então nenhum `bg-{cor}` passado via `className` nunca
// conseguiria aparecer por cima do gradiente das variantes default/secondary.
// Achado no Passo 5 (PENDING_ACTIONS.md): quebrava silenciosamente os
// botões que usam cor própria pra sinalizar uma ação diferente do azul da
// marca (ex: "Excluir" vermelho, "Concluir"/baixar comprovante verde) — eles
// saíam sempre azuis em produção. Quando o caller passa seu próprio `bg-`,
// removemos o gradiente da variante pra a cor customizada valer de verdade.
const GRADIENT_BG = {};

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  const gradientClass = GRADIENT_BG[variant || "default"];
  const hasCustomBg = gradientClass && className && /\bbg-/.test(className);
  let variantClasses = buttonVariants({ variant, size });
  if (hasCustomBg) {
    variantClasses = variantClasses.replace(gradientClass, "").replace(/\s+/g, " ").trim();
  }
  return (
    <Comp
      className={cn(variantClasses, className)}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
