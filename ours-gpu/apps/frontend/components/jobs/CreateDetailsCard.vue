<template>
  <v-card class="mb-6" variant="tonal">
    <v-card-title>Job Details</v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap" style="gap: 16px;">
        <v-text-field :model-value="userOrgNameDisplay" label="Organization" class="flex-1-1" readonly />
        <v-text-field
          :model-value="jobType"
          label="Job Type"
          class="flex-1-1"
          @update:model-value="emit('update:jobType', $event || '')"
        />
        <v-text-field
          :model-value="quotedRewardDisplay"
          label="Staked Tokens (max)"
          class="flex-1-1"
          readonly
          hint="Computed from schedule and org pricing"
          persistent-hint
        />
        <v-select
          :model-value="verification"
          :items="verificationItems"
          label="Verification"
          class="flex-1-1"
          @update:model-value="emit('update:verification', $event)"
        />
        <v-text-field
          :model-value="priority"
          type="number"
          label="Priority"
          class="flex-1-1"
          @update:model-value="emit('update:priority', Number($event ?? 0))"
        />
      </div>

      <v-textarea
        :model-value="entryCommand"
        label="Entry Command"
        hint="Runs inside worker environment. $PAYLOAD_PATH is set to the uploaded file."
        persistent-hint
        rows="3"
        class="mt-2"
        @update:model-value="emit('update:entryCommand', $event || '')"
      />

      <div v-if="verification === 'USER_PROGRAM'" class="mt-4">
        <v-divider class="mb-4" />
        <h3 class="text-subtitle-1 mb-2">Custom Verifier</h3>
        <div class="d-flex flex-wrap align-center" style="gap: 16px;">
          <v-file-input
            :model-value="verifierFile"
            label="Verifier file (optional)"
            accept=".js,.py,.sh,.zip,.tar.gz,.txt,*/*"
            prepend-icon="mdi-file-upload"
            :disabled="uploadingVerifier || creating"
            class="flex-1-1"
            @update:model-value="emit('update:verifierFile', $event as File | null)"
          />
          <v-text-field
            :model-value="verifierObjectKey"
            label="Verifier Object Key"
            hint="e.g. verifiers/hash-verifier-<timestamp>.js"
            persistent-hint
            :disabled="uploadingVerifier || creating"
            class="flex-1-1"
            @update:model-value="emit('update:verifierObjectKey', $event || '')"
          />
          <v-btn
            color="primary"
            :loading="uploadingVerifier"
            :disabled="!verifierFile || !verifierObjectKey || creating"
            @click="emit('upload-verifier')"
          >
            Upload Verifier
          </v-btn>
        </div>
        <v-text-field
          :model-value="verifierCommand"
          label="Verifier Command"
          hint="Command to run verifier; $VERIFIER_PATH will point to uploaded file"
          persistent-hint
          class="mt-2"
          @update:model-value="emit('update:verifierCommand', $event || '')"
        />
        <div class="mt-2 text-caption" v-if="uploadedVerifier">
          Uploaded verifier to: <code>{{ uploadedVerifier }}</code>
        </div>
      </div>

      <v-textarea
        :model-value="metadataJson"
        class="mt-4"
        label="Metadata (JSON, optional)"
        rows="3"
        :error="metadataError !== ''"
        :error-messages="metadataError"
        @update:model-value="emit('update:metadataJson', $event || '')"
      />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import type { VerificationType } from '@/types/jobs'

const emit = defineEmits<{
  (e: 'update:jobType', value: string): void
  (e: 'update:verification', value: VerificationType): void
  (e: 'update:priority', value: number): void
  (e: 'update:entryCommand', value: string): void
  (e: 'update:metadataJson', value: string): void
  (e: 'update:verifierFile', file: File | null): void
  (e: 'update:verifierObjectKey', value: string): void
  (e: 'update:verifierCommand', value: string): void
  (e: 'upload-verifier'): void
}>()

defineProps<{
  userOrgNameDisplay: string
  jobType: string
  verification: VerificationType
  verificationItems: { title: string, value: VerificationType }[]
  priority: number
  entryCommand: string
  quotedRewardDisplay: string
  metadataJson: string
  metadataError: string
  verifierFile: File | null
  verifierObjectKey: string
  verifierCommand: string
  uploadedVerifier: string | null
  uploadingVerifier: boolean
  creating: boolean
}>()
</script>

<style scoped>
.flex-1-1 {
  flex: 1 1 300px;
  min-width: 280px;
}
</style>
