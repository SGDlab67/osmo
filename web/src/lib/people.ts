import { registryAbi, welcomeAbi } from "./abi";
import { config } from "./config";
import { publicClient } from "./chain";

/** Cartoon characters (Google Noto emoji on colour) and pixel NFTs (drawn by our script). */
export const CHARACTERS = ["fox", "panda", "frog", "tiger", "unicorn", "koala", "monkey", "penguin", "octopus", "lion", "alien", "robot", "ghost", "cool", "rocket", "starstruck"];
export const PIXELS = ["px1", "px2", "px3", "px4", "px5", "px6", "px7", "px8", "px9", "px10"];

export function pictureUrl(id: string) {
  if (id.startsWith("px")) return `/pixel/${id}.png`;
  if (id.startsWith("person:")) return `/people/${id.slice(7)}.png`;
  if (id.startsWith("charity:")) return `/charities/${id.slice(8)}.png`;
  // The team's real photos, set on their own profiles. Not offered in the picker, so nobody else can pick them.
  if (id.startsWith("photo:") && /^[a-z]+$/.test(id.slice(6))) return `/photos/${id.slice(6)}.jpg`;
  return `/avatars/${id}.svg`;
}

export interface Person {
  address: `0x${string}`;
  handle: string;
  name: string;
  picture: string;
  country: string;
  joined: boolean;
  tag?: string;
}

export const EVENT_TAG = "Monad Blitz Oregon";

/**
 * The sample people. They are created on Monad by `web/scripts/seed-demo.mjs`, with their own wallets and a few
 * payments between them, so the feed has life before the room joins.
 */
export const DEMO_PEOPLE: { handle: string; name: string; picture: string; country: string }[] = [
  { handle: "ana", name: "Ana Rivera", picture: "person:ana", country: "MX" },
  { handle: "wes", name: "Wes Kim", picture: "person:wes", country: "US" },
  { handle: "sabina", name: "Sabina Okafor", picture: "person:sabina", country: "NG" },
  { handle: "maya", name: "Maya Tran", picture: "person:maya", country: "CA" },
  { handle: "jordan", name: "Jordan Park", picture: "person:jordan", country: "GB" },
  { handle: "dev", name: "Dev Mehta", picture: "person:dev", country: "IN" },
  { handle: "priya", name: "Priya Nair", picture: "person:priya", country: "SG" },
  { handle: "zoe", name: "Zoe Castillo", picture: "person:zoe", country: "AR" },
];

/** Builders at Monad Blitz Oregon, listed with their permission. Their usernames are left free so they can claim them. */
export const EVENT_PEOPLE: [string, string][] = [
  ["bardia_ahmadi", "Bardia Ahmadi Dafchahi"],
  ["salem_alfassam", "Salem Alfassam"],
  ["armon_behikeesh", "Armon Behikeesh"],
  ["jack_bernstein", "Jack Bernstein-Sheehan"],
  ["diego_carpenter", "Diego Carpenter"],
  ["cameron_coleman", "Cameron Coleman"],
  ["armaan_hajarizadeh", "Armaan Hajarizadeh"],
  ["audrey_hudspeth", "Audrey Hudspeth"],
  ["banyan_julian", "Banyan Julian"],
  ["finian_kierstead", "Finian Kierstead"],
  ["nikita_klepikov", "Nikita Klepikov"],
  ["ruhi_kotwal", "Ruhi Kotwal"],
  ["kevin_le", "Kevin Le"],
  ["valentin_levy", "Valentin Levy"],
  ["carsen_luna", "Carsen Luna"],
  ["drew_manley", "Drew Manley"],
  ["miles_miller", "Miles Miller"],
  ["katrina_nguyen", "Katrina Nguyen"],
  ["mateusz_palusinski", "Mateusz Palusinski"],
  ["braydon_perko", "Braydon Perko"],
  ["chris_richardson", "Christopher Richardson"],
  ["nick_sakys", "Nick Sakys"],
  ["shaurya_saxena", "Shaurya Saxena"],
  ["justin_schroeder", "Justin Schroeder"],
  ["kellen_snider", "Kellen Snider"],
  ["blake_staats", "Blake Staats"],
  ["eleanor_stenberg", "Eleanor Stenberg"],
  ["matthew_stone", "Matthew Stone"],
  ["fatima_syed", "Fatima Syed"],
  ["evan_thompson", "Evan Thompson"],
  ["shantam_tyagi", "Shantam Tyagi"],
  ["xavier_vortigern", "Xavier Vortigern"],
  ["chris_warner", "Chris Warner"],
  ["archie_webber", "Archie Webber"],
  ["libby_wise", "Libby Wise"],
  ["madeleine_ward", "Madeleine Ward"],
  ["joseph_harris", "Joseph Harris"],
  ["huy_voqui", "Huy Voqui"],
  ["liam_nichols", "Liam Nichols"],
  ["joshua_mcmullen", "Joshua McMullen"],
  ["lin_mills", "Lin Mills"],
  ["calvin_peck", "Calvin N Peck Dobson"],
  ["anureet_waraich", "Anureet Waraich"],
  ["shishir_thilavalli", "Shishir Thilavalli"],
  ["clayton_fawthrop", "Clayton Fawthrop-Male"],
  ["jared_vaughn", "Jared Vaughn"],
  ["jalen_wang", "Jalen Wang"],
  ["alana_nguyen", "Alana Nguyen"],
  ["ritvik_botla", "Ritvik Botla"],
  ["parker_myers", "Parker Myers"]
];

/** Profiles are stored on-chain as "Display name|picture|country". */
export function encodeProfile(name: string, picture: string, country: string) {
  return [name.replace(/\|/g, " ").trim().slice(0, 40), picture, country].join("|");
}

export function decodeProfile(s: string) {
  const [name = "", picture = "", country = ""] = s.split("|");
  return { name, picture, country };
}

/** A picture for anyone who hasn't picked one, chosen from their username so it never changes. */
export function defaultPicture(handle: string) {
  let n = 0;
  for (const c of handle) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return CHARACTERS[n % CHARACTERS.length];
}

/** Everyone who joined through the app, newest first. */
export async function loadMembers(): Promise<Person[]> {
  const n = Number(await publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "memberCount" }));
  const idx = Array.from({ length: Math.min(n, 300) }, (_, i) => BigInt(n - 1 - i));
  const addrs = await Promise.all(idx.map((i) => publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "members", args: [i] })));
  const rows = await Promise.all(
    addrs.map(async (address) => {
      const [handle, profile] = await Promise.all([
        publicClient.readContract({ address: config.registry, abi: registryAbi, functionName: "nameOf", args: [address] }),
        publicClient.readContract({ address: config.welcome, abi: welcomeAbi, functionName: "profileOf", args: [address] }),
      ]);
      const p = decodeProfile(profile);
      const h = handle.toLowerCase();
      return { address, handle: h, name: p.name || handle, picture: p.picture || defaultPicture(h), country: p.country, joined: true };
    }),
  );
  return rows.filter((r) => r.handle);
}
