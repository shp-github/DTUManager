<template>
  <el-card>
    <h2>DHCP</h2>
    <p>这里显示DHCP信息...</p>
  </el-card>

  <div id="app">

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
import NetworkInterfaceSelector from './../components/NetworkInterfaceSelector.vue'

// 控制DHCP选择器显示
const showDhcpSelector = ref(false)
const dhcpSelector = ref()
//const showControlBtn = ref(process.env.NODE_ENV === 'development') // 只在开发环境显示控制按钮
const showControlBtn = ref(true) // 只在开发环境显示控制按钮

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


</style>