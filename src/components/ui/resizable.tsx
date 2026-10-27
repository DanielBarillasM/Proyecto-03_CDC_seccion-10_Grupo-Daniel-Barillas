import * as React from "react"
import { GripHorizontal, GripVertical } from "lucide-react"
import { Group, Panel, Separator } from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full", className)}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: React.ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean
}) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        "group relative z-20 flex w-1.5 items-center justify-center bg-transparent outline-none transition-colors hover:bg-primary/10 focus-visible:bg-primary/15 aria-[orientation=horizontal]:h-1.5 aria-[orientation=horizontal]:w-full",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-8 w-1 items-center justify-center rounded-full bg-border text-muted-foreground opacity-0 shadow-sm transition-all group-hover:w-4 group-hover:opacity-100 group-focus-visible:w-4 group-focus-visible:opacity-100 group-aria-[orientation=horizontal]:h-1 group-aria-[orientation=horizontal]:w-8 group-aria-[orientation=horizontal]:group-hover:h-4">
          <GripVertical className="size-3 group-aria-[orientation=horizontal]:hidden" />
          <GripHorizontal className="hidden size-3 group-aria-[orientation=horizontal]:block" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
