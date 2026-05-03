// Catégories basées sur CoinGecko + Binance narratifs 2026
// Mapping symbol (sans USDT) -> catégorie
export const CATEGORIES: Record<string, string> = {
  // Layer 1
  BTC:'L1', ETH:'L1', SOL:'L1', BNB:'L1', ADA:'L1', AVAX:'L1', DOT:'L1',
  ATOM:'L1', NEAR:'L1', FTM:'L1', ALGO:'L1', ONE:'L1', HBAR:'L1', VET:'L1',
  XLM:'L1', XTZ:'L1', EOS:'L1', ZIL:'L1', EGLD:'L1', CELO:'L1', KAVA:'L1',
  ICX:'L1', WAVES:'L1', NEO:'L1', QTUM:'L1', XEM:'L1', IOTA:'L1', NANO:'L1',
  APT:'L1', SUI:'L1', SEI:'L1', TON:'L1', TRX:'L1', XRP:'L1',
  // Layer 2
  MATIC:'L2', ARB:'L2', OP:'L2', IMX:'L2', LRC:'L2', METIS:'L2', BOBA:'L2',
  ZKJ:'L2', MANTA:'L2', STRK:'L2', SCROLL:'L2', ZKSYNC:'L2', LINEA:'L2',
  TAIKO:'L2', MODE:'L2', MANTLE:'L2', MNT:'L2',
  // DeFi
  UNI:'DeFi', AAVE:'DeFi', CRV:'DeFi', MKR:'DeFi', SNX:'DeFi', COMP:'DeFi',
  YFI:'DeFi', SUSHI:'DeFi', BAL:'DeFi', '1INCH':'DeFi', DYDX:'DeFi',
  GMX:'DeFi', PERP:'DeFi', RUNE:'DeFi', LQTY:'DeFi', CVX:'DeFi',
  PENDLE:'DeFi', JOE:'DeFi', SPELL:'DeFi', FXS:'DeFi', LDO:'DeFi',
  RPL:'DeFi', SSV:'DeFi', ANKR:'DeFi', HYPE:'DeFi', HYPER:'DeFi',
  // AI & Data
  TAO:'AI', FET:'AI', AGIX:'AI', RNDR:'AI', RENDER:'AI', GRT:'AI',
  OCEAN:'AI', NMR:'AI', AIOZ:'AI', ALT:'AI', MASA:'AI', PAAL:'AI',
  MYRIA:'AI', WLD:'AI', IQ:'AI', ARKM:'AI', VIRTUAL:'AI',
  AI16Z:'AI', ZEREBRO:'AI', ACT:'AI', GRIFFAIN:'AI', PROMPT:'AI',
  CGPT:'AI', ULTI:'AI', GOAT:'AI', COOKIE:'AI',
  // Memecoins
  DOGE:'Meme', SHIB:'Meme', PEPE:'Meme', FLOKI:'Meme', BONK:'Meme',
  WIF:'Meme', MEME:'Meme', BRETT:'Meme', NEIRO:'Meme', POPCAT:'Meme',
  BABYDOGE:'Meme', LADYS:'Meme', DOGS:'Meme', HMSTR:'Meme', CATI:'Meme',
  PNUT:'Meme', ACE:'Meme', PANDA:'Meme', GIGA:'Meme', BOME:'Meme',
  SLERF:'Meme', MYRO:'Meme', MEW:'Meme', COQ:'Meme', SATS:'Meme',
  RATS:'Meme', TURBO:'Meme', MOODENG:'Meme', CHILLGUY:'Meme', PENGU:'Meme',
  FARTCOIN:'Meme', TRUMP:'Meme', MELANIA:'Meme', VINE:'Meme',
  // RWA
  ONDO:'RWA', POLYX:'RWA', CFG:'RWA', MPL:'RWA', TRU:'RWA', CPOOL:'RWA',
  RIO:'RWA', LANDX:'RWA', REALT:'RWA', PROPS:'RWA', TOKEN:'RWA',
  // Gaming & Metaverse
  AXS:'Gaming', SAND:'Gaming', MANA:'Gaming', GALA:'Gaming', ENJ:'Gaming',
  ILV:'Gaming', ALICE:'Gaming', TLM:'Gaming', WAXP:'Gaming', HERO:'Gaming',
  MAGIC:'Gaming', BEAM:'Gaming', RON:'Gaming', SLP:'Gaming',
  PYR:'Gaming', VOXEL:'Gaming', LOOKS:'Gaming', PIXEL:'Gaming', PORTAL:'Gaming',
  // Infra & Oracle
  LINK:'Infra', BAND:'Infra', API3:'Infra', TRB:'Infra', UMA:'Infra',
  PYTH:'Infra', SUPRA:'Infra', DIA:'Infra', NEST:'Infra',
  // Privacy
  ZEC:'Privacy', DASH:'Privacy', XMR:'Privacy', ROSE:'Privacy', SCRT:'Privacy',
  // Exchange tokens
  BNB:'CEX', OKB:'CEX', KCS:'CEX', HT:'CEX', CRO:'CEX', GT:'CEX',
  // Liquid Staking
  STETH:'LST', RETH:'LST', CBETH:'LST', SFRXETH:'LST', STMATIC:'LST',
  // Social & Creator
  CHZ:'Social', MASKS:'Social', RALLY:'Social', FAME:'Social',
}

export const ALL_CATEGORIES = [
  'L1', 'L2', 'DeFi', 'AI', 'Meme', 'RWA', 'Gaming', 'Infra', 'Privacy', 'CEX', 'LST', 'Social'
] as const

export type Category = typeof ALL_CATEGORIES[number]

export function getCategory(symbol: string): string | null {
  const base = symbol.replace('USDT', '').replace(/^1000/, '')
  return CATEGORIES[base] ?? null
}
