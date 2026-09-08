'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import * as React from 'react'

export function ThemeProvider(props: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {props.children}
    </NextThemesProvider>
  )
}
