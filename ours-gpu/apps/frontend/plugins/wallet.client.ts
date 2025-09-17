import { useWalletStore } from '@/stores/wallet'

export default defineNuxtPlugin(() => {
  if (process.server) return
  const wallet = useWalletStore()
  // Recover previously authorized wallet without prompting the user again.
  void wallet.initialize()
})
