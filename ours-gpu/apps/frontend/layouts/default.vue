<template>
  <v-app class="soviet-app">
    <v-app-bar app density="comfortable" class="soviet-app-bar" flat>
      <v-app-bar-title>
        <NuxtLink to="/" class="title-link d-flex align-center gap-2">
          <div>
            <div>OursGPU</div>
          </div>
        </NuxtLink>
      </v-app-bar-title>
      <template #append>
        <WalletConnect />
      </template>
    </v-app-bar>

    <v-main class="soviet-main">
      <v-container class="py-6" fluid>
        <div class="soviet-shell">
          <slot />
        </div>
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
.soviet-main {
  background: transparent;
}
</style>
