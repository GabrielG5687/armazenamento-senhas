<script setup lang="ts">
const props = defineProps<{
  title?: string;
  description?: string;
  icon?: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center py-20 text-center">
    <div v-if="icon" class="mb-4 opacity-30">
      <component :is="icon" class="h-12 w-12 text-sv-muted" />
    </div>
    <h3 v-if="title" class="text-lg font-semibold text-sv-text mb-1">
      {{ title }}
    </h3>
    <p v-if="description" class="text-sv-muted">
      {{ description }}
    </p>
    <slot />
  </div>
</template>
