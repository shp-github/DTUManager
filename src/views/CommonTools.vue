<template>
  <div class="common-tools">
    <el-tabs v-model="activeTab" type="border-card" class="tools-tabs">
      <el-tab-pane name="network">
        <template #label>
          <span class="tab-label">
            <el-icon :size="16"><Operation /></el-icon>
            <span>网络工具</span>
          </span>
        </template>
        <NetworkTools />
      </el-tab-pane>
      <el-tab-pane name="serial">
        <template #label>
          <span class="tab-label">
            <el-icon :size="16"><Connection /></el-icon>
            <span>串口工具</span>
          </span>
        </template>
        <SerialTools />
      </el-tab-pane>
      <el-tab-pane name="dhcp">
        <template #label>
          <span class="tab-label">
            <el-icon :size="16"><Link /></el-icon>
            <span>DHCP分配</span>
          </span>
        </template>
        <DhcpView />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Operation, Connection, Link } from '@element-plus/icons-vue'
import NetworkTools from './NetworkTools.vue'
import SerialTools from './SerialTools.vue'
import DhcpView from './dhcpView.vue'

const activeTab = ref('network')
</script>

<style scoped>
.common-tools {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tools-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tools-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
}

.tools-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow: auto;
}

/* tab 标签文字加粗、图标对齐 */
.tools-tabs :deep(.el-tabs__item) {
  font-weight: 700;
  font-size: 14px;
  padding: 0 20px;
  transition: all 0.3s ease;
}

.tab-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tab-label .el-icon {
  transition: transform 0.3s ease;
}

.tools-tabs :deep(.el-tabs__item:hover) .tab-label .el-icon {
  transform: scale(1.15);
}

.tools-tabs :deep(.el-tabs__item.is-active) .tab-label .el-icon {
  color: var(--sidebar-active-indicator, #409eff);
}

/* 暗夜模式 tab 头部 */
html.dark .tools-tabs :deep(.el-tabs__header) {
  background: var(--sidebar-bg);
  border-color: var(--sidebar-divider, #333);
}

html.dark .tools-tabs :deep(.el-tabs__item) {
  color: #a0aec0;
  font-weight: 700;
}

html.dark .tools-tabs :deep(.el-tabs__item.is-active) {
  color: var(--sidebar-text-active);
  background: var(--main-bg, #1a1a2e);
  font-weight: 700;
}

html.dark .tools-tabs :deep(.el-tabs__item.is-active) .tab-label .el-icon {
  color: var(--sidebar-active-indicator, #60a5fa);
}
</style>
