import { computed, onUnmounted, ref, watchEffect, type Ref } from 'vue'

// Delete / restore lifecycle for a soft-deletable detail resource, plus the breadcrumb wiring.
// Toast labels are passed as getters so they stay correct across a live locale switch.
export function useDetailCrud(opts: {
  resource: 'features' | 'betting-tables'
  id: Ref<string>
  title: Ref<string | null | undefined>
  status?: Ref<string | null | undefined>
  listRoute: string
  invalidates: { delete: string[]; restore: string[] }
  toasts: { deleted: () => string; restored: () => string }
  onDelete?: () => void
  crumb?: boolean
}) {
  const { mutate } = useApiMutation()
  const bike = useCairn()

  const isDeleted = computed(() => opts.status?.value === 'deleted')
  const confirmOpen = ref(false)
  const deleting = ref(false)
  const restoring = ref(false)

  if (opts.crumb !== false) {
    watchEffect(() => { if (opts.title.value) bike.setCrumb(opts.title.value) })
    onUnmounted(() => bike.setCrumb(''))
  }

  async function confirmDelete() {
    if (deleting.value) return
    deleting.value = true
    try {
      await mutate(`/api/${opts.resource}/${opts.id.value}`, { method: 'DELETE', invalidates: opts.invalidates.delete, success: opts.toasts.deleted() })
      opts.onDelete?.()
      await navigateTo(opts.listRoute)
    } finally { deleting.value = false }
  }

  async function restore() {
    if (restoring.value) return
    restoring.value = true
    try {
      await mutate(`/api/${opts.resource}/${opts.id.value}/restore`, { invalidates: opts.invalidates.restore, success: opts.toasts.restored() })
    } finally { restoring.value = false }
  }

  return { isDeleted, confirmOpen, deleting, restoring, confirmDelete, restore }
}
