"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { COUNTRIES, countryName, flagOf } from "@/lib/countries";
import { addressUrl } from "@/lib/chain";
import { useRequireAccount } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { BackHeader, Screen } from "@/components/shell";
import { PASSWORD_HINT, PasswordField, passwordOk } from "@/components/password-field";
import { Card, Picture, PicturePicker, PrimaryButton, SectionTitle, Sheet } from "@/components/ui";

export default function SettingsPage() {
  const ok = useRequireAccount();
  const router = useRouter();
  const { me, account, saveProfile, signOut, setPassword, hideBalances, toggleHideBalances } = useStore();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [picture, setPicture] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);
  const [login, setLogin] = useState<{ ready: boolean; set: boolean } | null>(null);
  const [numberOpen, setNumberOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [again, setAgain] = useState("");
  const [numberError, setNumberError] = useState("");
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacyError, setPrivacyError] = useState("");
  const portfolioPrivate = Boolean(me?.privatePortfolio);
  const myHandle = me?.handle;
  useEffect(() => {
    if (!myHandle) return;
    fetch(`/api/auth/pin?handle=${myHandle}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ready?: boolean; set?: boolean }) => setLogin({ ready: Boolean(j.ready), set: Boolean(j.set) }))
      .catch(() => {});
  }, [myHandle]);
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
        <Card className="divide-y divide-line !py-1">
          <button
            type="button"
            disabled={savingPrivacy}
            onClick={async () => {
              setSavingPrivacy(true);
              setPrivacyError("");
              try {
                await saveProfile(me.name, me.picture, me.country, !portfolioPrivate);
              } catch (e) {
                setPrivacyError(e instanceof Error ? e.message.split("\n")[0] : "Couldn't save. Try again.");
              } finally {
                setSavingPrivacy(false);
              }
            }}
            className={`${row} disabled:opacity-60`}
          >
            <span>
              Show my portfolio on my profile
              <span className="block text-[13px] font-normal text-muted">
                {savingPrivacy ? "Saving on Monad…" : portfolioPrivate ? "Hidden. People see \"keeps their portfolio private\"." : "Anyone who opens your profile sees what you hold."}
              </span>
            </span>
            <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ${!portfolioPrivate ? "bg-brand" : "bg-line"}`}>
              <span className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${!portfolioPrivate ? "translate-x-5" : ""}`} />
            </span>
          </button>
          <button type="button" onClick={toggleHideBalances} className={row}>
            <span>
              Hide amounts on this phone
              <span className="block text-[13px] font-normal text-muted">Covers your balances with dots on this screen only.</span>
            </span>
            <span className={`flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 ${hideBalances ? "bg-brand" : "bg-line"}`}>
              <span className={`h-6 w-6 rounded-full bg-white shadow transition-transform ${hideBalances ? "translate-x-5" : ""}`} />
            </span>
          </button>
        </Card>
        {privacyError && <p className="px-3 pt-2 text-[13px] text-down">{privacyError}</p>}
        <p className="px-3 pt-2 text-[12px] leading-relaxed text-muted">Private payments and a hidden portfolio are hidden in the app. Your wallet and its balances are still public on Monad, like any blockchain.</p>

        {login?.ready && (
          <>
            <SectionTitle>Login</SectionTitle>
            <Card className="!py-1">
              <button type="button" onClick={() => { setNumber(""); setAgain(""); setNumberError(""); setNumberOpen(true); }} className={row}>
                <span>
                  Password
                  <span className="block text-[13px] font-normal text-muted">{login.set ? "Set. Log in on any phone with @" + me.handle : "Not set. Without it, signing out loses this wallet."}</span>
                </span>
                <span className="text-[14px] text-brand">{login.set ? "Change" : "Set"}</span>
              </button>
            </Card>
          </>
        )}

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
            if (confirm(login?.set ? `Sign out? You can log back in with @${me.handle} and your password.` : "Sign out? The test assets on this phone can't be recovered.")) {
              signOut();
              router.replace("/welcome");
            }
          }}
          className="mt-6 h-12 w-full rounded-full bg-white text-[16px] font-semibold text-down"
        >
          Sign out
        </button>
      </div>

      <Sheet open={numberOpen} onClose={() => setNumberOpen(false)} title={login?.set ? "Change your password" : "Set a password"}>
        <PasswordField value={number} onChange={setNumber} label="New password" autoComplete="new-password" autoFocus />
        <div className="mt-3">
          <PasswordField value={again} onChange={setAgain} label="Confirm password" placeholder="Type it again" autoComplete="new-password" state={again ? (again === number ? "ok" : "bad") : undefined} />
        </div>
        <p className="mt-2 px-1 text-[12px] text-muted">{PASSWORD_HINT}</p>
        {numberError && <p className="mt-2 text-[14px] text-down">{numberError}</p>}
        <PrimaryButton
          className="mt-4"
          disabled={saving || !passwordOk(number) || again !== number}
          onClick={async () => {
            setSaving(true);
            setNumberError("");
            try {
              await setPassword(me.handle, number);
              setLogin((l) => (l ? { ...l, set: true } : l));
              setNumberOpen(false);
            } catch (e) {
              setNumberError(e instanceof Error ? e.message : "Couldn't save the password.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Saving…" : "Save password"}
        </PrimaryButton>
      </Sheet>

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
