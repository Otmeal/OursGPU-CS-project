import { defineNuxtConfig } from 'nuxt/config'
import { fileURLToPath } from 'node:url'
import vuetify from 'vite-plugin-vuetify'

const enableDevProxy = process.env.NUXT_ENABLE_DEV_PROXY !== '0' && process.env.NODE_ENV !== 'production'
const apiProxyTarget = process.env.NUXT_DEV_API_PROXY || 'http://127.0.0.1:8080/**'
const s3ProxyTarget = process.env.NUXT_DEV_S3_PROXY || 'http://127.0.0.1:8080/**'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: true },
  // Use Nuxt default build directory (.nuxt)

  modules: ['@pinia/nuxt'],
  // Include Vuetify styles globally
  css: ['vuetify/styles', '@/assets/styles/soviet.css'],

  build: {
    // Ensure vuetify is transpiled for SSR
    transpile: ['vuetify']
  },

  routeRules: {
    ...(enableDevProxy
      ? {
          '/api/**': { proxy: apiProxyTarget },
          '/s3/**': { proxy: s3ProxyTarget },
        }
      : {}),
  },

  vite: {
    ssr: { noExternal: ['vuetify'] },
    plugins: [vuetify()],
    resolve: {
      alias: {
        '@ours-gpu/shared': fileURLToPath(new URL('../../libs/shared/src', import.meta.url)),
      },
    },
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || '/api',
      s3ProxyBase: process.env.NUXT_PUBLIC_S3_PROXY_BASE || '/s3',
      jobManagerAddress: process.env.NUXT_PUBLIC_JOB_MANAGER_ADDRESS || process.env.JOB_MANAGER_ADDRESS || '',
      tokenAddress: process.env.NUXT_PUBLIC_TOKEN_ADDRESS || process.env.OCU_TOKEN_ADDRESS || '',
    },
  },
})
