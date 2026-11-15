"use client";

import { useEffect, useState } from "react";

export interface Quote {
  price: number;
  change: number;
  logo: string;
}

/** Live prices and logos, refreshed every minute. Dollar coins are pinned to $1. */
export function usePrices() {
  const [prices, setPrices] = useState<Record<string, Quote>>({});
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/prices")
        .then((r) => r.json())
        .then((p) => alive && setPrices(p))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return prices;
}
