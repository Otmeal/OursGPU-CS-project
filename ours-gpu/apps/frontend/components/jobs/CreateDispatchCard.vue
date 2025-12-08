<template>
  <v-card class="mb-6" variant="flat">
    <v-card-title>Dispatch</v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap align-center" style="gap: 16px;">
        <v-select
          :model-value="selectedWorkerId"
          :items="workerItems"
          label="Choose Worker"
          :loading="workersLoading"
          clearable
          class="flex-1-1"
          @update:model-value="emit('update:selectedWorkerId', $event || null)"
        />
      </div>
      <div class="mt-2" v-if="!walletAddress">
        <v-alert type="info" variant="tonal">
          Connect your wallet to create a job.
        </v-alert>
      </div>
      <div class="mt-2" v-else-if="registrationChecked && !walletRegistered">
        <v-alert type="warning" variant="tonal">
          Please finish wallet registration (name + email) from the top-right connect menu before creating jobs.
        </v-alert>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">

const emit = defineEmits<{
  (e: 'update:selectedWorkerId', value: string | null): void
}>()

const props = defineProps<{
  workerItems: { title: string, value: string }[]
  selectedWorkerId: string | null
  workersLoading: boolean
  walletAddress: string | null
  registrationChecked: boolean
  walletRegistered: boolean
}>()
</script>

<style scoped>
.flex-1-1 {
  flex: 1 1 300px;
  min-width: 280px;
}
</style>
