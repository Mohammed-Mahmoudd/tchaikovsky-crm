import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "./components/Sidebar";
import { ThemeProvider } from "./components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tchaikovsky CRM",
  description: "CRM for Tchaikovsky School",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Tchaikovsky CRM",
    description: "CRM for Tchaikovsky School",
    images: [{ url: "/logo.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tchaikovsky CRM",
    description: "CRM for Tchaikovsky School",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased h-screen flex flex-col overflow-hidden`}>
        <ThemeProvider>
          {/* Top Banner */}
          <div className="bg-[#0066FF] text-white text-center py-0.5 text-[12px] font-bold flex items-center justify-center">
            Demo — sample data only, nothing connects to real WhatsApp or Meta.
          </div>
          {/* Main Content Area */}
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-page)' }}>
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
