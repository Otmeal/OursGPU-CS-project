<template>
  <v-card class="mb-4" variant="flat">
    <v-card-title class="text-subtitle-1">Metrics</v-card-title>
    <v-card-text>
      <div v-if="metrics">
        <pre class="metrics-pre">{{ metricsPretty }}</pre>
      </div>
      <div v-else class="text-medium-emphasis">No metrics reported.</div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{
  metrics: unknown
  metricsPretty: string
}>()
</script>

<style scoped>
.metrics-pre {
  background: rgba(0, 0, 0, 0.04);
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
