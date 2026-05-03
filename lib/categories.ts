export const CATEGORIES: Record<string, string> = {
  BTC:'L1', ETH:'L1', SOL:'L1', ADA:'L1', AVAX:'L1', DOT:'L1',
  ATOM:'L1', NEAR:'L1', FTM:'L1', ALGO:'L1', ONE:'L1', HBAR:'L1', VET:'L1',
  XLM:'L1', XTZ:'L1', EOS:'L1', ZIL:'L1', EGLD:'L1', CELO:'L1', KAVA:'L1',
  ICX:'L1', WAVES:'L1', NEO:'L1', QTUM:'L1', XEM:'L1', IOTA:'L1', NANO:'L1',
  APT:'L1', SUI:'L1', SEI:'L1', TON:'L1', TRX:'L1', XRP:'L1',
  MATIC:'L2', ARB:'L2', OP:'L2', IMX:'L2', LRC:'L2', METIS:'L2', BOBA:'L2',
  ZKJ:'L2', MANTA:'L2', STRK:'L2', MNT:'L2',
  UNI:'DeFi', AAVE:'DeFi', CRV:'DeFi', MKR:'DeFi', SNX:'DeFi', COMP:'DeFi',
  YFI:'DeFi', SUSHI:'DeFi', BAL:'DeFi', DYDX:'DeFi',
  GMX:'DeFi', PERP:'DeFi', RUNE:'DeFi', LQTY:'DeFi', CVX:'DeFi',
  PENDLE:'DeFi', JOE:'DeFi', SPELL:'DeFi', FXS:'DeFi', LDO:'DeFi',
  RPL:'DeFi', SSV:'DeFi', ANKR:'DeFi', HYPE:'DeFi',
  TAO:'AI', FET:'AI', AGIX:'AI', RNDR:'AI', GRT:'AI',
  OCEAN:'AI', NMR:'AI', AIOZ:'AI', ALT:'AI', MASA:'AI',
  WLD:'AI', IQ:'AI', ARKM:'AI', VIRTUAL:'AI',
  AI16Z:'AI', ZEREBRO:'AI', ACT:'AI', GRIFFAIN:'AI', PROMPT:'AI',
  CGPT:'AI', GOAT:'AI', COOKIE:'AI',
  DOGE:'Meme', SHIB:'Meme', PEPE:'Meme', FLOKI:'Meme', BONK:'Meme',
  WIF:'Meme', MEME:'Meme', BRETT:'Meme', NEIRO:'Meme', POPCAT:'Meme',
  DOGS:'Meme', HMSTR:'Meme', CATI:'Meme',
  PNUT:'Meme', PANDA:'Meme', GIGA:'Meme', BOME:'Meme',
  SLERF:'Meme', MYRO:'Meme', MEW:'Meme', SATS:'Meme',
  RATS:'Meme', TURBO:'Meme', MOODENG:'Meme', CHILLGUY:'Meme', PENGU:'Meme',
  FARTCOIN:'Meme', TRUMP:'Meme', MELANIA:'Meme', VINE:'Meme',
  ONDO:'RWA', POLYX:'RWA', CFG:'RWA', MPL:'RWA', TRU:'RWA', CPOOL:'RWA',
  AXS:'Gaming', SAND:'Gaming', MANA:'Gaming', GALA:'Gaming', ENJ:'Gaming',
  ILV:'Gaming', ALICE:'Gaming', TLM:'Gaming', HERO:'Gaming',
  MAGIC:'Gaming', BEAM:'Gaming', RON:'Gaming', SLP:'Gaming',
  PYR:'Gaming', VOXEL:'Gaming', PIXEL:'Gaming', PORTAL:'Gaming',
  LINK:'Infra', BAND:'Infra', API3:'Infra', TRB:'Infra', UMA:'Infra',
  PYTH:'Infra', DIA:'Infra',
  ZEC:'Privacy', DASH:'Privacy', XMR:'Privacy', ROSE:'Privacy', SCRT:'Privacy',
  BNB:'CEX', OKB:'CEX', KCS:'CEX', HT:'CEX', CRO:'CEX', GT:'CEX',
  CHZ:'Social', RALLY:'Social',
}

export const ALL_CATEGORIES = [
  'L1', 'L2', 'DeFi', 'AI', 'Meme', 'RWA', 'Gaming', 'Infra', 'Privacy', 'CEX', 'Social'
] as const

export type Category = typeof ALL_CATEGORIES[number]

export function getCategory(symbol: string): string | null {
  const base = symbol.replace('USDT', '').replace(/^1000/, '')
  return CATEGORIES[base] ?? null
}
