"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Mirrors the server rule in lib/login.ts: 4 to 64 characters after NFKC normalization. */
export const passwordOk = (v: string) => {
  const n = [...v.normalize("NFKC")].length;
  return n >= 4 && n <= 64;
};

export const PASSWORD_HINT = "4 or more characters. A longer phrase is safer. Don't reuse a password from anywhere else.";

export function PasswordField({
  value,
  onChange,
  label = "Password",
  placeholder = "Password",
  autoComplete = "current-password",
  autoFocus = false,
  state,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  autoComplete?: "current-password" | "new-password";
  autoFocus?: boolean;
  /** A green tick or a red edge, for "confirm password". */
  state?: "ok" | "bad";
}) {
  const [shown, setShown] = useState(false);
  const edge = state === "bad" ? "border-down" : state === "ok" ? "border-money" : "border-[#ddd5c8] focus-within:border-brand";
  return (
    <label className="block">
      <span className="px-1 text-[13px] font-semibold text-muted">{label}</span>
      <span className={`mt-1 flex h-14 items-center gap-2 rounded-2xl border bg-white pl-4 pr-1.5 ${edge}`}>
        <input
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[17px] outline-none placeholder:text-muted"
        />
        <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted">
          {shown ? <EyeOff size={19} /> : <Eye size={19} />}
        </button>
      </span>
    </label>
  );
}
