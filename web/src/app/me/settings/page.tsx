"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { COUNTRIES, countryName, flagOf } from "@/lib/countries";
import { addressUrl } from "@/lib/chain";
import { useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { BackHeader, Screen } from "@/components/shell";
import { Card, Picture, PicturePicker, PrimaryButton, SectionTitle, Sheet } from "@/components/ui";

export default function SettingsPage() {
  const ok = useRequireAccount();
  const router = useRouter();
  const { me, account, saveProfile, signOut, hideBalances, toggleHideBalances } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [picture, setPicture] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);
  if (!ok || !me || !account) return null;
  const open = () => {
    setName(me.name);
    setPicture(me.picture);
    setCountry(me.country);
    setEditing(true);
  };
  const row = "flex w-full items-center justify-between py-3.5 text-left text-[16px] font-semibold";
  return (
    <Screen tabs={false}>
      <BackHeader title="Settings" fallback="/me" />
      <div className="px-4">
        <Card className="flex items-center gap-3">
          <Picture picture={me.picture} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-semibold">{me.name}</p>
            <p className="text-[14px] text-muted">@{me.handle}</p>
          </div>
          <button type="button" onClick={open} className="rounded-full bg-chip px-4 py-2 text-[14px] font-semibold">
            Edit
          </button>
        </Card>

        <SectionTitle>Privacy</SectionTitle>
        <Card className="!py-1">
          <button type="button" onClick={toggleHideBalances} className={row}>
            Hide amounts on this phone
            <span className={`flex h-7 w-12 items-center rounded-full p-0.5 ${hideBalances ? "bg-brand" : "bg-line"}`}>
              <span className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${hideBalances ? "translate-x-5" : ""}`} />
            </span>
          </button>
        </Card>
        <p className="px-3 pt-2 text-[12px] leading-relaxed text-muted">Private payments are hidden in the app. Your wallet and its payments are still public on Monad, like any blockchain.</p>

        <SectionTitle>Wallet</SectionTitle>
        <Card className="divide-y divide-line !py-1">
          <a href={addressUrl(account.address)} target="_blank" rel="noreferrer" className={row}>
            <span>
              Your wallet
              <span className="block font-mono text-[13px] font-normal text-muted">
                {account.address.slice(0, 10)}…{account.address.slice(-6)}
              </span>
            </span>
            <ChevronRight size={18} className="text-muted" />
          </a>
          <Link href="/live" className={row}>
            Room screen for a projector <ChevronRight size={18} className="text-muted" />
          </Link>
          <Link href="/markets" className={row}>
            Markets <ChevronRight size={18} className="text-muted" />
          </Link>
        </Card>
        <p className="px-3 pt-2 text-[12px] leading-relaxed text-muted">
          Your wallet lives on this phone and only you can move what is in it. This is a testnet demo: the assets are test tokens at live prices, and signing out of this phone loses them.
        </p>
        <button
          type="button"
          onClick={() => {
            if (confirm("Sign out? The test assets on this phone can't be recovered.")) {
              signOut();
              router.replace("/welcome");
            }
          }}
          className="mt-6 h-12 w-full rounded-full bg-white text-[16px] font-semibold text-down"
        >
          Sign out
        </button>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit profile">
        <PicturePicker value={picture} onPick={setPicture} />
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} className="mt-2 h-12 w-full rounded-xl border border-line px-3 text-[16px] outline-none focus:border-brand" />
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-3 h-12 w-full rounded-xl border border-line bg-white px-3 text-[16px]">
          <option value="">No flag</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {flagOf(c)} {countryName(c)}
            </option>
          ))}
        </select>
        <PrimaryButton
          className="mt-4"
          disabled={saving || !name.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              await saveProfile(name, picture, country);
              setEditing(false);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? (
            "Saving on Monad…"
          ) : (
            <span className="inline-flex items-center gap-2">
              <Check size={18} /> Save
            </span>
          )}
        </PrimaryButton>
      </Sheet>
    </Screen>
  );
}
