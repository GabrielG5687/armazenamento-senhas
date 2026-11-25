<script setup lang="ts">
import { computed } from 'vue';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const props = defineProps<{
  toast: Toast;
  onDismiss: (id: string) => void;
}>();

const typeClasses = computed(() => {
  switch (props.toast.type) {
    case 'success':
      return 'bg-sv-success/10 border-sv-success/20 text-sv-success';
    case 'error':
      return 'bg-sv-danger/10 border-sv-danger/20 text-sv-danger';
    default:
      return 'bg-sv-panel border-sv-border text-sv-text';
  }
});
</script>

<template>
  <div
    class="flex items-start gap-3 px-4 py-3 rounded-xl border shadow-sv animate-in slide-in-from-right duration-200"
    :class="typeClasses"
  >
    <div class="flex-shrink-0 mt-0.5">
      <svg
        v-if="toast.type === 'success'"
        class="h-5 w-5 text-sv-success"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 13l4 4L19 7"
        />
      </svg>
      <svg
        v-else-if="toast.type === 'error'"
        class="h-5 w-5 text-sv-danger"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
      <svg
        v-else
        class="h-5 w-5 text-sv-muted"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </div>
    <p class="text-sm text-sv-text leading-relaxed">{{ toast.message }}</p>
    <button
      class="ml-auto flex-shrink-0 opacity-50 hover:opacity-100 transition"
      @click="(props as any).onDismiss(props.toast.id)"
    >
      <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>
