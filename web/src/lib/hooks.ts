"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "./store";

/** Pages that need an account send newcomers to the sign-up screen. */
export function useRequireAccount() {
  const { ready, account } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (ready && !account) router.replace("/welcome");
  }, [ready, account, router]);
  return ready && !!account;
}

/** The clock, ticking once a second, for "12s ago" labels. Zero until the browser takes over. */
export function useNow() {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    requestAnimationFrame(() => setNow(Date.now()));
    return () => clearInterval(t);
  }, []);
  return now;
}
