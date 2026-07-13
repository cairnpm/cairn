// A self-hosted instance is private: an exposed one would otherwise let search engines index /login —
// and with it, the existence of the workspace. Every route is auth-gated anyway; this closes the door.
//
// Served from server/ rather than public/ on purpose: the marketing layer (site/) drops this directory
// from Nitro's scan dirs, so it keeps its own indexable robots.txt. A static public/robots.txt would be
// inherited and would silently de-index the landing page.
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return 'User-agent: *\nDisallow: /\n'
})
