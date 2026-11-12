import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono, Poppins, Alex_Brush } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";

// Official Clyntique Brand Typography:
// - Headings and prominent titles: Bayer TypeArchiType
// - Body text and UI elements: Poppins
// - Script accents: Alex Brush
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

const alexBrush = Alex_Brush({
  variable: "--font-script",
  subsets: ["latin"],
  weight: ["400"],
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

// Inline zero-flash script executed synchronously before paint
const themeInitScript = `(function(){try{var s=localStorage.getItem('clyntique-theme');var d=s==='dark'||((!s||s==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}else{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light';}}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bayerTypeArchiType.variable} ${poppins.variable} ${alexBrush.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-canvas text-ink antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
