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

          <el-button class="action-btn" type="primary" @click="connectMqtt">
            通知连接
          </el-button>

          <el-button class="action-btn" type="primary" @click="loadDeviceConfig">
            读取配置
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
        <el-tab-pane label="网络通道" name="networkChannels" />
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
        <el-tab-pane label="网络通道" name="networkChannels">
          <NetworkConfig v-model="allConfig.networkChannels" :device="device" />
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
  networkChannels: [],
  modbus: {},
  scene: {}
})

// 通知设备连接mqtt
const connectMqtt = async () => {
  if (!device.value) return
  try {

    console.log('通知设备连接mqtt:', device.value.ip)
    const config = await window.electronAPI.connectMqtt(device.value.ip)
    //console.log('让设备连接mqtt:\n', JSON.stringify(config, null, 2))

    //读取设备配置
    loadDeviceConfig();

  } catch (err) {
    console.error('[ERROR] 通知设备连接mqtt:', err)
    //ElMessage.error('[ERROR] 通知设备连接mqtt' + err)
  }
}

// 读取设备配置
const loadDeviceConfig = async () => {
  if (!device.value) return
  try {

    if (!device.value || !device.value.id) {
      console.error("设备ID为空，无法发送读取配置命令")
      return
    }

    const topic = `/server/cmd/${device.value.id}`
    const modules = ['interface', 'network', 'channels'];
    const delay = 200;

    modules.forEach((module, index) => {
      setTimeout(() => {
        const message = JSON.stringify({type: 'get_config', flag: module});
        const success = window.electronAPI.mqttPublish({topic: topic, message: message, options: { qos: 1 }});
        if (success) {
          console.log(`发送命令: -> ${topic} ${message}`)
        }
      }, index * delay);
    });
    return;

  } catch (err) {
    console.error('[ERROR] 读取设备配置失败:', err)
    ElMessage.error('读取设备配置失败')
  }
}


// MQTT 消息处理
const handleMqttMessage = (event: any, data: any) => {

  const { topic, payload, client } = data

  console.log(`收到消息${topic}: ${payload}`)

  // 判断是否当前设备的消息
  if (topic !== `/dev/cmd/${device.value.id}`) return


    console.log(`接收设备端配置: ${JSON.stringify(payload)}`)

    //更新配置信息
  let msg
  try {
    msg = typeof payload === 'string' ? JSON.parse(payload) : payload
  } catch (e) {
    console.error("JSON解析失败:", e)
    return
  }

  console.log("接收设备端配置:", msg)

    // flag 用于区分模块
    const flag = msg.flag
    if (!flag) {
      console.warn("无 flag 字段，忽略")
      return
    }

    // 根据 flag 写入对应配置模块
    switch (flag) {
      case "interface":
        // 接口配置（串口）
        allConfig.interface = {
          uart1: msg.uart1 || {},
          uart2: msg.uart2 || {}
        }
        console.log("更新 interface 配置成功:", allConfig.interface)
        break

      case "network":
        // 网络配置，例如 ip/subnet/gateway
        allConfig.basic = {
          ...allConfig.basic,
          ...msg
        }
        console.log("更新 network 配置成功:", allConfig.basic)
        break

      case "channels":
        // 网络通道列表
        allConfig.networkChannels = msg.channels || []
        console.log("更新 networkChannels 配置成功:", allConfig.networkChannels)
        break

      case "modbus":
        // modbus 采集表
        allConfig.modbus = msg.data || {}
        console.log("更新 modbus 配置成功:", allConfig.modbus)
        break

      case "scene":
        allConfig.scene = msg.data || {}
        console.log("更新 scene 配置成功:", allConfig.scene)
        break

      default:
        console.warn("未知 flag:", flag)
        break
    }

}


// 每秒更新运行时间
let runtimeTimer: number
onMounted(() => {

  //通知设备连接mqtt
  connectMqtt();

  //监听设备消息
  window.electronAPI.deviceConfigMessage(handleMqttMessage)

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
