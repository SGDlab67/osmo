import { META } from "./assets";

export type Group = "stocks" | "crypto" | "cash";
export const GROUPS: { id: Group; title: string; short: string; color: string }[] = [
  { id: "stocks", title: "Stocks and real-world assets", short: "Stocks & RWAs", color: "#1F4F82" },
  { id: "crypto", title: "Crypto", short: "Crypto", color: "#C9A46A" },
  { id: "cash", title: "Stablecoins", short: "Stablecoins", color: "#8DB3DA" },
];
/** Gold, silver and Treasuries sit with stocks as real-world assets. */
export const groupOf = (symbol: string): Group => {
  const m = META[symbol]?.market;
  return m === "cash" ? "cash" : m === "crypto" ? "crypto" : "stocks";
};
