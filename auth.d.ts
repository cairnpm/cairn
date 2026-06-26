// Shape of the authenticated session user (nuxt-auth-utils).
declare module '#auth-utils' {
  interface User {
    id: string
    name: string
    role: string
    avatar_bg: string | null
    avatar_init: string | null
    avatar_url: string | null
  }
  interface UserSession {
    user: User
  }
}

export {}
