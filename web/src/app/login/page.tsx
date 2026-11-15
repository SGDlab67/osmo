"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { PinField, pinOk } from "@/components/pin-field";
import { PrimaryButton } from "@/components/ui";
import { useStore } from "@/lib/store";

const RULE = /^[a-z0-9_]{3,20}$/;

export default function LoginPage() {
  const router = useRouter();
  const { ready, account, signIn } = useStore();
  const [handle, setHandle] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/pin", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ready?: boolean }) => setAvailable(Boolean(j.ready)))
      .catch(() => setAvailable(false));
  }, []);

  // Already signed in on this phone: go home.
  useEffect(() => {
    if (ready && account) router.replace("/");
  }, [ready, account, router]);

  const go = async () => {
    setError("");
    setBusy(true);
    try {
      await signIn(handle, pin);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't log in. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-8 min-[820px]:min-h-full">
      <div className="-mx-2 flex h-14 items-center">
        <Link href="/welcome" aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
          <ChevronLeft size={22} />
        </Link>
      </div>
      <h1 className="mt-2 px-1 text-[30px] font-semibold tracking-tight">Log in</h1>
      <p className="mt-1 px-1 text-[15px] text-muted">Your username and the number you picked when you joined.</p>

      <label className="mt-6 block">
        <span className="px-1 text-[13px] font-semibold text-muted">Username</span>
        <span className="mt-1 flex h-14 items-center gap-1 rounded-2xl border border-[#ddd5c8] bg-white px-4 text-[17px] focus-within:border-brand">
          <span className="text-muted">@</span>
          <input
            autoFocus
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            className="w-full bg-transparent outline-none"
          />
        </span>
      </label>
      <div className="mt-3">
        <PinField value={pin} onChange={setPin} />
      </div>

      <div className="flex-1" />
      {available === false && <p className="mb-3 text-center text-[14px] text-down">Login by number isn&apos;t switched on for this server yet.</p>}
      {error && <p className="mb-3 text-center text-[14px] text-down">{error}</p>}
      <PrimaryButton disabled={busy || available === false || !RULE.test(handle) || !pinOk(pin)} onClick={go}>
        {busy ? "Checking…" : "Log in"}
      </PrimaryButton>
      <p className="mt-4 text-center text-[12px] text-muted">Five wrong tries lock the username for 15 minutes. This is a testnet demo with test tokens.</p>
      <Link href="/welcome" className="mt-3 block text-center text-[14px] font-semibold text-brand">
        New here? Create a wallet
      </Link>
    </div>
  );
}
