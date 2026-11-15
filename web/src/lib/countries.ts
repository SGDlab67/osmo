/** Self-reported country for the flag next to a name. Codes only; names come from the browser. */
export const COUNTRIES = [
  "US", "CA", "MX", "BR", "AR", "CO", "CL", "PE", "GB", "IE", "FR", "DE", "ES", "IT", "PT", "NL", "BE", "CH", "SE", "NO",
  "DK", "FI", "PL", "UA", "TR", "IL", "AE", "SA", "EG", "NG", "GH", "KE", "ZA", "ET", "MA", "IN", "PK", "BD", "LK", "NP",
  "CN", "HK", "TW", "JP", "KR", "VN", "TH", "MY", "SG", "ID", "PH", "AU", "NZ", "RU", "KZ", "IR", "IQ", "JO", "LB", "GR",
];

export function flagOf(code?: string) {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)));
}

let names: Intl.DisplayNames | null = null;
export function countryName(code?: string) {
  if (!code) return "";
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
