import localFont from 'next/font/local'
import React from 'react'

import { ChatWidget } from '@/components/ChatWidget'
import { Nav } from '@/components/Nav'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { siteConfig } from '@/lib/site'
import './globals.css'

const roboto = localFont({
  src: './fonts/Roboto-latin.woff2',
  variable: '--font-roboto',
  weight: '400 700',
})

const geistMono = localFont({
  src: './fonts/GeistMono-latin.woff2',
  variable: '--font-geist-mono',
})

export const metadata = {
  metadataBase: new URL(siteConfig.url),
  description: siteConfig.description,
  title: {
    default: siteConfig.title,
    template: `%s · ${siteConfig.name}`,
  },
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    locale: siteConfig.locale,
  },
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en" className={`${roboto.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <ThemeProvider>
          <Nav />
          <main>{children}</main>
          <footer className="border-t py-8 text-center text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} {siteConfig.author}. Built with Payload CMS + Next.js.</p>
          </footer>
          <ChatWidget />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
