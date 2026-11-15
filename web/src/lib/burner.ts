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
