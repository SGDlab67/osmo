"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChartLine, ChevronLeft, House, QrCode, Search, Users } from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { Avatar, Mark } from "./ui";

export function Screen({ children, tabs = true, className = "" }: { children: ReactNode; tabs?: boolean; className?: string }) {
  return (
    <div className={`min-h-full ${tabs ? "pb-28" : "pb-8"} ${className}`}>
      {children}
      {tabs && <TabBar />}
    </div>
  );
}

export function TabBar() {
  const path = usePathname();
  const { me, requests } = useStore();
  const waiting = me ? requests.filter((r) => r.payer === me.handle && r.status === "open").length : 0;
  // Tapping the tab you're already on scrolls back to the top, like iOS.
  const toTop = () => {
    const box = document.querySelector(".frame-scroll");
    if (box && box.scrollHeight > box.clientHeight) box.scrollTo({ top: 0, behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const tab = (href: string, label: string, icon: ReactNode, dot = false) => {
    const on = href === "/" ? path === "/" : path.startsWith(href);
    return (
      <Link
        href={href}
        onClick={(e) => {
          if (on && path === href) {
            e.preventDefault();
            toTop();
          }
        }}
        aria-current={on ? "page" : undefined}
        className={`relative flex w-16 flex-col items-center gap-1 pt-2 text-[11px] font-medium ${on ? "text-ink" : "text-brand/70"}`}
      >
        <span className={`absolute top-0 h-[3px] rounded-full bg-ink transition-all duration-200 ${on ? "w-6 opacity-100" : "w-0 opacity-0"}`} />
        <span className="relative">
          {icon}
          {dot && <span className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-[#E5484D] ring-2 ring-white" />}
        </span>
        <span className={on ? "font-semibold" : ""}>{label}</span>
      </Link>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] border-t border-line bg-white/90 pb-[max(env(safe-area-inset-bottom),10px)] backdrop-blur-xl">
      <div className="flex items-end justify-between px-3">
        {tab("/", "Home", <House size={24} />)}
        {tab("/friends", "Friends", <Users size={24} />)}
        <Link href="/pay" className="-mt-7 flex w-20 flex-col items-center gap-1 text-[11px] font-medium text-brand">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-[#2A62A0] to-brand shadow-lg shadow-brand/30 ring-4 ring-white">
            <Mark size={30} className="text-white" />
          </span>
          Pay/Request
        </Link>
        {tab("/portfolio", "Portfolio", <ChartLine size={24} />)}
        {tab("/me", "Me", me ? <Avatar handle={me.handle} size={26} /> : <span className="block h-[26px] w-[26px] rounded-full bg-chip" />, waiting > 0)}
      </div>
    </nav>
  );
}

export function SearchBar({ placeholder = "Find a person" }: { placeholder?: string }) {
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 bg-page/95 px-4 pb-3 pt-4 backdrop-blur">
      <Link href="/pay" className="flex h-14 flex-1 items-center gap-3 rounded-full bg-white px-5 text-[17px] text-muted shadow-sm">
        <Search size={20} className="text-ink" />
        {placeholder}
      </Link>
      <Link href="/me/code" aria-label="My code" className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
        <QrCode size={22} />
      </Link>
    </div>
  );
}

export function BackHeader({ title, right, fallback = "/" }: { title?: string; right?: ReactNode; fallback?: string }) {
  const router = useRouter();
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-page/95 px-3 backdrop-blur">
      <button type="button" aria-label="Back" onClick={() => (history.length > 1 ? router.back() : router.push(fallback))} className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
        <ChevronLeft size={22} />
      </button>
      <span className="text-[17px] font-semibold">{title}</span>
      <span className="flex min-w-10 justify-end">{right}</span>
    </div>
  );
}
