import { defineNuxtConfig } from 'nuxt/config'
import { fileURLToPath } from 'node:url'
import vuetify from 'vite-plugin-vuetify'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: true },
  // Use Nuxt default build directory (.nuxt)

  modules: ['@pinia/nuxt'],
  // Include Vuetify styles globally
  css: ['vuetify/styles'],

  build: {
    // Ensure vuetify is transpiled for SSR
    transpile: ['vuetify']
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
      jobManagerAddress: process.env.NUXT_PUBLIC_JOB_MANAGER_ADDRESS || process.env.JOB_MANAGER_ADDRESS || '',
      tokenAddress: process.env.NUXT_PUBLIC_TOKEN_ADDRESS || process.env.OCU_TOKEN_ADDRESS || '',
    },
  },
})
