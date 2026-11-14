import { Suspense } from "react";
import { PanelShell } from "@/components/panel-shell";

/** Static loading frame; the shell reads the URL, which only exists at request time. */
function ShellFallback() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <div className="hidden border-r border-line bg-white lg:block" />
      <div className="p-6">
        <div className="h-10 w-64 animate-pulse rounded-xl bg-line/50" />
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-line/40" />
      </div>
    </div>
  );
}

export default function PanelLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellFallback />}>
      <PanelShell>{children}</PanelShell>
    </Suspense>
  );
}
