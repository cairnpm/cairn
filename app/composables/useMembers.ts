interface Member { id: string; name: string; avatar_url: string | null; former_names: string | null }

function hasName(m: Member, name: string): boolean {
  if (m.name === name) return true
  if (!m.former_names) return false
  try { return (JSON.parse(m.former_names) as string[]).includes(name) }
  catch { return false }
}

// Shared name → avatar map so every UserAvatar (signals, activity, decisions, tables…) can show a
// member's uploaded photo from just their name. Matches a member's current OR former names, so a
// rename keeps resolving past records. One deduped fetch (keyed) across the whole app.
export function useMembers() {
  const { data: members } = useFetch<Member[]>('/api/members', {
    key: 'members', default: () => [], getCachedData: getFreshData,
  })
  function avatarFor(name?: string | null): string | null {
    if (!name) return null
    return members.value.find(m => hasName(m, name))?.avatar_url ?? null
  }
  return { members, avatarFor }
}
