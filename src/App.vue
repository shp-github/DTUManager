<template>
  <div id="app">
    <!-- 主内容区域 -->
    <SidebarMenu />

    <!-- DHCP网卡选择器（使用v-if控制显示） -->
    <div v-if="showDhcpSelector" class="dhcp-selector-container">
      <NetworkInterfaceSelector ref="dhcpSelector" @close="hideDhcpSelector" />
    </div>

    <!-- 可以添加一个全局按钮来测试控制 -->
    <button v-if="showControlBtn" @click="toggleDhcpSelector" class="control-btn">
      {{ showDhcpSelector ? '隐藏DHCP选择器' : '显示DHCP选择器' }}
    </button>

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SidebarMenu from './components/SidebarMenu.vue'
import NetworkInterfaceSelector from './components/NetworkInterfaceSelector.vue'

// 控制DHCP选择器显示
const showDhcpSelector = ref(false)
const dhcpSelector = ref()
const showControlBtn = ref(process.env.NODE_ENV === 'development') // 只在开发环境显示控制按钮

// 切换显示/隐藏
const toggleDhcpSelector = () => {
  showDhcpSelector.value = !showDhcpSelector.value
}

// 隐藏选择器（从子组件触发）
const hideDhcpSelector = () => {
  showDhcpSelector.value = false
}

// 如果需要，可以暴露方法给其他组件
defineExpose({
  toggleDhcpSelector,
  hideDhcpSelector
})
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