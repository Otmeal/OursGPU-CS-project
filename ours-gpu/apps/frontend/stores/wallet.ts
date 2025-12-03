// stores/wallet.ts
import { defineStore } from 'pinia'
import { ref, onBeforeUnmount } from 'vue'
import { createPublicClient, custom } from 'viem'
import { foundry } from 'viem/chains'
import { JobManagerAbi } from '@ours-gpu/shared/contracts/jobManager'
import { OrgRegistryAbi } from '@ours-gpu/shared/contracts/orgRegistry'
import { useRuntimeConfig } from '#app'
import { orgTupleToObject } from '@/utils/orgRegistry'

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
  const userOrgId = ref<string | null>(null)
  const userOrgName = ref<string | null>(null)
  const orgLoading = ref<boolean>(false)
  const registrationChecked = ref<boolean>(false)
  const walletRegistered = ref<boolean>(false)
  const registering = ref<boolean>(false)
  const registrationError = ref<string>('')

  const runtimeConfig = useRuntimeConfig()
  const apiBase = (runtimeConfig.public.apiBase || '/api').replace(/\/$/, '')

  // Desired chain (dev defaults to Anvil/Hardhat 31337)
  const DESIRED_CHAIN_ID = 31337
  const DESIRED_CHAIN_HEX = '0x' + DESIRED_CHAIN_ID.toString(16)
  const DESIRED_CHAIN_NAME = 'Local Anvil'
  const DESIRED_RPC_URLS = ['http://127.0.0.1:8545']

  // Keep references to listeners so we can remove them
  let accountsChangedHandler: ((accounts: string[]) => void) | null = null
  let chainChangedHandler: ((cidHex: string | number) => void) | null = null

  async function refreshWalletRegistration() {
    registrationChecked.value = false
    walletRegistered.value = false
    registrationError.value = ''
    const addr = (address.value || '').trim().toLowerCase()
    if (!addr) {
      registrationChecked.value = true
      return
    }
    try {
      const res = await fetch(`${apiBase}/wallets/${encodeURIComponent(addr)}`)
      walletRegistered.value = res.ok
    } catch (err: any) {
      registrationError.value = err?.message || 'Unable to check wallet registration'
      walletRegistered.value = false
    } finally {
      registrationChecked.value = true
    }
  }

  async function registerWallet(info: { name: string; email: string; pepperVersion?: number }) {
    if (!address.value) {
      throw new Error('No wallet connected')
    }
    registering.value = true
    registrationError.value = ''
    try {
      const res = await fetch(`${apiBase}/wallets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: address.value,
          name: info.name,
          email: info.email,
          pepperVersion: info.pepperVersion,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Registration failed (${res.status})`)
      }
      walletRegistered.value = true
    } catch (err: any) {
      registrationError.value = err?.message || 'Wallet registration failed'
      throw err
    } finally {
      registrationChecked.value = true
      registering.value = false
    }
  }

  /** Normalize and set address/connected based on accounts array */
  function applyAccounts(accounts: unknown) {
    // Defensive parse: MetaMask returns string[]; guard unknown
    const list = Array.isArray(accounts) ? (accounts as string[]) : []
    const first = list[0] ?? null
    address.value = first
    connected.value = !!first
    // Resolve org info whenever account changes
    void resolveUserOrgIfPossible()
    // Check registration status
    void refreshWalletRegistration()
  }

  /** Connect wallet (prompt; avoid silently reusing last account) */
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

      // Ask for permissions explicitly to show the account picker, even if previously authorized
      try {
        await provider.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        })
      } catch (permErr: any) {
        // 4001: user rejected; -32601: method not supported -> fall back
        if (permErr?.code === 4001) {
          return
        }
        if (permErr?.code !== -32601) {
          console.warn('wallet_requestPermissions failed (continuing):', permErr)
        }
      }

      // Request accounts (will return newly selected account)
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

  /** Disconnect (attempt to revoke MetaMask permissions, then clear local state) */
  async function disconnect(): Promise<void> {
    const provider = getEthereumProvider()
    if (provider) {
      try {
        await provider.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }],
        })
      } catch (error: any) {
        if (error?.code === 4001) {
          console.warn('User rejected MetaMask permission revoke.')
        } else if (error?.code !== -32601) {
          console.warn('Failed to revoke MetaMask permissions:', error)
        }
      }
    }
    address.value = null
    connected.value = false
    userOrgId.value = null
    userOrgName.value = null
    walletRegistered.value = false
    registrationChecked.value = false
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
        await resolveUserOrgIfPossible()
      }
    } catch (error) {
      console.error('Wallet initialize failed:', error)
    }
  }

  async function resolveUserOrgIfPossible(): Promise<void> {
    if (!connected.value || !address.value) {
      userOrgId.value = null
      userOrgName.value = null
      return
    }
    const provider = getEthereumProvider()
    if (!provider) return
    // Avoid overlapping requests
    if (orgLoading.value) return
    const cfg = useRuntimeConfig()
    const jmAddress = (cfg.public as any).jobManagerAddress as `0x${string}` | undefined
    if (!jmAddress || !jmAddress.startsWith('0x')) {
      userOrgId.value = null
      userOrgName.value = null
      return
    }
    orgLoading.value = true
    try {
      const publicClient = createPublicClient({ chain: foundry, transport: custom(provider) })
      const orgRegistry = (await publicClient.readContract({
        address: jmAddress,
        abi: JobManagerAbi,
        functionName: 'orgRegistry',
      })) as `0x${string}`
      const uOrg = (await publicClient.readContract({
        address: orgRegistry,
        abi: OrgRegistryAbi,
        functionName: 'userOrganizations',
        args: [address.value as `0x${string}`],
      })) as bigint
      userOrgId.value = uOrg ? uOrg.toString() : '0'
      try {
        const info = await publicClient.readContract({
          address: orgRegistry,
          abi: OrgRegistryAbi,
          functionName: 'organizations',
          args: [uOrg],
        })
        const normalized = orgTupleToObject(info)
        userOrgName.value = normalized?.name ?? null
      } catch {
        userOrgName.value = null
      }
    } catch (e) {
      userOrgId.value = null
      userOrgName.value = null
    } finally {
      orgLoading.value = false
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
    userOrgId,
    userOrgName,
    orgLoading,
    registrationChecked,
    walletRegistered,
    registering,
    registrationError,
    // actions
    connect,
    disconnect,
    initialize,
    resolveUserOrgIfPossible,
    refreshWalletRegistration,
    registerWallet,
  }
})
