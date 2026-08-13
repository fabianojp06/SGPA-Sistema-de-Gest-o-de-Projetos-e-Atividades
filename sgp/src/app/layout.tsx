import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GiaFlow — Sistema de Gestão de Projetos e Atividades",
  description: "Gestão de projetos e atividades da equipe GIA/STI",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GiaFlow",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0f12",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="pt-BR"
        className={`${inter.variable} ${geistMono.variable} dark h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-background text-foreground">
          {children}
          <Toaster />
          <PwaRegister />
        </body>
      </html>
    </ClerkProvider>
  );
}
