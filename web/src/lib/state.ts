import type { Token } from "./assets";
import type { Payment } from "./feed";
import type { Person } from "./people";

export interface MoneyRequest {
  id: number;
  from: string;
  payer: string;
  usd: number;
  note: string;
  status: "open" | "paid" | "declined" | "cancelled";
}

/** A payment as JSON: the block number travels as a string. */
export type WirePayment = Omit<Payment, "block"> & { block: string };

/** Everything every phone needs to see, built once on the server and shared through the CDN. */
export interface WireState {
  block: string;
  sends: number;
  tokens: Token[];
  feed: WirePayment[];
  members: Person[];
  requests: MoneyRequest[];
  at: number;
}

export const fromWire = (p: WirePayment): Payment => ({ ...p, block: BigInt(p.block) });
