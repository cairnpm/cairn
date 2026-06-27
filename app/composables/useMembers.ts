interface Member { id: string; name: string; avatar_url: string | null }

// Shared name → avatar map so every UserAvatar (signals, activity, decisions, tables…) can show a
// member's uploaded photo from just their name. One deduped fetch (keyed) across the whole app.
export function useMembers() {
  const { data: members } = useFetch<Member[]>('/api/members', {
    key: 'members', default: () => [], getCachedData: getFreshData,
  })
  function avatarFor(name?: string | null): string | null {
    if (!name) return null
    return members.value.find(m => m.name === name)?.avatar_url ?? null
  }
  return { members, avatarFor }
}
