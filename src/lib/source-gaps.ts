/** Names a price source that was asked for and came back empty. */
export function sourceGaps(input: {
  fx: boolean;
  pse: boolean;
  yahoo: boolean;
  crypto: boolean;
  screen: boolean;
}): string[] {
  const gaps: string[] = [];
  if (input.fx) gaps.push("FX");
  if (input.pse) gaps.push("PSE");
  if (input.yahoo) gaps.push("Yahoo");
  if (input.crypto) gaps.push("Crypto");
  if (input.screen) gaps.push("Screener");
  return gaps;
}
