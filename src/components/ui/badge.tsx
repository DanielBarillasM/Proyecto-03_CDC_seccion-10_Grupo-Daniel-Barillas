import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const variantClasses = {
  default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
  secondary:
    "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
  destructive:
    "bg-destructive text-destructive-foreground [a]:hover:bg-destructive/90",
  outline:
    "bg-transparent text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
  ghost:
    "border-transparent bg-transparent shadow-none hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
  link: "border-transparent bg-transparent shadow-none text-primary underline-offset-4 hover:underline",
}

function badgeVariants({ variant = "default" }: { variant?: keyof typeof variantClasses } = {}) {
  return cn(
    "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-head font-medium whitespace-nowrap shadow-xs transition-[color,background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring/40 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3!",
    variantClasses[variant]
  )
}

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  { variant?: keyof typeof variantClasses; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
