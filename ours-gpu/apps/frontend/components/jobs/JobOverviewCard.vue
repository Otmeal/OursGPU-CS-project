<template>
  <v-card class="mb-4" variant="flat">
    <v-card-title class="text-subtitle-1">Overview</v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap" style="gap: 24px;">
        <div>
          <div class="text-caption text-medium-emphasis">Status</div>
          <v-chip size="small" :color="statusColor(job?.status)" variant="tonal">
            {{ job?.status || '—' }}
          </v-chip>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Type</div>
          <div>{{ job?.jobType || '—' }}</div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Worker</div>
          <code>{{ job?.workerId || '—' }}</code>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Created</div>
          <div>{{ formatTimestamp(job?.createdAt) }}</div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Verification</div>
          <div>{{ job?.verification || '—' }}</div>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { JobDetail } from '@/types/jobs'
import { formatTimestamp, statusColor } from '@/utils/formatters'

defineProps<{
  job: JobDetail | null
}>()
</script>
