<template>
  <div>
    <section class="soviet-hero">
      <div class="d-flex flex-wrap align-center hero-head">
        <div>
          <h1 class="mb-2">OursGPU Control Center</h1>
        </div>
        <v-spacer />
        <v-chip color="secondary" size="large" variant="flat" class="status-chip">
          {{ connected ? 'Connected' : 'Not connected' }}
        </v-chip>
        <template v-if="!connected">
          <v-btn color="primary" @click="connect" :loading="pending">
            Connect Wallet
          </v-btn>
        </template>
        <template v-else>
          <v-btn color="secondary" variant="tonal" @click="disconnect">
            Disconnect
          </v-btn>
        </template>
      </div>

      <div class="accent-grid mb-4">
        <div class="accent-tile">
          <strong>Wallet</strong>
          <div>{{ shortAddress }}</div>
        </div>
        <div class="accent-tile">
          <strong>Chain</strong>
          <div>{{ chainLabel }}</div>
        </div>
      </div>

      <div class="hero-actions d-flex flex-wrap align-center">
        <v-spacer />
        <v-btn
          color="accent"
          variant="elevated"
          :to="connected ? '/jobs/new' : undefined"
          :disabled="!connected"
        >
          Create Job
        </v-btn>
        <v-btn
          color="primary"
          variant="outlined"
          :to="connected ? '/jobs' : undefined"
          :disabled="!connected"
        >
          My Jobs
        </v-btn>
      </div>
    </section>

    <v-card variant="flat" class="pa-4 mb-6 soviet-card">
      <v-card-title class="text-subtitle-1">Wallet Status</v-card-title>
      <v-card-text>
        <div class="mb-2">Connected: <strong>{{ connected ? 'Yes' : 'No' }}</strong></div>
        <div class="mb-2">Address: <code>{{ address || '—' }}</code></div>
        <div>Chain ID: <code>{{ chainId ?? '—' }}</code></div>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useWalletStore } from '@/stores/wallet'

const wallet = useWalletStore()
const { address, chainId, connected, pending } = storeToRefs(wallet)
const { connect, disconnect } = wallet

const shortAddress = computed(() => {
  const a = address.value
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : 'Not linked'
})

const chainLabel = computed(() => {
  const id = chainId.value
  if (!id) return 'Unknown'
  const names: Record<number, string> = {
    31337: 'Anvil',
  }
  return names[id] ?? `Chain ${id}`
})
</script>

<style scoped>
.hero-head {
  gap: 12px;
}
.hero-actions {
  margin-top: 8px;
  gap: 12px;
}
.status-chip {
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
@media (max-width: 600px) {
  .hero-actions {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
