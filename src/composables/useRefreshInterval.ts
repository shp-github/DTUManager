import { ref, watch } from 'vue'

const STORAGE_KEY = 'dtumanager_refresh_interval'

// 从 localStorage 读取初始值（默认 3000ms）
function loadInterval(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const val = parseInt(raw, 10)
      if ([1000, 3000, 5000, 10000].includes(val)) return val
    }
  } catch { /* ignore */ }
  return 3000
}

// 全局共享的刷新间隔（单例）
const interval = ref(loadInterval())

// 持久化
watch(interval, (val) => {
  try {
    localStorage.setItem(STORAGE_KEY, String(val))
  } catch { /* ignore */ }
})

export function useRefreshInterval() {
  return {
    interval,
    setInterval: (ms: number) => { interval.value = ms },
  }
}
