<template>
  <div id="app">
    <!-- 主内容区域 -->
    <SidebarMenu />
  </div>
</template>

<script setup lang="ts">
import SidebarMenu from './components/SidebarMenu.vue'

</script>

<style>
/* 可以加入一些全局样式 */
#app {
  margin: 0;
  padding: 0;
  height: 100vh;
}

body {
  margin: 0;
  font-family: 'Arial', sans-serif;
  height: 100%;
  background-color: #f5f5f5;
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

.control-btn {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1001;
  padding: 8px 16px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.control-btn:hover {
  background: #1976D2;
}
</style>