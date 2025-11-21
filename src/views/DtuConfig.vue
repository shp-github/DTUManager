<template>
  <div class="dtu-config-container">
    <!-- 固定头部 -->
    <div class="header-wrapper">
      <div class="header">
        <h2 class="title">DTU 配置 - {{ device?.id }}</h2>
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

      <!-- Tab Header 固定 -->
      <el-tabs v-model="activeTab" class="tabs-underline" type="card">
        <el-tab-pane label="基本信息" name="basic" />
        <el-tab-pane label="接口" name="interface" />
        <el-tab-pane label="网络链接" name="network" />
        <el-tab-pane label="Modbus" name="modbus" />
        <el-tab-pane label="场景配置" name="scene" />
      </el-tabs>
    </div>

    <!-- 滚动内容区域 -->
    <div class="tab-content-wrapper">
      <el-tabs v-model="activeTab" class="tabs-content-wrapper" type="card">
        <el-tab-pane label="基本信息" name="basic">
          <BasicConfig v-model="allConfig.basic" :device="device" />
        </el-tab-pane>
        <el-tab-pane label="接口" name="interface">
          <InterfaceConfig v-model="allConfig.interface" />
        </el-tab-pane>
        <el-tab-pane label="网络链接" name="network">
          <NetworkConfig v-model="allConfig.network" :device="device" />
        </el-tab-pane>
        <el-tab-pane label="Modbus" name="modbus">
          <ModbusConfig v-model="allConfig.modbus" />
        </el-tab-pane>
        <el-tab-pane label="场景配置" name="scene">
          <SceneConfig v-model="allConfig.scene" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, DocumentAdd } from '@element-plus/icons-vue'

import BasicConfig from './dtu/BasicConfig.vue'
import NetworkConfig from './dtu/NetworkConfig.vue'
import InterfaceConfig from './dtu/InterfaceConfig.vue'
import ModbusConfig from './dtu/ModbusConfig.vue'
import SceneConfig from './dtu/SceneConfig.vue'

// 接收 device 参数
const props = defineProps<{ device: any }>()
const device = ref(props.device)

const router = useRouter()
const activeTab = ref('basic')

// 配置对象
const allConfig = reactive({
  basic: {
  },
  interface: [],
  network: {},
  modbus: {},
  scene: {}
})

// 读取设备配置
const loadDeviceConfig = async () => {
  if (!device.value) return
  try {
    const config = await window.electronAPI.readDeviceConfig(JSON.parse(JSON.stringify(device.value)))
    if (config) Object.assign(allConfig, config)

    console.log('读取配置:\n', JSON.stringify(config, null, 2))

  } catch (err) {
    console.error('[ERROR] 读取设备配置失败:', err)
    ElMessage.error('读取设备配置失败')
  }
}

// 每秒更新运行时间
let runtimeTimer: number
onMounted(() => {
  loadDeviceConfig()
  runtimeTimer = window.setInterval(() => {
    if (device.value && device.value.runtime !== undefined) {
      device.value.runtime += 1
    }
  }, 1000)

  window.electronAPI.on('menu-action', (action: string) => {
    if (action === 'save') saveConfig()
  })
})

onBeforeUnmount(() => {
  clearInterval(runtimeTimer)
  window.electronAPI.off('menu-action', () => {})
})

// 返回
const goBack = () => router.push({ name: 'DeviceList' })

// 保存配置
// 保存配置
const saveConfig = async () => {
  if (!device.value) return
  try {

    const payload = {
      [device.value.id]: {
        type: 'config',
        ...JSON.parse(JSON.stringify(allConfig))
      }
    }

    const result = await window.electronAPI.saveConfig(payload)
    console.log('保存配置:\n', JSON.stringify(payload, null, 2))

    if (result.success) {
      ElMessage.success('配置已保存到设备')
    } else {
      ElMessage.error('保存失败：' + result.error)
    }

  } catch (err: any) {
    ElMessage.error('保存异常: ' + (err.message || err))
  }
}

</script>

<style scoped>
.dtu-config-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
}

.header-wrapper {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #f2f2f2;
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

/* 固定 Tab Header */
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

/* 滚动内容 */
.tab-content-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
}
</style>
