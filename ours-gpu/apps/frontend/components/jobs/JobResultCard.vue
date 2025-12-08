<template>
  <v-card class="mb-4" variant="tonal">
    <v-card-title class="text-subtitle-1">Result</v-card-title>
    <v-card-text>
      <div class="d-flex flex-column" style="gap: 12px;">
        <div v-if="job?.outputObjectKey">
          <div class="text-caption text-medium-emphasis">Saved as</div>
          <code>{{ job.outputObjectKey }}</code>
          <div class="mt-2">
            <a v-if="job?.outputGetUrl" :href="job.outputGetUrl" target="_blank" rel="noopener noreferrer">
              <v-btn color="primary" variant="elevated">Download Result</v-btn>
            </a>
            <span v-else class="text-medium-emphasis">No download URL</span>
          </div>
        </div>
        <div v-if="job?.solution">
          <div class="text-caption text-medium-emphasis">Inline preview</div>
          <pre class="result-pre">{{ job.solution }}</pre>
        </div>
        <div v-if="!job?.outputObjectKey && !job?.solution" class="text-medium-emphasis">No result yet.</div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { JobDetail } from '@/types/jobs'

defineProps<{
  job: JobDetail | null
}>()
</script>

<style scoped>
.result-pre {
  background: rgba(0, 0, 0, 0.04);
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
