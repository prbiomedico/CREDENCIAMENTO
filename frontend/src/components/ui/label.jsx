import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

// Redesign bento/glow (item 31): sem mudança de cor/tamanho — Label é usado
// puro em 12 arquivos, e o tom neutro atual já está correto pro papel de
// rótulo de formulário. Só a transição, pra combinar com input/select
// quando algum estado (erro, foco do campo associado) mudar a cor do texto.
const labelVariants = cva(
  "text-sm font-medium leading-none transition-colors duration-200 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

const Label = React.forwardRef(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn(labelVariants(), className)} {...props} />
))
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
