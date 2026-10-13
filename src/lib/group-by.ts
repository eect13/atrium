/**
 * Card 197: Object.groupBy is Chrome/WebView 117+; Atrium's baseline is Chrome 110 (tsconfig lib ES2023),
 * so group with this instead. Same result shape: a null-prototype record of arrays, insertion-ordered.
 */
export function groupBy<T, K extends PropertyKey>(items: Iterable<T>, key: (item: T, index: number) => K): Partial<Record<K, T[]>> {
  const out = Object.create(null) as Partial<Record<K, T[]>>;
  let i = 0;
  for (const item of items) {
    const k = key(item, i++);
    (out[k] ??= []).push(item);
  }
  return out;
}
