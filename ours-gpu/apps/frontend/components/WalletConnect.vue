<template>
  <div>
    <v-btn
      v-if="!connected"
      color="primary"
      @click="connect"
      :loading="pending"
    >
      Connect Wallet
    </v-btn>

    <v-menu v-else location="bottom end">
      <template #activator="{ props }">
        <v-btn v-bind="props" color="primary" variant="elevated" style="text-transform: none;">
          {{ shortAddress }}
        </v-btn>
      </template>
      <v-list>
        <v-list-item>
          <v-list-item-title class="text-caption">Address</v-list-item-title>
          <v-list-item-subtitle>{{ address }}</v-list-item-subtitle>
        </v-list-item>
        <v-list-item>
          <v-list-item-title class="text-caption">Chain</v-list-item-title>
          <v-list-item-subtitle>{{ chainLabel }}</v-list-item-subtitle>
        </v-list-item>
        <v-divider></v-divider>
        <v-list-item @click="disconnect">
          <v-list-item-title>Disconnect</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>

    <v-dialog v-model="registrationDialog" max-width="480">
      <v-card>
        <v-card-title>Complete wallet registration</v-card-title>
        <v-card-text>
          <p class="text-body-2 mb-3">
            Provide a name and email to link this wallet to the service.
          </p>
          <v-alert
            v-if="registrationError"
            type="error"
            variant="tonal"
            class="mb-3"
          >
            {{ registrationError }}
          </v-alert>
          <v-text-field
            v-model="regName"
            label="Name"
            density="comfortable"
            required
          />
          <v-text-field
            v-model="regEmail"
            label="Email"
            density="comfortable"
            required
            type="email"
          />
          <v-text-field
            v-model="regPepper"
            label="Pepper version (optional)"
            density="comfortable"
            type="number"
            min="1"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="registering" @click="snoozeDialog">Later</v-btn>
          <v-btn
            color="primary"
            :loading="registering"
            :disabled="!canSubmit"
            @click="submitRegistration"
          >
            Register
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
  
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useWalletStore } from '@/stores/wallet'

const wallet = useWalletStore()
const {
  address,
  chainId,
  connected,
  pending,
  walletRegistered,
  registrationChecked,
  registrationError,
  registering,
} = storeToRefs(wallet)
const { connect, disconnect, registerWallet, refreshWalletRegistration } = wallet

const regName = ref('')
const regEmail = ref('')
const regPepper = ref<string>('')
const registrationDialog = ref(false)
const snoozedAddress = ref<string | null>(null)

const shortAddress = computed(() => {
  const a = address.value
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—'
})

const chainLabel = computed(() => {
  const id = chainId.value
  if (!id) return 'Unknown'
  // Common dev/ETH IDs; extend as needed
  const names: Record<number, string> = {
    31337: 'Anvil',
  }
  return names[id] ?? `Chain ${id}`
})

const canSubmit = computed(() => {
  return !!regName.value.trim() && !!regEmail.value.trim()
})

watch(
  [connected, registrationChecked, walletRegistered, address],
  ([isConnected, checked, registered, addr]) => {
    const normalizedAddr = (addr || '').toLowerCase()
    if (!isConnected) {
      registrationDialog.value = false
      snoozedAddress.value = null
      return
    }
    if (checked && !registered && snoozedAddress.value !== normalizedAddr) {
      registrationDialog.value = true
    }
    if (registered) {
      registrationDialog.value = false
      snoozedAddress.value = null
    }
  },
)

async function submitRegistration() {
  if (!canSubmit.value) return
  const pepperNum =
    regPepper.value && !Number.isNaN(Number(regPepper.value))
      ? Number(regPepper.value)
      : undefined
  try {
    await registerWallet({
      name: regName.value.trim(),
      email: regEmail.value.trim(),
      pepperVersion: pepperNum,
    })
    registrationDialog.value = false
    snoozedAddress.value = null
    await refreshWalletRegistration()
  } catch {
    // Error is surfaced via registrationError alert
  }
}

function snoozeDialog() {
  snoozedAddress.value = (address.value || '').toLowerCase() || null
  registrationDialog.value = false
}
</script>

<style scoped>
.mr-2 { margin-right: 8px; }
</style>
