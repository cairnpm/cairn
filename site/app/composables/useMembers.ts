// Overrides the product's composable, which resolves avatars from /api/members. The site is prerendered
// to static HTML with no API behind it, so UserAvatar (the only consumer the landing mounts) falls back
// to initials and fires zero requests.
export function useMembers() {
  return { avatarFor: (_name?: string | null): string | null => null }
}
