import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";

// Official Clyntique Brand Typography:
// - Headings and prominent titles: Bayer TypeArchiType
// - Body text and UI elements: Poppins
const bayerTypeArchiType = localFont({
  src: "./fonts/BayerTypeArchiType-Regular.otf",
  variable: "--font-bayer",
  display: "swap",
  weight: "400",
  fallback: ["Poppins", "system-ui", "sans-serif"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Clyntique",
  description: "Advertising compliance review: submissions, findings and decisions in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bayerTypeArchiType.variable} ${poppins.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
