import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b306b"};

export const metadata: Metadata = {
  title: "GAV Kids | Registro de atendimento",
  description: "Registro de atendimentos dos espaços kids GAV.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/gav-logo-blue.png",
    shortcut: "/gav-logo-blue.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
