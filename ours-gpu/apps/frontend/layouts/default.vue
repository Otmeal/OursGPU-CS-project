<template>
  <v-app>
    <v-app-bar app density="comfortable">
      <v-app-bar-title class="d-flex align-center gap-2">
        <span>OursGPU</span>
      </v-app-bar-title>
      <template #append>
        <WalletConnect />
      </template>
    </v-app-bar>

    <v-main>
      <v-container class="py-6">
        <slot />
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import WalletConnect from '@/components/WalletConnect.vue'
</script>

<style scoped>
.gap-2 { gap: 8px; }
</style>
