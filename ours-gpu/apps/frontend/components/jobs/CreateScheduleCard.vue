<template>
  <v-card class="mb-6" variant="flat">
    <v-card-title>Schedule</v-card-title>
    <v-card-text>
      <div class="d-flex flex-wrap" style="gap: 16px;">
        <v-text-field
          :model-value="startAtInput"
          type="datetime-local"
          label="Start Time"
          class="flex-1-1"
          :disabled="creating"
          @update:model-value="emit('update:startAtInput', $event || '')"
        />
        <v-text-field
          :model-value="killAtInput"
          type="datetime-local"
          label="Kill Time"
          class="flex-1-1"
          :disabled="creating"
          @update:model-value="emit('update:killAtInput', $event || '')"
        />
      </div>
      <div class="mt-2 text-caption">
        Duration: {{ durationDisplay }}
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  (e: 'update:startAtInput', value: string): void
  (e: 'update:killAtInput', value: string): void
}>()

defineProps<{
  startAtInput: string
  killAtInput: string
  creating: boolean
  durationDisplay: string
}>()
</script>

<style scoped>
.flex-1-1 {
  flex: 1 1 300px;
  min-width: 280px;
}
</style>
