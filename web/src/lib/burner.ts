import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * The wallet lives on the phone. It is made the first time someone joins and kept in local storage, so there
 * is no seed phrase, extension or popup during the demo. Testnet only: anyone with this phone's storage holds it.
 */
const KEY = "osmo.monad.key";
const NAME = "osmo.monad.name";

export function loadWallet() {
  if (typeof window === "undefined") return null;
  const key = localStorage.getItem(KEY) as `0x${string}` | null;
  return key ? { account: privateKeyToAccount(key), name: localStorage.getItem(NAME) ?? "" } : null;
}

export function createWallet() {
  const key = generatePrivateKey();
  localStorage.setItem(KEY, key);
  return privateKeyToAccount(key);
}

/** The wallet key itself, for the one moment it is sent to the server to be locked behind a number. */
export function savedKey() {
  return typeof window === "undefined" ? null : (localStorage.getItem(KEY) as `0x${string}` | null);
}

/** Put a wallet back on this phone after a username and number login. */
export function restoreWallet(key: `0x${string}`) {
  localStorage.setItem(KEY, key);
  return privateKeyToAccount(key);
}

export function saveName(name: string) {
  localStorage.setItem(NAME, name);
}

export function forgetWallet() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(NAME);
}

/**
 * Move an account to another phone: open the app with #import=<key> and the wallet is saved here, then the link's
 * fragment is wiped. The fragment never reaches a server. Testnet only, like the rest of this file.
 */
export function takeImportFromUrl(): `0x${string}` | null {
  if (typeof window === "undefined") return null;
  const m = location.hash.match(/import=(0x[0-9a-fA-F]{64})/);
  if (!m) return null;
  history.replaceState(null, "", location.pathname + location.search);
  localStorage.setItem(KEY, m[1]);
  localStorage.removeItem(NAME);
  return m[1] as `0x${string}`;
}
