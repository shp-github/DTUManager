<template>
  <div id="app">
    <!-- 仅渲染 Side 组件 -->
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
</style>
