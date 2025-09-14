<template>
  <div>
    <v-btn
      v-if="!connected"
      color="primary"
      @click="connect"
      :loading="pending"
    >
      Connect Wallet
    </v-btn>

    <v-menu v-else location="bottom end">
      <template #activator="{ props }">
        <v-btn v-bind="props" color="primary" variant="elevated" style="text-transform: none;">
          {{ shortAddress }}
        </v-btn>
      </template>
      <v-list>
        <v-list-item>
          <v-list-item-title class="text-caption">Address</v-list-item-title>
          <v-list-item-subtitle>{{ address }}</v-list-item-subtitle>
        </v-list-item>
        <v-list-item>
          <v-list-item-title class="text-caption">Chain</v-list-item-title>
          <v-list-item-subtitle>{{ chainLabel }}</v-list-item-subtitle>
        </v-list-item>
        <v-divider></v-divider>
        <v-list-item @click="disconnect">
          <v-list-item-title>Disconnect</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </div>
  
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useWalletStore } from '@/stores/wallet'
const wallet = useWalletStore()
const { address, chainId, connected, pending } = storeToRefs(wallet)
const { connect, disconnect } = wallet

const shortAddress = computed(() => {
  const a = address.value
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
})

const chainLabel = computed(() => {
  const id = chainId.value
  if (!id) return 'Unknown'
  // Common dev/ETH IDs; extend as needed
  const names: Record<number, string> = {
    31337: 'Anvil',
  }
  return names[id] ?? `Chain ${id}`
})
</script>

<style scoped>
.mr-2 { margin-right: 8px; }
</style>
