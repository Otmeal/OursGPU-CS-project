import { useWalletStore } from '@/stores/wallet'

export default defineNuxtRouteMiddleware(async (to) => {
  // Always allow root, and skip server-side (we run purely on the client)
  if (process.server || to.path === '/') return

  const wallet = useWalletStore()

  // Hydrate wallet state before guarding routes to avoid false redirects
  await wallet.initialize()

  // Ensure we have the latest registration status
  if (!wallet.registrationChecked) {
    try {
      await wallet.refreshWalletRegistration()
    } catch {
      // Best effort; fall through to the linked check
    }
  }

  const walletLinked = wallet.connected && wallet.walletRegistered
  if (!walletLinked) {
    return navigateTo('/', { replace: true })
  }
})
