import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Menubar as MenubarPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Menubar({ className, ...props }: React.ComponentProps<typeof MenubarPrimitive.Root>) {
  return (
    <MenubarPrimitive.Root
      data-slot="menubar"
      className={cn("flex h-10 items-center gap-1 border-b bg-card/70 px-2", className)}
      {...props}
    />
  )
}

function MenubarMenu({ ...props }: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />
}

function MenubarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Trigger>) {
  return (
    <MenubarPrimitive.Trigger
      data-slot="menubar-trigger"
      className={cn(
        "flex items-center rounded-lg px-2.5 py-1.5 text-xs font-head font-medium text-muted-foreground outline-none transition select-none data-highlighted:bg-accent data-highlighted:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function MenubarContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content>) {
  return (
    <MenubarPrimitive.Portal>
      <MenubarPrimitive.Content
        data-slot="menubar-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-48 rounded-xl border bg-popover/95 p-1.5 text-popover-foreground shadow-xl backdrop-blur-xl",
          className
        )}
        {...props}
      />
    </MenubarPrimitive.Portal>
  )
}

function MenubarItem({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item> & { inset?: boolean }) {
  return (
    <MenubarPrimitive.Item
      data-slot="menubar-item"
      data-inset={inset}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-foreground data-[inset]:pl-8 [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function MenubarCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem>) {
  return (
    <MenubarPrimitive.CheckboxItem
      data-slot="menubar-checkbox-item"
      className={cn(
        "relative flex items-center gap-2 rounded-lg py-2 pr-2 pl-8 text-sm outline-none transition select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-foreground",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="absolute left-2 flex size-3.5 items-center justify-center">
        <MenubarPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.CheckboxItem>
  )
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
  return (
    <MenubarPrimitive.Separator
      data-slot="menubar-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function MenubarShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menubar-shortcut"
      className={cn("ml-auto text-xs tracking-widest text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarCheckboxItem,
  MenubarSeparator,
  MenubarShortcut,
}
