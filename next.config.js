/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    OPINION_API_KEY: process.env.OPINION_API_KEY,
    OPINION_BASE_URL: process.env.OPINION_BASE_URL || 'https://openapi.opinion.trade/openapi',
  },
}

module.exports = nextConfig