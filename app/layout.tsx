import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Dipology Capital — RSI Screener',
  description: 'Crypto RSI Screener — Binance Futures USDT Perpetual',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}