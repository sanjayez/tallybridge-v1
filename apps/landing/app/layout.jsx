import "./globals.css";

export const metadata = {
  title: "Tally Bridge | Tally connector for SaaS teams",
  description:
    "A lightweight bridge that connects customer Tally installations to your hosted product without a heavy integration project.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
