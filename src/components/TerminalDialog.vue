<template>
  <el-dialog
      v-model="visible"
      title="设备终端"
      width="800px"
      :fullscreen="isTerminalFullscreen"
      :before-close="handleTerminalDialogClose"
      @open="onDialogOpen"
      @close="onDialogClose"
  >
    <div class="terminal-dialog-content">
      <!-- 终端控制栏 -->
      <div class="terminal-controls">
        <div class="device-info">
          <span><strong>设备ID:</strong> {{ currentDevice?.id }}</span>
          <span><strong>IP:</strong> {{ currentDevice?.ip }}</span>
        </div>
        <div class="control-buttons">
          <button
              class="lumina-btn lumina-btn--sm"
              @click="toggleTerminalConnection"
              :disabled="terminalConnecting"
          >
            <span v-if="terminalConnecting" class="lumina-spinner"></span>
            {{ isTerminalConnected ? '断开连接' : '连接终端' }}
          </button>
          <button class="lumina-btn lumina-btn--ghost lumina-btn--sm" @click="clearTerminal">清空终端</button>
          <button
              class="lumina-btn lumina-btn--ghost lumina-btn--sm"
              @click="toggleTerminalFullscreen"
          >
            {{ isTerminalFullscreen ? '退出全屏' : '全屏' }}
          </button>
          <el-tag :type="isTerminalConnected ? 'success' : 'info'">
            {{ isTerminalConnected ? '已连接' : '未连接' }}
          </el-tag>
        </div>
      </div>

      <!-- 终端输出区域 -->
      <div class="terminal-output" ref="terminalOutput">
        <div
            v-for="(log, index) in terminalLogs"
            :key="index"
            :class="['log-entry', log.type]"
        >
          <span class="timestamp">[{{ log.timestamp }}]</span>
          <span class="topic" v-if="log.topic">TOPIC: {{ log.topic }}</span>
          <span class="message">{{ log.message }}</span>
        </div>
      </div>

      <!-- 终端输入区域 -->
      <div class="terminal-input">
        <el-input
            v-model="terminalInput"
            placeholder="输入要发送的消息"
            :disabled="!isTerminalConnected"
            @keyup.enter="sendTerminalMessage"
        >
          <template #append>
            <button
                class="lumina-btn lumina-btn--sm lumina-btn--append"
                :disabled="!isTerminalConnected || !terminalInput"
                @click="sendTerminalMessage"
            >
              发送
            </button>
          </template>
        </el-input>

        <div class="quick-commands">
          <button
              class="lumina-btn lumina-btn--ghost lumina-btn--xs"
              v-for="cmd in quickCommands"
              :key="cmd.name"
              @click="executeQuickCommand(cmd)"
              :disabled="!isTerminalConnected"
          >
            {{ cmd.name }}
          </button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { ElMessageBox } from 'element-plus'
import { ensureIPSelected } from '../composables/useIPSelector'

const props = defineProps<{
  modelValue: boolean
  currentDevice: any | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

// --- state ---
const isTerminalFullscreen = ref(false)
const isTerminalConnected = ref(false)
const terminalConnecting = ref(false)
const terminalLogs = ref<any[]>([])
const terminalInput = ref('')
const terminalOutput = ref<HTMLElement>()

const quickCommands = ref([
  { name: '通知设备连接', topic: '', message: '', action: 'connect' },
  { name: '获取设备号', topic: `/server/cmd/`, message: '{"type":"get_client_id"}' },
  { name: '获取配置', topic: `/server/cmd/`, action: 'get_config' },
  { name: '重启设备(MQTT)', topic: `/server/cmd/`, message: '{"type":"reboot"}' },
  { name: '重启设备(UDP)', topic: ``, message: '', action: 'reboot' },
  { name: '清空终端', topic: '', message: '', action: 'clear' },
])

// --- helpers ---
const addTerminalLog = (type: string, message: string, topic?: string) => {
  const log = { type, message, topic, timestamp: new Date().toLocaleTimeString() }
  terminalLogs.value.push(log)
  if (terminalLogs.value.length > 1000) {
    terminalLogs.value = terminalLogs.value.slice(-500)
  }
  nextTick(() => {
    if (terminalOutput.value) {
      terminalOutput.value.scrollTop = terminalOutput.value.scrollHeight
    }
  })
}

const clearTerminal = () => { terminalLogs.value = [] }

const toggleTerminalFullscreen = () => {
  isTerminalFullscreen.value = !isTerminalFullscreen.value
}

// --- connection ---
const connectMqtt = async (device: any) => {
  console.log('通知设备连接mqtt:', device.ip)
  const ipReady = await ensureIPSelected()
  if (!ipReady) return
  window.electronAPI.connectMqtt(device.ip)
  addTerminalLog('info', `通知设备连接mqtt，设备ID: ${device.id}`)
}

const reboot = (device: any) => {
  console.log('通知设备重启:', device.ip)
  window.electronAPI.deviceReboot(device.ip)
  addTerminalLog('info', `通知设备重启，设备ID: ${device.id}`)
}

const subscribeToDeviceTopics = async () => {
  if (!props.currentDevice) return
  const deviceId = props.currentDevice.id
  const topics = [`/dev/coo/${deviceId}`, `/dev/ota/${deviceId}`, `/dev/cmd/${deviceId}`]
  topics.forEach(t => addTerminalLog('info', `订阅主题: ${t}`))
}

const toggleTerminalConnection = async () => {
  if (isTerminalConnected.value) {
    isTerminalConnected.value = false
    terminalConnecting.value = false
    addTerminalLog('info', '终端已断开连接')
    return
  }
  terminalConnecting.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 500))
    await subscribeToDeviceTopics()
    isTerminalConnected.value = true
    addTerminalLog('success', '终端已连接，开始监听设备消息')
  } catch (error) {
    addTerminalLog('error', `连接失败: ${error}`)
  } finally {
    terminalConnecting.value = false
  }
}

