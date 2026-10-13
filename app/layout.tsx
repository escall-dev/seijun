import { getAuthenticatedUser, createClient } from "@/lib/supabase/server"
import { resolveServerCycleContext } from "@/lib/cycle-context/server"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { AppShell } from "@/components/shell/app-shell"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration"
import { NavigationLoadingProvider } from "@/components/navigation/navigation-loading-context"
import { NavigationLoadingOverlay } from "@/components/navigation/navigation-loading-overlay"
import "./globals.css"
export const dynamic = "force-dynamic"

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#7152b5" },
    { media: "(prefers-color-scheme: dark)", color: "#160523" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: {
    default: "Seijun — Personal Cycle Tracker",
    template: "%s | Seijun — Personal Cycle Tracker",
  },
  description: "A calm, personal, and private menstrual cycle tracking web application.",
  applicationName: "Seijun",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Seijun",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
    ],
    apple: "/apple-icon.png",
  },
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthenticatedUser()
  const initialContext = user ? await resolveServerCycleContext(await createClient(), user.id) : null
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('seijun-theme');var t=(s==='light'||s==='dark'||s==='system')?s:'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="min-h-dvh flex flex-col font-sans bg-background text-foreground selection:bg-lavender selection:text-primary"
      >
        <ThemeProvider>
          <NavigationLoadingProvider>
            <AppShell initialContext={initialContext}>{children}</AppShell>
            <NavigationLoadingOverlay />
          </NavigationLoadingProvider>
        </ThemeProvider>
        <Analytics />
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
