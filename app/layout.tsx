import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "附近Airbnb日租和月租查价格",
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
