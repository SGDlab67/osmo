"use client";

/** The login number: 1 to 9999, shown as dots. */
export const pinOk = (v: string) => /^\d{1,4}$/.test(v) && Number(v) >= 1;

export function PinField({ value, onChange, label = "Your number", autoComplete = "current-password" }: { value: string; onChange: (v: string) => void; label?: string; autoComplete?: string }) {
  return (
    <label className="block">
      <span className="px-1 text-[13px] font-semibold text-muted">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 4))}
        placeholder="1 to 9999"
        className="mt-1 h-14 w-full rounded-2xl border border-[#ddd5c8] bg-white px-4 text-[17px] tracking-[0.3em] outline-none placeholder:tracking-normal focus:border-brand"
      />
    </label>
  );
}
