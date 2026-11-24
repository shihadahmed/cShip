import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { headers } from 'next/headers';
import './globals.css';

export const metadata = {
  title: {
    default: 'cShip — Deploy control for cPanel',
    template: '%s · cShip',
  },
  description:
    'A self-hosted, Vercel-like deployment control panel for cPanel and Passenger.',
};

const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('cship-theme');
    var dark = stored ? stored === 'dark' : true;
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (error) {}
})();
`;

export default async function RootLayout({ children }) {
  // Nonce is forwarded by middleware on the request headers so inline scripts
  // can be allowlisted by CSP on the very first render.
  const nonce = (await headers()).get('x-nonce') || '';

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
