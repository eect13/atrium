function tidyAlnumPostal(raw: string) {
  const up = raw.toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(up)) return `${up.slice(0, -3)} ${up.slice(-3)}`;
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(up)) return `${up.slice(0, 3)} ${up.slice(3)}`;
  return raw.toUpperCase().replace(/\s+/g, " ");
}

/** Detect a postal / ZIP in a city field. Digits 4–6, US ZIP+4, UK, CA. */
export function parsePostal(raw: string): { postal: string } | null {
  const q = raw.trim();
  if (!q) return null;
  const us = q.match(/^(\d{5})(?:-\d{4})?$/);
  if (us) return { postal: us[1] };
  if (/^\d{4,6}$/.test(q)) return { postal: q };
  if (/^\d{3}-?\d{4}$/.test(q)) return { postal: q.replace("-", "") };
  if (/^[A-Z]\d[A-Z]\s*\d[A-Z]\d$/i.test(q)) return { postal: tidyAlnumPostal(q) };
  if (/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(q)) return { postal: tidyAlnumPostal(q) };
  if (/[A-Za-z]/.test(q)) {
    const tail = q.match(/\s(\d{4,6})$/);
    if (tail) return { postal: tail[1] };
  }
  return null;
}
