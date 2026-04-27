import "./globals.css";
import { QueryProvider } from "./providers";

export const metadata = {
  title: "TallyBridge Console",
  description: "Connection health and Tally bridge operations",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
