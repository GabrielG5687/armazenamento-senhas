<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  modelValue: string;
  type?: string;
  placeholder?: string;
  label?: string;
  error?: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits(['update:modelValue']);

const inputClasses = computed(() => [
  'sv-input',
  { 'border-sv-danger focus:ring-sv-danger': props.error },
]);
</script>

<template>
  <div class="mb-4">
    <label v-if="label" class="block text-sm font-medium text-sv-text mb-1.5">
      {{ label }}
    </label>
    <input
      :type="type ?? 'text'"
      :placeholder="placeholder"
      :class="inputClasses"
      :disabled="disabled"
      :value="modelValue"
      @input="(emit as any)('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="error" class="mt-1 text-xs text-sv-danger">
      {{ error }}
    </p>
  </div>
</template>
