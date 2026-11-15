import { keccak256, toBytes } from "viem";
import records from "@/data/charities.json";

/** One nonprofit's published record. Its keccak256 (of JSON.stringify) is pinned on chain in Charities. */
export interface CharityRecord {
  handle: string;
  /** Short name for the app. */
  name: string;
  /** Name on the IRS record, for receipts. */
  legalName: string;
  ein: string;
  address: string;
  /** IRS subsection, e.g. "501(c)(3)". */
  status: string;
  /** Whether US donors can generally deduct gifts (501(c)(3) public charities: yes; 501(c)(4): no). */
  deductible: boolean;
  category: string;
  founded?: number;
  site: string;
  mission: string;
  about: string;
}

/** A charity as the app sees it: the record, its wallet, and what the chain says about it. */
export interface Charity extends CharityRecord {
  wallet: `0x${string}`;
  /** Listed by the curator and not revoked. */
  verified: boolean;
  /** The record served with the app hashes to what the curator pinned on chain. */
  detailsOk: boolean;
}

export const CHARITY_RECORDS = records as CharityRecord[];

export const recordHash = (r: CharityRecord) => keccak256(toBytes(JSON.stringify(r)));

export const charityLogo = (handle: string) => `/charities/${handle}.png`;

/** Categories in the order the Give screen shows them. */
export const CHARITY_CATEGORIES = ["Crypto policy", "Health", "Children", "Hunger", "Disaster relief", "Environment", "Water", "Poverty", "Housing", "Education", "Open internet", "Animals", "Veterans", "Local"];

/** The charity featured at the top of Give. */
export const FEATURED = "standwithcrypto";

/** Receipt id: the first 10 hex characters of keccak256(txHash, logIndex). */
export const receiptId = (hash: string, logIndex: number) => keccak256(toBytes(`${hash.toLowerCase()}:${logIndex}`)).slice(2, 12).toUpperCase();
