<template>
  <v-expansion-panels variant="accordion">
    <v-expansion-panel>
      <v-expansion-panel-title>Raw Job JSON</v-expansion-panel-title>
      <v-expansion-panel-text>
        <pre class="raw-pre">{{ job }}</pre>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
</template>

<script setup lang="ts">
import type { JobDetail } from '@/types/jobs'

defineProps<{
  job: JobDetail | null
}>()
</script>

<style scoped>
.raw-pre {
  background: rgba(0, 0, 0, 0.04);
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 360px;
  overflow: auto;
}
</style>
