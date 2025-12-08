<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <NuxtRouteAnnouncer />
</template>

<style>
/* Default buttons keep their case; themed buttons keep case but add spacing */
.v-btn__content {
  text-transform: none;
}
.soviet-btn .v-btn__content {
  text-transform: none;
  letter-spacing: 0.08em;
}
</style>
