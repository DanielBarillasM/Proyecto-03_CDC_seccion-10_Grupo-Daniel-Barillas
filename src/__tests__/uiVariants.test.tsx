import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge, badgeVariants } from "../components/ui/badge";
import { Button, buttonVariants } from "../components/ui/button";
import { Tabs, TabsList, tabsListVariants } from "../components/ui/tabs";

describe("UI class variants", () => {
  it("preserves defaults and combines button variants with sizes", () => {
    expect(buttonVariants()).toContain("bg-primary");
    expect(buttonVariants()).toContain("h-9");
    expect(buttonVariants({ variant: "outline", size: "sm" })).toContain("bg-background");
    expect(buttonVariants({ variant: "outline", size: "sm" })).toContain("h-8");
    const markup = renderToStaticMarkup(<Button variant="ghost" size="icon-sm" className="size-6">Run</Button>);
    expect(markup).toContain('data-variant="ghost"');
    expect(markup).toContain("size-6");
    expect(markup).not.toContain("size-8");
  });

  it("preserves badge variants and caller class overrides", () => {
    expect(badgeVariants()).toContain("bg-primary");
    const markup = renderToStaticMarkup(<Badge variant="destructive" className="h-7">Error</Badge>);
    expect(markup).toContain("bg-destructive");
    expect(markup).toContain("h-7");
    expect(markup).not.toContain("h-5");
  });

  it("preserves both tab list styles", () => {
    expect(tabsListVariants()).toContain("border");
    expect(tabsListVariants()).toContain("rounded-xl");
    expect(tabsListVariants({ variant: "line" })).toContain("bg-transparent");
    const markup = renderToStaticMarkup(<Tabs><TabsList variant="line" className="gap-3" /></Tabs>);
    expect(markup).toContain('data-variant="line"');
    expect(markup).toContain("gap-3");
    expect(markup).not.toContain("gap-1 ");
  });
});
