import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Airbnb 月租和短租定价建议",
  description: "独立的 Airbnb 房价查价和定价建议平台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
