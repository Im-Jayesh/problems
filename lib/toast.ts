export const toast = (message: string, type: 'success' | 'error' = 'success') => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { message, type } }));
  }
};
