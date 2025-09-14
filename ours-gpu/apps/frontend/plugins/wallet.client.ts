import { useWalletStore } from '~/stores/wallet'

export default defineNuxtPlugin(() => {
  if (process.server) return
  // Use Pinia store for wallet state and wiring
  const wallet = useWalletStore()
  // Initialize from existing authorization and wire events if connected
  wallet.initialize()
})
