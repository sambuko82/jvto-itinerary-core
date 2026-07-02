import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], weight: ['400', '600', '800'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'JVTO Itinerary Builder',
  description: 'Custom itinerary builder for Java Volcano Tour Operator',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
