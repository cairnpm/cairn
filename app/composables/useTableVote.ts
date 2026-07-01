import { ref, type Ref } from 'vue'
import type { QueryKey } from '~/utils/queryKeys'

// Toggle a vote on a betting-table candidate. Shared by the list Sheet and the dedicated page —
// they differ only in the id/data source and whether they reload vs invalidate afterwards.
export function useTableVote(opts: {
  tableId: Ref<string | null>
  candidates: Ref<{ id: string; voters: string[] }[] | undefined>
  status: Ref<string | null | undefined>
  author: Ref<string>
  invalidates: QueryKey[]
  onVoted?: () => Promise<void> | void
}) {
  const { t } = useUiLang()
  const { mutate } = useApiMutation()
  const voting = ref(false)

  const iVoted = (c: { voters: string[] }) => c.voters.includes(opts.author.value)

  async function toggleVote(candidateId: string) {
    if (voting.value || opts.status.value !== 'open') return
    voting.value = true
    try {
      const cand = opts.candidates.value?.find(c => c.id === candidateId)
      const success = cand && iVoted(cand) ? t('betting.toast.voteRemoved') : t('betting.toast.voteAdded')
      await mutate(`/api/betting-tables/${opts.tableId.value}/votes`, { body: { candidate_id: candidateId }, invalidates: opts.invalidates, success })
      await opts.onVoted?.()
    } finally { voting.value = false }
  }

  return { iVoted, toggleVote, voting }
}
