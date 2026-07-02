import { ref } from 'vue'

// Shared open-state for the global command palette (Cmd/Ctrl+K). Module-level ref = one instance across
// the layout (which renders the palette + owns the shortcut) and any trigger (e.g. the sidebar button).
const open = ref(false)

export function useSearchPalette() {
  return {
    open,
    toggle: () => { open.value = !open.value },
    close: () => { open.value = false },
  }
}
