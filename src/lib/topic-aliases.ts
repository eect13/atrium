/**
 * Card 195 (Critic 193 G1): place aliases for topic search — data only, no logic.
 * `codes` match only as whole UPPER-CASE words in a story ("US", never "us"); `names` match
 * case-insensitively through the light stemmer ("Philippine" ≈ "Philippines").
 * A topic word that equals any code or name (any case) expands to the whole group.
 * Add rows here; the matcher (topic-words.ts) has no place names in it.
 */
export type AliasGroup = { codes: readonly string[]; names: readonly string[] };

export const TOPIC_ALIASES: readonly AliasGroup[] = [
  { codes: ["PH", "PHL", "RP"], names: ["Philippines", "Philippine", "Filipino", "Pilipinas"] },
  { codes: ["US", "USA"], names: ["United States", "America", "American"] },
  { codes: ["UK", "GB", "GBR"], names: ["United Kingdom", "Britain", "British"] },
  { codes: ["EU"], names: ["European Union"] },
  { codes: ["UAE"], names: ["United Arab Emirates", "Emirati"] },
  { codes: ["PRC", "CN"], names: ["China", "Chinese"] },
  { codes: ["JP", "JPN"], names: ["Japan", "Japanese"] },
  { codes: ["KR", "ROK"], names: ["South Korea", "Korean"] },
  { codes: ["SG", "SGP"], names: ["Singapore", "Singaporean"] },
  { codes: ["MY", "MYS"], names: ["Malaysia", "Malaysian"] },
  { codes: ["ID", "IDN"], names: ["Indonesia", "Indonesian"] },
  { codes: ["VN", "VNM"], names: ["Vietnam", "Vietnamese"] },
  { codes: ["TH", "THA"], names: ["Thailand", "Thai"] },
  { codes: ["IN", "IND"], names: ["India", "Indian"] },
  { codes: ["AU", "AUS"], names: ["Australia", "Australian"] },
  { codes: ["NZ"], names: ["New Zealand"] },
  { codes: ["CA", "CAN"], names: ["Canada", "Canadian"] },
  { codes: ["ASEAN"], names: ["Southeast Asia", "Southeast Asian"] },
  { codes: ["NCR", "MM"], names: ["Metro Manila"] },
];
