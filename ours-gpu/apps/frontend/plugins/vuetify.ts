import { createVuetify, type ThemeDefinition } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export default defineNuxtPlugin((nuxtApp) => {
  const sovietTheme: ThemeDefinition = {
    dark: true,
    colors: {
      background: '#0b0a0f',
      surface: '#15131e',
      primary: '#d62b2b',
      secondary: '#e0b343',
      accent: '#5af1f2',
      info: '#7cc7ff',
      success: '#78e08f',
      warning: '#f8d66d',
      error: '#ff5c5c',
    },
  }

  const vuetify = createVuetify({
    components,
    directives,
    theme: {
      defaultTheme: 'soviet',
      themes: {
        soviet: sovietTheme,
      },
    },
    defaults: {
      global: {
        ripple: false,
      },
      VCard: {
        class: 'soviet-card',
        rounded: 'lg',
      },
      VBtn: {
        class: 'soviet-btn',
        color: 'primary',
        rounded: 'lg',
        height: 44,
        variant: 'flat',
      },
      VChip: {
        class: 'soviet-chip',
        color: 'primary',
        variant: 'flat',
      },
      VTextField: {
        class: 'soviet-input',
        color: 'primary',
        variant: 'outlined',
        density: 'comfortable',
      },
      VTextarea: {
        class: 'soviet-input',
        color: 'primary',
        variant: 'outlined',
        density: 'comfortable',
      },
      VSelect: {
        class: 'soviet-input',
        color: 'primary',
        variant: 'outlined',
        density: 'comfortable',
      },
      VCombobox: {
        class: 'soviet-input',
        color: 'primary',
        variant: 'outlined',
        density: 'comfortable',
      },
      VDialog: {
        class: 'soviet-card',
      },
      VDivider: {
        class: 'soviet-divider',
      },
    },
  })
  nuxtApp.vueApp.use(vuetify)
})
