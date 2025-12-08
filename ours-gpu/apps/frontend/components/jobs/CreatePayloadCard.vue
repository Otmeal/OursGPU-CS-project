<template>
  <v-card class="mb-6" variant="tonal">
    <v-card-title>Payload</v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap align-center" style="gap: 16px;">
        <v-file-input
          :model-value="payloadFile"
          label="Program / Payload file"
          accept=".js,.py,.sh,.zip,.tar.gz,.txt,*/*"
          prepend-icon="mdi-file-upload"
          :disabled="uploading || creating"
          class="flex-1-1"
          @update:model-value="emit('update:payloadFile', $event as File | null)"
        />
        <v-text-field
          :model-value="objectKey"
          label="Object Key (MinIO)"
          hint="e.g. programs/hash-miner-<timestamp>.js"
          persistent-hint
          :disabled="uploading || creating"
          class="flex-1-1"
          @update:model-value="emit('update:objectKey', $event || '')"
        />
        <v-btn
          color="primary"
          :loading="uploading"
          :disabled="!payloadFile || !objectKey || creating"
          @click="emit('upload')"
        >
          Upload
        </v-btn>
      </div>
      <div class="mt-2 text-caption" v-if="uploadedPayload">
        Uploaded to: <code>{{ uploadedPayload }}</code>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (e: 'update:payloadFile', file: File | null): void
  (e: 'update:objectKey', value: string): void
  (e: 'upload'): void
}>()

defineProps<{
  payloadFile: File | null
  objectKey: string
  uploading: boolean
  creating: boolean
  uploadedPayload: string | null
}>()
</script>

<style scoped>
.flex-1-1 {
  flex: 1 1 300px;
  min-width: 280px;
}
</style>
