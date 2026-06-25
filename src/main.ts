import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './assets/themes.css'
import './assets/desktop.css'

// 初始化主题（从 localStorage 恢复）
const saved = localStorage.getItem('app-theme') || ''
if (saved) document.documentElement.className = saved

createApp(App).use(router).use(ElementPlus).mount('#app')






