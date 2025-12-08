<template>
  <v-app>
    <v-app-bar app density="comfortable">
      <v-app-bar-title>
        <NuxtLink to="/" class="title-link d-flex align-center gap-2">
          <span>OursGPU</span>
        </NuxtLink>
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
.title-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}
.title-link:hover {
  color: inherit;
  text-decoration: none;
}
</style>
