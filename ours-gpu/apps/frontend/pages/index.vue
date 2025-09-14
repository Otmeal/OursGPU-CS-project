<template>
  <div>
    <h1 class="text-h4 mb-4">Welcome to OursGPU</h1>
    <p class="mb-6">
      This is a simple Nuxt page scaffolded for the dev environment.
    </p>

    <v-card variant="tonal" class="pa-4 mb-6">
      <v-card-title class="text-subtitle-1">Wallet Status</v-card-title>
      <v-card-text>
        <div class="mb-2">Connected: <strong>{{ connected ? 'Yes' : 'No' }}</strong></div>
        <div class="mb-2">Address: <code>{{ address || '—' }}</code></div>
        <div>Chain ID: <code>{{ chainId ?? '—' }}</code></div>
      </v-card-text>
    </v-card>

    <v-btn color="primary" @click="connect" :loading="pending" :disabled="connected">
      Connect Wallet
    </v-btn>
    <v-btn class="ml-3" color="secondary" @click="disconnect" :disabled="!connected">
      Disconnect
    </v-btn>

    <div class="mt-6">
      <NuxtLink to="/jobs/new">
        <v-btn color="primary" variant="tonal">Create a Job</v-btn>
      </NuxtLink>
      <NuxtLink to="/jobs">
        <v-btn class="ml-3" color="primary" variant="elevated">My Jobs</v-btn>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useWalletStore } from '@/stores/wallet'

const wallet = useWalletStore()
const { address, chainId, connected, pending } = storeToRefs(wallet)
const { connect, disconnect } = wallet
</script>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.mb-6 { margin-bottom: 24px; }
.ml-3 { margin-left: 12px; }
.mt-6 { margin-top: 24px; }
</style>
