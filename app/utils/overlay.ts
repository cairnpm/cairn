// Keep a Sheet/Dialog open when a menu/dialog/popper opened *inside* it is interacted with: its
// portalled content lives outside the parent's focus trap, which would otherwise dismiss the parent.
// Bind on the parent SheetContent/DialogContent: @interact-outside / @focus-outside.
// Param widened to the reka-ui {Pointer,Focus}OutsideEvent shape (CustomEvent → `target` is EventTarget | null).
export function keepOverlayOpen(e: { detail?: { originalEvent?: { target?: EventTarget | null } }, target?: EventTarget | null, preventDefault: () => void }): void {
  const t = ((e?.detail?.originalEvent?.target ?? e?.target) ?? null) as HTMLElement | null
  if (t?.closest?.('[role="menu"],[role="dialog"],[role="alertdialog"],[data-reka-popper-content-wrapper],[data-radix-popper-content-wrapper]')) {
    e.preventDefault()
  }
}
