<script setup lang="ts">
const bike = useBicycle()
const { screen, team, author } = bike

const nav = [
  { id: 'intake' as const, label: 'Intake', to: '/' },
  { id: 'backlog' as const, label: 'Backlog', to: '/backlog' },
  { id: 'betting' as const, label: 'Betting Table', to: '/betting' },
  { id: 'hills' as const, label: 'Hills', to: '/hills' },
]
</script>

<template>
  <aside style="width: 240px; min-width: 240px; background: white; border-right: 1px solid #e4e4e7; display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0;">
    <!-- Brand -->
    <div style="height: 56px; padding: 0 16px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #e4e4e7; flex-shrink: 0;">
      <div style="width: 28px; height: 28px; background: #18181b; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <span style="color: white; font-size: 12px; font-weight: 700; letter-spacing: -0.5px;">B</span>
      </div>
      <div>
        <div style="font-size: 14px; font-weight: 600; color: #18181b; line-height: 1.2;">Bicycle</div>
        <div style="font-size: 11px; color: #a1a1aa; line-height: 1.2;">Product OS</div>
      </div>
    </div>

    <!-- Nav -->
    <nav style="flex: 1; padding: 8px; overflow: auto;">
      <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; padding: 8px 12px 6px;">Navigation</div>
      <NuxtLink
        v-for="item in nav"
        :key="item.id"
        :to="item.to"
        :style="{
          width: '100%', display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 12px',
          borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13.5px',
          fontWeight: screen === item.id ? 600 : 400,
          color: screen === item.id ? '#18181b' : '#71717a',
          background: screen === item.id ? '#f4f4f5' : 'transparent',
          textAlign: 'left', marginBottom: '1px', textDecoration: 'none',
        }"
      >
        <span style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
            <path v-if="item.id === 'intake'" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path v-else-if="item.id === 'backlog'" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            <template v-else-if="item.id === 'betting'">
              <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
            </template>
            <path v-else d="M3 17l4-8 4 4 4-6 4 10" />
          </svg>
        </span>
        {{ item.label }}
      </NuxtLink>
    </nav>

    <!-- Team / current user — click an avatar to act as that person (collaborative attribution) -->
    <div style="padding: 12px 16px; border-top: 1px solid #e4e4e7; flex-shrink: 0;">
      <div style="font-size: 11px; font-weight: 500; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px;">Connecté en tant que</div>
      <div style="display: flex; gap: 6px; align-items: center;">
        <button
          v-for="m in team"
          :key="m.init"
          :title="`Agir en tant que ${m.name}`"
          :style="{ width: '30px', height: '30px', borderRadius: '50%', background: m.bg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0, border: author === m.name ? '2px solid #18181b' : '2px solid transparent', outline: author === m.name ? '2px solid white' : 'none', outlineOffset: '-4px' }"
          @click="bike.setAuthor(m.name)"
        >{{ m.init }}</button>
        <span style="font-size: 12px; color: #71717a; margin-left: 4px;">{{ author }}</span>
      </div>
    </div>
  </aside>
</template>
