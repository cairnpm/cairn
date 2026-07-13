// Same filename as the product's guard, so this layer's copy wins: the public site has no session and
// must never bounce a visitor to /login.
export default defineNuxtRouteMiddleware(() => {})
