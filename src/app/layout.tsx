import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Class Catch-up",
  description: "Lecture summaries and Q&A on Telegram for students who were sick or on leave.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
