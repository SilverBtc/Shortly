"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, Eye, KanbanSquare, Settings as SettingsIcon, Home, AudioLines, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import "./globals.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 } },
});

const NAV = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/wizard", label: "Wizard", icon: Wand2 },
  { href: "/voice-design", label: "Voice Design", icon: AudioLines },
  { href: "/curation", label: "Curation", icon: Eye },
  { href: "/spy", label: "Spy", icon: Clapperboard },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/settings", label: "Réglages", icon: SettingsIcon },
];

function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-blue-600 text-lg font-black text-black">
          TT
        </div>
        <div>
          <div className="text-sm font-bold leading-none text-white">TikTok Studio</div>
          <div className="mt-1 text-[10px] uppercase tracking-widest text-zinc-500">Automation 9:16</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-800 text-amber-400"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-800 p-4 text-[11px] leading-relaxed text-zinc-600">
        FastAPI · Next.js 15 · Remotion
        <br />
        Qwen3-TTS · Whisper · 100% local
      </div>
    </aside>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <QueryClientProvider client={queryClient}>
          <Sidebar />
          <main className="ml-60 min-h-screen px-8 py-6">{children}</main>
        </QueryClientProvider>
      </body>
    </html>
  );
}
