import { ref } from 'vue'

export type ThemeType = '' | 'dark' | 'green'

export const themes: { value: ThemeType; label: string; icon: string }[] = [
  { value: '', label: '默认蓝', icon: '☀️' },
  { value: 'dark', label: '暗夜模式', icon: '🌙' },
  { value: 'green', label: '清新绿', icon: '🌿' },
]

const currentTheme = ref<ThemeType>(
  (localStorage.getItem('app-theme') as ThemeType) || ''
)

export function useTheme() {
  const setTheme = (theme: ThemeType) => {
    currentTheme.value = theme
    document.documentElement.className = theme
    localStorage.setItem('app-theme', theme)
  }

  return {
    currentTheme,
    setTheme,
    themes,
  }
}
