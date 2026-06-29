import { onMounted, onScopeDispose } from 'vue'

// A reactive "now" (ms), seeded once via useState so it's identical on the server and the first
// client render (carried through the payload) — this is what keeps relative times from hydration-
// mismatching. After mount it ticks every minute so « il y a 2 min » stays fresh without a reload.
export function useNow() {
  const now = useState('now', () => Date.now())
  onMounted(() => {
    now.value = Date.now()
    const id = setInterval(() => { now.value = Date.now() }, 60_000)
    onScopeDispose(() => clearInterval(id))
  })
  return now
}
