import type { Metadata } from "next";
import { Baloo_Da_2, Hind_Siliguri } from "next/font/google";
import { AppProviders } from "@/components/app-providers";
import "./globals.css";

const bangla = Hind_Siliguri({
  variable: "--font-bangla",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700"],
});

const display = Baloo_Da_2({
  variable: "--font-display-face",
  subsets: ["bengali", "latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "দৈনিক স্বাস্থ্য — ডাক্তার প্যানেল",
    template: "%s · দৈনিক স্বাস্থ্য প্যানেল",
  },
  description:
    "ডাক্তার, পুষ্টিবিদ ও ফিজিওথেরাপিস্টদের অ্যাপয়েন্টমেন্ট ও সময়সূচি",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="bn"
      className={`${bangla.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
