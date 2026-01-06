<template>
  <div class="basic-config">
    <!-- 显示设备信息 -->
    <el-card class="device-info-card" shadow="hover">
      <div class="card-title">设备信息</div>
      <el-descriptions column="2" border>
        <el-descriptions-item label="设备号">{{ deviceData.id }}</el-descriptions-item>
        <el-descriptions-item label="MAC">{{ deviceData.mac }}</el-descriptions-item>
        <el-descriptions-item label="IP">{{ deviceData.ip }}</el-descriptions-item>
        <el-descriptions-item label="网络">{{ deviceData.networkType }}</el-descriptions-item>
        <el-descriptions-item label="信号">{{ deviceData.RSSI }}</el-descriptions-item>
        <el-descriptions-item label="运行时间">{{ deviceData.runtimeStr }}</el-descriptions-item>
        <el-descriptions-item label="固件">{{ deviceData.firmware }}</el-descriptions-item>
        <el-descriptions-item label="心跳(s)">{{ deviceData.heart_interval }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 可编辑基本配置 -->
    <el-card class="config-card" shadow="hover" style="margin-top: 20px;">
      <div class="card-title">基本配置</div>
      <el-form label-width="120px">
        <el-form-item label="设备名称">
          <el-input v-model="modelValue.name" />
        </el-form-item>
        <div class="card-title">网络配置</div>
        <el-form label-width="120px">
          <!-- 静态IP -->
          <el-form-item label="静态IP">
            <el-switch
                v-model="modelValue.isStatic"
                :active-value="1"
                :inactive-value="0"
                active-text="开启"
                inactive-text="关闭"
                @change="handleStaticIPChange"
            />
          </el-form-item>
         <div v-if="modelValue.isStatic">
           <el-form-item label="IP地址">
             <el-input v-model="modelValue.ip" />
           </el-form-item>
           <el-form-item label="子网掩码">
             <el-input v-model="modelValue.subnet" />
           </el-form-item>
           <el-form-item label="网关">
             <el-input v-model="modelValue.gateway" />
           </el-form-item>
           <el-form-item label="DNS服务器">
             <el-input v-model="modelValue.dns" />
           </el-form-item>
         </div>
        </el-form>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">

import { reactive, watch, onMounted, onUnmounted } from 'vue'

// Props
const props = defineProps<{
  modelValue: { }
  device: Device | null
}>()


interface Device {
  id: string
  mac: string
  ip: string
  networkType: string
  RSSI: number
  runtime: number
  firmware: string
  heart_interval: number
}


// 处理静态IP开关变化
const handleStaticIPChange = (isStatic: boolean) => {
  if (isStatic) {
    // 开启静态IP时，设置默认值
    if (!props.modelValue.ip || props.modelValue.ip === '0.0.0.0') {
      props.modelValue.ip = '192.168.3.24'
    }
    if (!props.modelValue.gateway || props.modelValue.gateway === '0.0.0.0') {
      props.modelValue.gateway = '192.168.3.1'
    }
    if (!props.modelValue.subnet || props.modelValue.subnet === '0.0.0.0') {
      props.modelValue.subnet = '255.255.255.0'
    }
    // 设置DNS默认值
    if (!props.modelValue.dns || props.modelValue.dns === '0.0.0.0') {
      props.modelValue.dns = '8.8.8.8'
    }
  } else {
    // 关闭静态IP（DHCP模式）时，清空IP配置
    props.modelValue.ip = '0.0.0.0'
    props.modelValue.gateway = '0.0.0.0'
    props.modelValue.subnet = '255.255.255.0'
    props.modelValue.dns = '0.0.0.0'
  }
}


// Reactive 设备信息，用于显示
const deviceData = reactive({
  id: '',
  mac: '',
  ip: '',
  networkType: '',
  RSSI: 0,
  runtimeStr: '',
  firmware: '',
  heart_interval: 0
})

// 格式化运行时间
const formatRuntime = (seconds: number) => {
  const days = Math.floor(seconds / (24 * 3600))
  const hours = Math.floor((seconds % (24 * 3600)) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const sec = seconds % 60
  return `${days}天 ${hours}小时 ${minutes}分钟 ${sec}秒`
}

// watch props.device 实时更新
watch(
    () => props.device,
    (newVal) => {
      if (newVal) {
        deviceData.id = newVal.id
        deviceData.mac = newVal.mac
        deviceData.ip = newVal.ip
        deviceData.networkType = newVal.networkType
        deviceData.RSSI = newVal.RSSI
        deviceData.runtimeStr = formatRuntime(newVal.runtime || 0)
        deviceData.firmware = newVal.firmware
        deviceData.heart_interval = newVal.heart_interval
      }
    },
    { immediate: true }
)

// 自动刷新运行时间，每秒更新
let timer: number | null = null
onMounted(() => {
  timer = window.setInterval(() => {
    if (props.device) {
      deviceData.runtimeStr = formatRuntime(props.device.runtime || 0)
    }
  }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.basic-config {
  display: flex;
  flex-direction: column;
}

.device-info-card,
.config-card {
  padding: 16px;
}

.card-title {
  font-weight: 700;
  font-size: 18px;
  margin-bottom: 12px;
}

.el-descriptions {
  font-size: 14px;
}

.el-descriptions-item__label {
  font-weight: 600;
}
</style>
