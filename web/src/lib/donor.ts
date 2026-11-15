/** The donor's name and address for their own receipts. Kept on this device only, never uploaded or put on chain. */
export interface Donor {
  name: string;
  address: string;
}

const KEY = "osmo.donor";

export function loadDonor(): Donor | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.name === "string" ? { name: v.name, address: String(v.address ?? "") } : null;
  } catch {
    return null;
  }
}

export function saveDonor(d: Donor | null) {
  try {
    if (d && (d.name.trim() || d.address.trim())) localStorage.setItem(KEY, JSON.stringify({ name: d.name.trim(), address: d.address.trim() }));
    else localStorage.removeItem(KEY);
  } catch {}
}
