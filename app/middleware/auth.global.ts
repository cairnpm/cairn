// Redirect to /login unless authenticated. The login page and the public invitation page are exempt.
export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession()
  if (to.path === '/login' || to.path.startsWith('/join/')) return
  if (!loggedIn.value) return navigateTo('/login')
})
