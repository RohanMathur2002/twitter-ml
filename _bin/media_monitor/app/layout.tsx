import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/navbar/Navbar";

export const metadata: Metadata = {
  title: "X Analytics | Profile Intelligence",
  description: "Minimalist analytical dashboard for Twitter/X profiles",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/* We use a script to prevent FOUC on reload for dark mode */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>
        <Navbar />

        {/* Main Content */}
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: "calc(100vh - 56px)",
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
