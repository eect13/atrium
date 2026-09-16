function tidyAlnumPostal(raw: string) {
  const up = raw.toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(up)) return `${up.slice(0, -3)} ${up.slice(-3)}`;
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(up)) return `${up.slice(0, 3)} ${up.slice(3)}`;
  return raw.toUpperCase().replace(/\s+/g, " ");
}

export type PostalHint = "us" | "ph" | "gb" | "ca" | "jp" | "in" | "generic";
export type PostalHit = { postal: string; hint: PostalHint };

/** Detect a postal / ZIP in a city field. Digits 4–6, US ZIP+4, UK, CA. */
export function parsePostal(raw: string): PostalHit | null {
  const q = raw.trim();
  if (!q) return null;
  const us = q.match(/^(\d{5})(?:-\d{4})?$/);
  if (us) return { postal: us[1], hint: "us" };
  if (/^\d{4}$/.test(q)) return { postal: q, hint: "ph" };
  if (/^\d{6}$/.test(q)) return { postal: q, hint: "in" };
  if (/^\d{3}-?\d{4}$/.test(q)) return { postal: q.replace("-", ""), hint: "jp" };
  if (/^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i.test(q)) return { postal: tidyAlnumPostal(q), hint: "ca" };
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(q)) return { postal: tidyAlnumPostal(q), hint: "gb" };
  if (/[A-Za-z]/.test(q)) {
    const tail = q.match(/\s(\d{4,6})$/);
    if (tail) {
      const n = tail[1];
      const hint: PostalHint = n.length === 5 ? "us" : n.length === 6 ? "in" : "ph";
      return { postal: n, hint };
    }
  }
  return null;
}

/** Country try-order for a postal code. 5-digit prefers US even on a PH desk. */
export function postalCountries(deskCc: string, hint?: PostalHint): string[] {
  const desk = deskCc.trim().toLowerCase();
  const prefer: string[] = [];
  if (hint === "us") prefer.push("us");
  else if (hint === "gb") prefer.push("gb");
  else if (hint === "ca") prefer.push("ca");
  else if (hint === "jp") prefer.push("jp");
  else if (hint === "in") prefer.push("in", "sg");
  else if (hint === "ph") {
    if (desk) prefer.push(desk);
    prefer.push("ph", "au");
  }
  if (desk) prefer.push(desk);
  return [...new Set([...prefer, "ph", "us", "gb", "ca", "au", "sg", "jp", "in", "de"])];
}
