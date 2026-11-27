"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
