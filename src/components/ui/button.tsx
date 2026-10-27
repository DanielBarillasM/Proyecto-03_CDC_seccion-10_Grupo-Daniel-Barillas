import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const variantClasses = {
  default: "bg-primary text-primary-foreground hover:bg-primary-hover",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  outline: "border-border bg-background/55 text-foreground hover:border-primary/25 hover:bg-accent",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost:
    "border-transparent bg-transparent shadow-none hover:bg-muted active:translate-x-0 active:translate-y-0",
  link:
    "border-transparent bg-transparent shadow-none text-primary underline-offset-4 hover:underline active:translate-x-0 active:translate-y-0",
}

const sizeClasses = {
  default: "h-9 px-4 py-2 has-[>svg]:px-3",
  sm: "h-8 gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
  lg: "h-10 px-6 has-[>svg]:px-4",
  icon: "size-9",
  "icon-sm": "size-8",
}

type ButtonStyleProps = {
  variant?: keyof typeof variantClasses
  size?: keyof typeof sizeClasses
}

function buttonVariants({ variant = "default", size = "default", className }: ButtonStyleProps & { className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent font-head text-sm font-semibold whitespace-nowrap shadow-xs transition-[color,background-color,border-color,box-shadow,transform] outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    variantClasses[variant],
    sizeClasses[size],
    className
  )
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  ButtonStyleProps & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  )
}

export { Button, buttonVariants }
