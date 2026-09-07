"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { SwRegister } from "@/components/sw-register";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAtrium } from "@/lib/store";

function ThemedToaster() {
  const theme = useAtrium((s) => s.theme);
  return <Toaster theme={theme} position="top-center" />;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={350}>
        <SwRegister />
        {children}
        <ThemedToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
