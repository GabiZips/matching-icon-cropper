import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matching Icon Cropper",
  description: "Crie dois recortes quadrados complementares para matching icons.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
