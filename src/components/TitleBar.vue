<template>
  <div class="title-bar">
    <!-- 拖拽区域 -->
    <div class="drag-region">
      <span class="app-title">DTU 管理工具</span>
    </div>

    <!-- 窗口控制按钮 -->
    <div class="window-controls">
      <button class="win-btn" @click="handleMinimize" title="最小化">
        <svg width="10" height="10" viewBox="0 0 10 10"><rect y="4" width="10" height="2" fill="currentColor"/></svg>
      </button>
      <button class="win-btn" @click="handleMaximize" title="最大化/还原">
        <svg v-if="isMaximized" width="10" height="10" viewBox="0 0 10 10">
          <rect x="2.5" y="0" width="7.5" height="7.5" fill="none" stroke="currentColor" stroke-width="1"/>
          <rect x="0" y="2.5" width="7.5" height="7.5" fill="currentColor"/>
        </svg>
        <svg v-else width="10" height="10" viewBox="0 0 10 10">
          <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
      </button>
      <button class="win-btn win-btn--close" @click="handleClose" title="关闭">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const isMaximized = ref(false)

let checkTimer: number | null = null

const handleMinimize = () => {
  window.electronAPI.windowMinimize()
}

const handleMaximize = async () => {
  window.electronAPI.windowMaximize()
  isMaximized.value = await window.electronAPI.windowIsMaximized()
}

const handleClose = () => {
  window.electronAPI.windowClose()
}

const checkMaximized = async () => {
  if (window.electronAPI) {
    isMaximized.value = await window.electronAPI.windowIsMaximized()
  }
}

onMounted(() => {
  checkMaximized()
  checkTimer = window.setInterval(checkMaximized, 500)
})

onBeforeUnmount(() => {
  if (checkTimer) clearInterval(checkTimer)
})
</script>

<style scoped>
.title-bar {
  height: 36px;
  display: flex;
  align-items: center;
  background: var(--titlebar-bg, var(--sidebar-bg));
  color: var(--sidebar-text);
  user-select: none;
  flex-shrink: 0;
  position: relative;
  z-index: 100;
}

/* 底部微妙的渐变线 */
.title-bar::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--titlebar-bottom-line, rgba(255,255,255,0.08)) 20%,
    var(--titlebar-bottom-line, rgba(255,255,255,0.08)) 80%,
    transparent 100%
  );
}

.drag-region {
  flex: 1;
  height: 100%;
  display: flex;
  align-items: center;
  -webkit-app-region: drag;
  padding-left: 16px;
}

.app-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.8px;
  opacity: 0.9;
  color: var(--sidebar-text);
}

.window-controls {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.win-btn {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--sidebar-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, opacity 0.15s ease;
  outline: none;
}

.win-btn svg {
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.win-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.win-btn:hover svg {
  opacity: 1;
}

.win-btn:active {
  background: rgba(255, 255, 255, 0.15);
}

.win-btn--close:hover {
  background: #e81123;
}

.win-btn--close:active {
  background: #bf0f1d;
}
</style>
