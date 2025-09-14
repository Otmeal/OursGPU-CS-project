import { VueQueryPlugin, QueryClient, dehydrate, hydrate } from '@tanstack/vue-query'
import { defineNuxtPlugin } from '#app'

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient()
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })

  if (process.server) {
    nuxtApp.hooks.hook('app:rendered', () => {
      ;(nuxtApp.payload as any).vueQueryState = dehydrate(queryClient)
    })
  }

  if (process.client) {
    const state = (nuxtApp.payload as any)?.vueQueryState
    if (state) {
      hydrate(queryClient, state)
    }
  }
})
