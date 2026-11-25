<script setup lang="ts">
const props = defineProps<{
  open: boolean;
  title?: string;
  closeOnOverlayClick?: boolean;
}>();

const emit = defineEmits(['update:open', 'close']);

function handleOverlayClick(e: Event) {
  if (e.target === e.currentTarget && props.closeOnOverlayClick !== false) {
    (emit as any)('update:open', false);
  }
}
</script>

<template>
  <teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-sv-dark/80 backdrop-blur-sm p-4"
      @click="handleOverlayClick"
    >
      <div
        class="sv-card w-full max-w-lg shadow-2xl border-sv-border"
        @click.stop
      >
        <div class="flex justify-between items-start mb-4">
          <h3
            v-if="title"
            class="text-lg font-semibold text-sv-text"
          >
            {{ title }}
          </h3>
          <button
            class="sv-btn-ghost p-1.5 hover:bg-sv-panel rounded-lg"
            @click="(emit as any)('update:open', false)"
          >
            <svg
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div><slot /></div>
      </div>
    </div>
  </teleport>
</template>
