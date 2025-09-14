// stores/wallet.ts
import { defineStore } from 'pinia'
import { ref, onBeforeUnmount } from 'vue'

/** Minimal EIP-1193-like provider shape */
export type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, cb: (...args: any[]) => void) => void
  removeListener?: (event: string, cb: (...args: any[]) => void) => void
}

/** SSR-safe accessor */
function getEthereumProvider(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as any).ethereum as EthereumProvider | undefined
}

export const useWalletStore = defineStore('wallet', () => {
  // --- state ---
  const address = ref<string | null>(null)
  const chainId = ref<number | null>(null)
  const connected = ref<boolean>(false)
  const pending = ref<boolean>(false)

  // Desired chain (dev defaults to Anvil/Hardhat 31337)
  const DESIRED_CHAIN_ID = 31337
  const DESIRED_CHAIN_HEX = '0x' + DESIRED_CHAIN_ID.toString(16)
  const DESIRED_CHAIN_NAME = 'Local Anvil'
  const DESIRED_RPC_URLS = ['http://localhost:8545']

  // Keep references to listeners so we can remove them
  let accountsChangedHandler: ((accounts: string[]) => void) | null = null
  let chainChangedHandler: ((cidHex: string | number) => void) | null = null

  /** Normalize and set address/connected based on accounts array */
  function applyAccounts(accounts: unknown) {
    // Defensive parse: MetaMask returns string[]; guard unknown
    const list = Array.isArray(accounts) ? (accounts as string[]) : []
    const first = list[0] ?? null
    address.value = first
    connected.value = !!first
  }

  /** Connect wallet (prompts user) */
  async function connect(): Promise<void> {
    const provider = getEthereumProvider()
    if (!provider) {
      // You may surface a toast/snackbar in your UI instead of console.warn
      // Avoid throwing to keep UX smooth.
      console.warn('No Ethereum provider found. Please install MetaMask.')
      return
    }

    try {
      pending.value = true

      // Request accounts
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      applyAccounts(accounts)

      // Fetch chainId (hex in most wallets)
      const cidHex = (await provider.request({ method: 'eth_chainId' })) as string | number
      // Number('0x1') === 1; if not finite, store null
      const parsed = typeof cidHex === 'string' ? Number(cidHex) : Number(cidHex)
      chainId.value = Number.isFinite(parsed) ? parsed : null

      // If not on desired chain, request a network switch
      if (chainId.value !== null && chainId.value !== DESIRED_CHAIN_ID) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: DESIRED_CHAIN_HEX }],
          })
          chainId.value = DESIRED_CHAIN_ID
        } catch (err: any) {
          // 4902: Unrecognized chain, try to add
          if (err && (err.code === 4902 || err?.data?.originalError?.code === 4902)) {
            try {
              await provider.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: DESIRED_CHAIN_HEX,
                    chainName: DESIRED_CHAIN_NAME,
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: DESIRED_RPC_URLS,
                  },
                ],
              })
              // Switch again after adding
              await provider.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: DESIRED_CHAIN_HEX }],
              })
              chainId.value = DESIRED_CHAIN_ID
            } catch (addErr) {
              console.warn('User declined or failed to add/switch chain:', addErr)
            }
          } else if (err?.code === 4001) {
            // 4001: User rejected the request
            console.warn('User rejected chain switch.')
          } else {
            console.warn('Failed to switch chain:', err)
          }
        }
      }

      // Wire events after successful connect
      wireEvents()
    } catch (error) {
      console.error('Wallet connect failed:', error)
    } finally {
      pending.value = false
    }
  }

  /** Disconnect (local only; most EVM wallets do not expose a true disconnect) */
  function disconnect(): void {
    address.value = null
    connected.value = false
    // Keep last known chainId to avoid surprising UI jumps
    unwireEvents()
  }

  /** Attach EIP-1193 events if supported */
  function wireEvents(): void {
    const provider = getEthereumProvider()
    if (!provider?.on) return

    // Accounts
    accountsChangedHandler = (accs: string[]) => {
      applyAccounts(accs)
    }
    provider.on('accountsChanged', accountsChangedHandler)

    // Chain
    chainChangedHandler = (cid: string | number) => {
      const parsed = typeof cid === 'string' ? Number(cid) : Number(cid)
      chainId.value = Number.isFinite(parsed) ? parsed : null
    }
    provider.on('chainChanged', chainChangedHandler)
  }

  /** Remove listeners to avoid memory leaks */
  function unwireEvents(): void {
    const provider = getEthereumProvider()
    if (!provider?.removeListener) return

    if (accountsChangedHandler) {
      provider.removeListener('accountsChanged', accountsChangedHandler)
      accountsChangedHandler = null
    }
    if (chainChangedHandler) {
      provider.removeListener('chainChanged', chainChangedHandler)
      chainChangedHandler = null
    }
  }

  /** Optional: initialize on mount to recover existing connection */
  async function initialize(): Promise<void> {
    const provider = getEthereumProvider()
    if (!provider) return
    try {
      const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
      applyAccounts(accounts)
      if (connected.value) {
        const cidHex = (await provider.request({ method: 'eth_chainId' })) as string | number
        const parsed = typeof cidHex === 'string' ? Number(cidHex) : Number(cidHex)
        chainId.value = Number.isFinite(parsed) ? parsed : null
        wireEvents()
      }
    } catch (error) {
      console.error('Wallet initialize failed:', error)
    }
  }

  // Cleanup if a component using this store unmounts
  onBeforeUnmount(() => {
    unwireEvents()
  })

  return {
    // state
    address,
    chainId,
    connected,
    pending,
    // actions
    connect,
    disconnect,
    initialize,
  }
})
