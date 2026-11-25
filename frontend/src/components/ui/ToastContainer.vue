<script setup lang="ts">
import { ref, computed } from 'vue';
import { useToast } from '@/composables/useToast';
import Toast from '@/components/ui/Toast.vue';

const { toasts, dismiss } = useToast();

const orderedToasts = computed(() => [...toasts.value].reverse());
</script>

<template>
  <div class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    <transition-group
      name="toast"
      class="flex flex-col gap-2 pointer-events-auto"
    >
      <Toast
        v-for="toast of orderedToasts"
        :key="toast.id"
        :toast="toast"
        @dismiss="dismiss"
      />
    </transition-group>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
