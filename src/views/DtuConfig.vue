<template>
  <div class="dtu-config-container">
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

    <el-tabs v-model="activeTab" class="tabs-underline" type="card">
      <el-tab-pane label="基本信息" name="basic">
        <BasicConfig v-model="allConfig.basic" :device="device" />
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

console.log('[DEBUG] 接收到 props.device:', device.value)

const router = useRouter()
const activeTab = ref('basic')

// 配置对象
const allConfig = reactive({
  basic: {},
  interface: [   // 数组
    {
      enabled: false,
      mode: 'rs485',
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none'
    }
  ],
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

  // 监听菜单栏保存事件
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
const saveConfig = async () => {
  if (!device.value) return

  try {
    const configCopy = JSON.parse(JSON.stringify(allConfig))

    const payload = {
      [device.value.id]: {
        type: 'config',
        heart_interval: configCopy.basic.interval || 5,
        network: configCopy.network || {},
        channels: [
          {
            enabled: configCopy.interface.enabled || false,
            protocol: configCopy.interface.protocol || '',
            target: configCopy.interface.target || '',
            port: configCopy.interface.port || 0
          },
          {
            enabled: configCopy.modbus.enabled || false,
            protocol: configCopy.modbus.protocol || '',
            target: configCopy.modbus.target || '',
            port: configCopy.modbus.port || 0
          },
          {
            enabled: configCopy.scene.enabled || false,
            protocol: configCopy.scene.protocol || '',
            target: configCopy.scene.target || '',
            port: configCopy.scene.port || 0
          }
        ]
      }
    }

    const result = await window.electronAPI.saveConfig(payload)

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
  height: 100vh;
  padding: 20px;
  background: #fff;
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
  background-color: #fff;
  border-radius: 0 0 8px 8px;
  box-shadow: inset 0 0 6px rgba(0,0,0,0.03);
  height: calc(100vh - 120px);
  overflow-y: auto;
}
</style>
