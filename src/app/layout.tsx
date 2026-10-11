import type { Metadata, Viewport } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import "./globals.css";

const firaSans = Fira_Sans({ variable: "--font-fira-sans", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const firaCode = Fira_Code({ variable: "--font-fira-code", subsets: ["latin"], weight: ["400", "500"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Match Day Optimizer", template: "%s · Match Day Optimizer" },
  description: "Dream11 match day optimizer: a legal team, captain picks with reasons, and predicted vs actual points.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${firaSans.variable} ${firaCode.variable}`}>
      <body>{children}</body>
    </html>
  );
}
