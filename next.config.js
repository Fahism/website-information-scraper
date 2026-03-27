/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['rebrowser-playwright', 'playwright-extra', 'puppeteer-extra-plugin-stealth'],
  },
};

module.exports = nextConfig;
