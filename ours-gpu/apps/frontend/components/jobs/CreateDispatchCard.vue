<template>
  <v-card class="mb-6" variant="tonal">
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
        <v-btn
          color="primary"
          :loading="creating"
          :disabled="disableCreate"
          @click="emit('create')"
        >
          Create Job
        </v-btn>
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
      <div class="mt-3" v-if="createdJobId">
        <v-alert type="success" variant="tonal">
          <div class="d-flex flex-column" style="gap: 12px;">
            <div>Job created: <code>{{ createdJobId }}</code></div>
            <div class="d-flex flex-wrap" style="gap: 12px;">
              <v-btn color="primary" variant="elevated" :to="createdJobLink">View Job</v-btn>
              <v-btn variant="tonal" :to="jobsListLink">Go to Jobs</v-btn>
            </div>
          </div>
        </v-alert>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const emit = defineEmits<{
  (e: 'update:selectedWorkerId', value: string | null): void
  (e: 'create'): void
}>()

const props = defineProps<{
  workerItems: { title: string, value: string }[]
  selectedWorkerId: string | null
  workersLoading: boolean
  creating: boolean
  objectKey: string
  uploadedPayload: string | null
  walletReadyForJobs: boolean
  walletAddress: string | null
  registrationChecked: boolean
  walletRegistered: boolean
  createdJobId: string | null
  createdJobLink: string | null
  jobsListLink: string
}>()

const disableCreate = computed(() =>
  props.creating
  || !props.objectKey
  || !props.uploadedPayload
  || !props.selectedWorkerId
  || !props.walletReadyForJobs,
)
</script>

<style scoped>
.flex-1-1 {
  flex: 1 1 300px;
  min-width: 280px;
}
</style>
