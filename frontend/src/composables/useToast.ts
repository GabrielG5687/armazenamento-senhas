import { ref } from 'vue';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const toasts = ref<Toast[]>([]);

export function useToast() {
  function success(message: string) {
    add(message, 'success');
  }
  function error(message: string) {
    add(message, 'error');
  }
  function info(message: string) {
    add(message, 'info');
  }

  function add(message: string, type: Toast['type'] = 'info') {
    const id = crypto.randomUUID();
    toasts.value.push({ id, message, type });
    setTimeout(() => dismiss(id), 5000);
    return id;
  }

  function dismiss(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return {
    toasts: ref<Toast[]>(toasts.value),
    success,
    error,
    info,
    dismiss,
  };
}
