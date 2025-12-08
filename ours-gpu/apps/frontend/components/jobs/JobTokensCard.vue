<template>
  <v-card class="mb-4" variant="flat">
    <v-card-title class="text-subtitle-1">Tokens</v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap" style="gap: 24px;">
        <div>
          <div class="text-caption text-medium-emphasis">Staked (max)</div>
          <div>{{ stakedTokensDisplay }}</div>
        </div>
        <div>
          <div class="text-caption text-medium-emphasis">Actual Spent</div>
          <div>{{ spentTokensDisplay }}</div>
        </div>
        <div v-if="paidToWorkerDisplay !== '—'">
          <div class="text-caption text-medium-emphasis">Paid to Worker</div>
          <div>{{ paidToWorkerDisplay }}</div>
        </div>
      </div>
      <div v-if="!hasChainInfo" class="text-medium-emphasis mt-2">
        No on-chain staking info found for this job.
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { JobDetail } from '@/types/jobs'
import { formatTokenAmount } from '@/utils/formatters'

const props = defineProps<{
  job: JobDetail | null
}>()

const hasChainInfo = computed(() => !!props.job?.chain)
const tokenDecimals = computed(() => {
  const d = props.job?.chain?.tokenDecimals
  return Number.isFinite(d as number) ? Number(d) : 18
})
const stakedTokensDisplay = computed(() =>
  formatTokenAmount(props.job?.chain?.stakedTokens ?? props.job?.chain?.reward, tokenDecimals.value),
)
const spentTokensDisplay = computed(() =>
  formatTokenAmount(props.job?.chain?.spentTokens, tokenDecimals.value),
)
const paidToWorkerDisplay = computed(() =>
  formatTokenAmount(props.job?.chain?.payoutToWorker, tokenDecimals.value),
)
</script>
