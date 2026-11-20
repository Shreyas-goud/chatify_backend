import crypto from "crypto";

// To E.164 ("+919876543210"), or null. Numbers written without a country code get
// `defaultCountry` (dialling code, e.g. "91"); a leading 0 trunk prefix is dropped first.
// The frontend has the same function (src/lib/phone.js) so contact hashes match.
export function normalizePhone(raw, defaultCountry = "91") {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const international = text.startsWith("+") || text.startsWith("00");
  let digits = text.replace(/\D/g, "");
  if (text.startsWith("00")) digits = digits.slice(2);
  if (!international) {
    digits = digits.replace(/^0+/, "");
    if (!defaultCountry || digits.length > 10) return null;
    digits = `${defaultCountry}${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export const hashPhone = (e164) => crypto.createHash("sha256").update(e164).digest("hex");

// "+91 •••••• 3210": enough for its owner to recognise, useless to anyone else.
export function phoneHint(e164) {
  const digits = e164.slice(1);
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "";
  return `${country}•••••• ${digits.slice(-4)}`;
}

export const dialCodeOf = (e164) => {
  const digits = e164?.slice(1) ?? "";
  return digits.length > 10 ? digits.slice(0, digits.length - 10) : null;
};
