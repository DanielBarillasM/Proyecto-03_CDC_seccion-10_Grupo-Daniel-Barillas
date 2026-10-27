import { useRef, type MouseEvent, type PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

export function SpotlightSurface({ children, className }: PropsWithChildren<{ className?: string }>) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  function handlePointerMove(event: MouseEvent<HTMLDivElement>) {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds) return;
    surfaceRef.current?.style.setProperty("--spotlight-x", `${event.clientX - bounds.left}px`);
    surfaceRef.current?.style.setProperty("--spotlight-y", `${event.clientY - bounds.top}px`);
  }

  return (
    <div ref={surfaceRef} onMouseMove={handlePointerMove} className={cn("spotlight-surface", className)}>
      {children}
    </div>
  );
}
