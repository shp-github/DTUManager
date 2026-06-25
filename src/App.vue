<template>
  <div id="app">
    <TitleBar />
    <!-- 主内容区域 -->
    <SidebarMenu />
  </div>
</template>

<script setup lang="ts">
import TitleBar from './components/TitleBar.vue'
import SidebarMenu from './components/SidebarMenu.vue'

</script>

<style>
/* 可以加入一些全局样式 */
#app {
  margin: 0;
  padding: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  height: 100%;
  background-color: var(--main-bg);
}

.dhcp-selector-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1000;
}

.dhcp-selector-container > * {
  pointer-events: auto;
}
</style>