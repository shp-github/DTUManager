<template>
  <div class="dtu-config-container">
    <div class="header">
      <h2 class="title">DTU 配置 - {{ deviceId }}</h2>
      <div class="actions">
        <el-button class="action-btn" type="default" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回
        </el-button>
        <el-button class="action-btn" type="primary" @click="saveConfig">
          <el-icon><DocumentAdd /></el-icon>
          保存
        </el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="tabs-underline" type="card">
      <el-tab-pane label="基本参数" name="basic">
        <BasicConfig v-model="allConfig.basic" />
      </el-tab-pane>

      <el-tab-pane label="接口" name="interface">
        <InterfaceConfig v-model="allConfig.interface" />
      </el-tab-pane>

      <el-tab-pane label="网络链接" name="network">
        <NetworkConfig v-model="allConfig.network" />
      </el-tab-pane>

      <el-tab-pane label="Modbus" name="modbus">
        <ModbusConfig v-model="allConfig.modbus" />
      </el-tab-pane>

      <el-tab-pane label="场景配置" name="scene">
        <SceneConfig v-model="allConfig.scene" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, DocumentAdd } from '@element-plus/icons-vue'

import BasicConfig from './dtu/BasicConfig.vue'
import NetworkConfig from './dtu/NetworkConfig.vue'
import InterfaceConfig from './dtu/InterfaceConfig.vue'
import ModbusConfig from './dtu/ModbusConfig.vue'
import SceneConfig from './dtu/SceneConfig.vue'

const route = useRoute()
const router = useRouter()
const deviceId = route.params.deviceId as string
const activeTab = ref('basic')

// 父组件集中管理所有配置数据
const allConfig = reactive({
  basic: {},
  interface: {},
  network: {},
  modbus: {},
  scene: {}
})

// 模拟加载设备配置（从服务器读取）
onMounted(async () => {
  // TODO: 调用后端接口加载配置
  // const resp = await api.get(`/device/${deviceId}/config`)
  // Object.assign(allConfig, resp.data)
  console.log('读取设备配置并回显...')
})

const goBack = () => {
  router.push({ name: 'DeviceList' })
}

// 点击保存时汇总所有页面的数据
const saveConfig = async () => {
  try {
    console.log('保存配置内容：', JSON.stringify(allConfig, null, 2))
    // await api.post(`/device/${deviceId}/config`, allConfig)
    ElMessage.success('配置已保存')
  } catch (err) {
    ElMessage.error('保存失败: ' + err)
  }
}
</script>

<style scoped>
.dtu-config-container {
  height: 100vh;
  padding: 20px;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid #f2f2f2;
}

.title {
  font-size: 24px;
  font-weight: 700;
  color: #333;
  margin: 0;
}

.actions {
  display: flex;
  gap: 14px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
}

/* 横条风格 Tab */
.tabs-underline ::v-deep(.el-tabs__header) {
  border-bottom: 2px solid #e0e0e0;
  padding: 0 10px;
}

.tabs-underline ::v-deep(.el-tabs__item) {
  border: none !important;
  margin: 0 10px 0 0;
  padding: 14px 22px;
  font-weight: 600;
  font-size: 18px;
  color: #606266;
  position: relative;
  transition: color 0.2s;
}

.tabs-underline ::v-deep(.el-tabs__item.is-active) {
  color: #409EFF;
}

.tabs-underline ::v-deep(.el-tabs__item.is-active)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background-color: #409EFF;
  border-radius: 2px 2px 0 0;
}

.tabs-underline ::v-deep(.el-tabs__content) {
  flex: 1;
  padding: 15px;
  background-color: #ffffff;
  border-radius: 0 0 8px 8px;
  box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.03);
  height: calc(100vh - 120px);
  overflow-y: auto;
}
</style>
