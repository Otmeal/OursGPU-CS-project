import { defineNuxtConfig } from 'nuxt/config'
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
    plugins: [vuetify()]
  }
})
