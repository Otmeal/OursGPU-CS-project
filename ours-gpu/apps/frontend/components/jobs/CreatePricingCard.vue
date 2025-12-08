<template>
  <v-card class="mb-6" variant="tonal">
    <v-card-title>Pricing Preview</v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap" style="gap: 16px;">
        <v-text-field
          :model-value="feePerHourDisplay"
          label="Fee / hour"
          class="flex-1-1"
          readonly
        />
        <v-text-field
          :model-value="quotedRewardDisplay"
          label="Staked Tokens (max)"
          class="flex-1-1"
          readonly
        />
        <v-text-field
          :model-value="distanceDisplay"
          label="Org Distance"
          class="flex-1-1"
          readonly
        />
        <v-text-field
          :model-value="baseRateDisplay"
          label="baseRate (4dp)"
          class="flex-1-1"
          readonly
        />
        <v-text-field
          :model-value="perLevelMarkupDisplay"
          label="perLevelMarkup (4dp)"
          class="flex-1-1"
          readonly
        />
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{
  feePerHourDisplay: string
  quotedRewardDisplay: string
  distanceDisplay: string
  baseRateDisplay: string
  perLevelMarkupDisplay: string
}>()
</script>

<style scoped>
.flex-1-1 {
  flex: 1 1 300px;
  min-width: 280px;
}
</style>