// --- send ---
const sendTerminalMessage = async () => {
  if (!terminalInput.value.trim() || !props.currentDevice) return
  const input = terminalInput.value.trim()
  let topic = `/server/coo/${props.currentDevice.id}`
  let message = input
  try {
    const parsedMessage = JSON.parse(message)
    message = JSON.stringify(parsedMessage)
  } catch {
    message = JSON.stringify({ data: message })
  }
  const success = await window.electronAPI.mqttPublish(topic, message, { qos: 1 })
  if (success) {
    addTerminalLog('send', `发送到 ${topic}: ${message}`)
    terminalInput.value = ''
  } else {
    addTerminalLog('error', '消息发送失败')
  }
}

// --- quick commands ---
const executeQuickCommand = (cmd: any) => {
  if (!props.currentDevice) return
  const topic = cmd.topic ? cmd.topic + props.currentDevice.id : `/server/coo/${props.currentDevice.id}`

  if (cmd.action === 'clear') { clearTerminal(); return }
  if (cmd.action === 'reboot') { reboot(props.currentDevice); return }
  if (cmd.action === 'connect') { connectMqtt(props.currentDevice); return }

  if (cmd.action === 'get_config') {
    const modules = ['basic', 'interface', 'network', 'channels', 'modbus']
    modules.forEach((module, index) => {
      setTimeout(() => {
        const message = JSON.stringify({ type: 'get_config', flag: module })
        const success = window.electronAPI.mqttPublish(topic, message, { qos: 1 })
        if (success) {
          addTerminalLog('send', `快速命令: ${cmd.name} -> ${topic} ${message}`)
        }
      }, index * 200)
    })
    return
  }

  const success = window.electronAPI.mqttPublish(topic, cmd.message, { qos: 1 })
  if (success) {
    addTerminalLog('send', `快速命令: ${cmd.name} -> ${topic} ${cmd.message}`)
  }
}

// --- lifecycle ---
const handleTerminalDialogClose = (done: () => void) => {
  if (isTerminalConnected.value) {
    ElMessageBox.confirm('终端正在连接中，确定要关闭吗？', '确认关闭', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      isTerminalConnected.value = false
      done()
    }).catch(() => {})
  } else {
    done()
  }
}

const onDialogOpen = () => {
  isTerminalConnected.value = false
  terminalLogs.value = []
  terminalInput.value = ''
  if (props.currentDevice) {
    addTerminalLog('info', `终端已就绪，设备ID: ${props.currentDevice.id}`)
    addTerminalLog('info', '输入格式: "主题 消息内容" 或直接输入JSON消息')
    addTerminalLog('info', '支持的主题:')
    addTerminalLog('info', `  订阅: /dev/coo/${props.currentDevice.id}, /dev/ota/${props.currentDevice.id}, /dev/cmd/${props.currentDevice.id}`)
    addTerminalLog('info', `  发布: /server/coo/${props.currentDevice.id}`)
  }
  toggleTerminalConnection()
}

const onDialogClose = () => {
  isTerminalConnected.value = false
}

// MQTT message handler
const handleMqttMessage = (_event: any, data: any) => {
  if (!isTerminalConnected.value || !props.currentDevice) return
  const { topic, payload } = data
  if (topic.includes(props.currentDevice.id)) {
    addTerminalLog('receive', payload, topic)
  }
}

onMounted(() => {
  window.electronAPI.onMqttMessagePublished(handleMqttMessage)
})

onUnmounted(() => {
  // cleanup if needed
})
</script>

<style scoped>
/* ===== 终端对话框 ===== */
.terminal-dialog-content { display: flex; flex-direction: column; height: 60vh; }

.terminal-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.terminal-controls .device-info {
  display: flex; gap: 16px; font-size: 14px; color: #cbd5e1;
}
.control-buttons { display: flex; gap: 8px; align-items: center; }

.terminal-output {
  flex: 1;
  background: #0a0e14;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 14px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 13px;
  color: #d4d4d4;
  overflow-y: auto;
  margin-bottom: 16px;
  min-height: 300px;
  box-shadow: inset 0 2px 8px rgba(0,0,0,0.3);
}

.log-entry { margin-bottom: 3px; line-height: 1.5; word-break: break-all; }
.log-entry .timestamp { color: #6a9955; margin-right: 8px; }
.log-entry .topic { color: #569cd6; margin-right: 8px; font-weight: bold; }
.log-entry.info .message { color: #9cdcfe; }
.log-entry.success .message { color: #4ec9b0; }
.log-entry.error .message { color: #f44747; }
.log-entry.send .message { color: #ce9178; }
.log-entry.receive .message { color: #d7ba7d; }

.terminal-input { display: flex; flex-direction: column; gap: 12px; }
.quick-commands { display: flex; gap: 8px; flex-wrap: wrap; }

/* 对话框样式 */
:deep(.el-dialog) {
  background: rgba(17,24,39,0.95) !important;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 20px !important;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6) !important;
}
:deep(.el-dialog__header) {
  border-bottom: 1px solid rgba(255,255,255,0.06);
  padding: 20px 24px 16px;
}
:deep(.el-dialog__title) {
  color: #e0e0e0 !important;
  font-weight: 700;
}
:deep(.el-dialog__body) {
  color: #cbd5e1;
  padding: 20px 24px;
}
:deep(.el-dialog--fullscreen .terminal-dialog-content) { height: calc(100vh - 100px); }
:deep(.el-dialog--fullscreen .terminal-output) { min-height: 60vh; }
</style>
