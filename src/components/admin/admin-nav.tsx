"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface AdminNavProps {
  userEmail: string;
}

export function AdminNav({ userEmail }: AdminNavProps) {
  const pathname = usePathname();

  const isExactActive = (path: string) => pathname === path;
  const isSubActive = (path: string) =>
    path !== "/benjamin" && pathname.startsWith(path);

  const links = [
    {
      href: "/benjamin",
      label: "Visão Geral",
      active: isExactActive("/benjamin"),
    },
    {
      href: "/benjamin/clinicas",
      label: "Clínicas",
      active: isSubActive("/benjamin/clinicas"),
    },
    {
      href: "/benjamin/saude",
      label: "Saúde & Integrações",
      active: isSubActive("/benjamin/saude"),
    },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-teal-400">
              IRIS
            </span>
            <span className="rounded border border-rose-800/50 bg-rose-950/80 px-2 py-0.5 text-xs font-medium tracking-wider text-rose-300 uppercase">
              Super Admin
            </span>
          </div>

          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  link.active
                    ? "bg-slate-800 font-semibold text-white"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-200"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="hidden rounded bg-slate-900 px-2.5 py-1 font-mono text-slate-300 sm:inline-block">
            {userEmail}
          </span>
          <Link
            href="/agenda"
            className="rounded border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            Voltar ao App
          </Link>
        </div>
      </div>
    </header>
  );
}
