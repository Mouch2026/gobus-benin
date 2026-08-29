import type { Metadata } from "next";
import { Baloo_2, Work_Sans } from "next/font/google";
import "./globals.css";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

const baloo = Baloo_2({
  variable: "--font-baloo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "GoBus Bénin",
  description: "Réservez votre trajet en bus au Bénin.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${baloo.variable} ${workSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
