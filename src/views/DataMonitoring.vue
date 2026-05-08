<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Delete, VideoPlay, VideoPause } from '@element-plus/icons-vue'

interface LogEntry {
  id: number
  timestamp: string
  topic: string
  payload: string
  client: string
}

// ========== 公共状态 ==========
const activeTab = ref('mqtt')

// ========== MQTT 相关 ==========
const mqttLogs = ref<LogEntry[]>([])
const mqttTerminalRef = ref<HTMLElement | null>(null)
const mqttListening = ref(true)
const mqttAutoScroll = ref(true)
const mqttTopicFilter = ref('')
const maxLogs = 2000
let mqttLogId = 0

const mqttTopicFilterOptions = [
  { label: '全部主题', value: '' },
  { label: '/dev/coo/#', value: '/dev/coo/' },
  { label: '/dev/cmd/#', value: '/dev/cmd/' },
  { label: '/dev/ota/#', value: '/dev/ota/' },
  { label: '/server/coo/#', value: '/server/coo/' },
  { label: '/server/cmd/#', value: '/server/cmd/' },
]

// ========== UDP 相关 ==========
const udpLogs = ref<LogEntry[]>([])
const udpTerminalRef = ref<HTMLElement | null>(null)
const udpListening = ref(true)
const udpAutoScroll = ref(true)
let udpLogId = 0

// ========== 公共方法 ==========
const formatTime = () => {
  const now = new Date()
  return now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
}

// ========== MQTT 方法 ==========
const addMqttLog = (topic: string, payload: string, client: string) => {
  if (!mqttListening.value) return
  mqttLogs.value.push({ id: ++mqttLogId, timestamp: formatTime(), topic, payload, client })
  if (mqttLogs.value.length > maxLogs) mqttLogs.value = mqttLogs.value.slice(-1000)
  if (mqttAutoScroll.value) {
    nextTick(() => {
      if (mqttTerminalRef.value) mqttTerminalRef.value.scrollTop = mqttTerminalRef.value.scrollHeight
    })
  }
}

const handleMqttMessage = (_event: any, data: any) => {
  const { topic, payload, client } = data
  if (!topic) return
  let displayPayload: string
  try {
    if (typeof payload === 'string') {
      displayPayload = JSON.stringify(JSON.parse(payload), null, 2)
    } else if (typeof payload === 'object') {
      displayPayload = JSON.stringify(payload, null, 2)
    } else {
      displayPayload = String(payload)
    }
  } catch {
    displayPayload = String(payload)
  }
  addMqttLog(topic, displayPayload, client || 'unknown')
}

const filteredMqttLogs = computed(() => {
  if (!mqttTopicFilter.value) return mqttLogs.value
  return mqttLogs.value.filter(log => log.topic.startsWith(mqttTopicFilter.value))
})

const clearMqttLogs = () => { mqttLogs.value = []; mqttLogId = 0 }
const toggleMqttListening = () => { mqttListening.value = !mqttListening.value }

// ========== UDP 方法 ==========
const addUdpLog = (ip: string, payload: string, port: string) => {
  if (!udpListening.value) return
  udpLogs.value.push({ id: ++udpLogId, timestamp: formatTime(), topic: `${ip}:${port}`, payload, client: ip })
  if (udpLogs.value.length > maxLogs) udpLogs.value = udpLogs.value.slice(-1000)
  if (udpAutoScroll.value) {
    nextTick(() => {
      if (udpTerminalRef.value) udpTerminalRef.value.scrollTop = udpTerminalRef.value.scrollHeight
    })
  }
}

const handleUdpMessage = (_event: any, data: any) => {
  const { ip, port, raw, parsed } = data
  let displayPayload: string
  try {
    displayPayload = parsed ? JSON.stringify(parsed, null, 2) : raw
  } catch {
    displayPayload = raw || String(data)
  }
  addUdpLog(ip, displayPayload, String(port))
}

const clearUdpLogs = () => { udpLogs.value = []; udpLogId = 0 }
const toggleUdpListening = () => { udpListening.value = !udpListening.value }

// ========== 生命周期 ==========
onMounted(() => {
  window.electronAPI.onMqttMessagePublished(handleMqttMessage)
  addMqttLog('system', 'MQTT监听已启动，正在监听所有设备消息...', 'system')

  window.electronAPI.onUdpMessageReceived(handleUdpMessage)
  addUdpLog('system', 'UDP监听已启动，正在监听端口4210设备消息...', 'system')
})

onBeforeUnmount(() => {
  window.electronAPI.removeMqttListeners()
  window.electronAPI.removeUdpListeners()
})
</script>

<template>
  <div class="data-monitoring">
    <!-- Tab 切换 -->
    <div class="tab-bar">
      <div class="tab-item" :class="{ active: activeTab === 'mqtt' }" @click="activeTab = 'mqtt'">
        MQTT 监听
      </div>
      <div class="tab-item" :class="{ active: activeTab === 'udp' }" @click="activeTab = 'udp'">
        UDP 监听
      </div>
    </div>

    <!-- MQTT 面板 -->
    <div v-show="activeTab === 'mqtt'" class="panel">
      <div class="toolbar">
        <div class="toolbar-actions">
          <el-select v-model="mqttTopicFilter" placeholder="主题过滤" size="small" style="width: 150px">
            <el-option v-for="opt in mqttTopicFilterOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <el-tag :type="mqttListening ? 'success' : 'info'" size="small">
            {{ mqttListening ? '监听中' : '已暂停' }}
          </el-tag>
          <el-button size="small" :type="mqttListening ? 'warning' : 'success'" @click="toggleMqttListening">
            <el-icon><component :is="mqttListening ? VideoPause : VideoPlay" /></el-icon>
            {{ mqttListening ? '暂停' : '恢复' }}
          </el-button>
          <el-checkbox v-model="mqttAutoScroll" size="small">自动滚动</el-checkbox>
          <el-button size="small" type="danger" @click="clearMqttLogs">
            <el-icon><Delete /></el-icon>
            清空
          </el-button>
          <el-tag type="info" size="small">{{ filteredMqttLogs.length }}/{{ mqttLogs.length }} 条</el-tag>
        </div>
      </div>
      <div class="terminal" ref="mqttTerminalRef" @mousedown.prevent>
        <div v-for="log in filteredMqttLogs" :key="log.id" class="log-line" :class="{ 'log-system': log.client === 'system' }">
          <div class="log-header">
            <span class="log-time">{{ log.timestamp }}</span>
            <span class="log-client" v-if="log.client !== 'system'">[{{ log.client }}]</span>
            <span class="log-topic">{{ log.topic }}</span>
          </div>
          <pre class="log-payload">{{ log.payload }}</pre>
        </div>
        <div v-if="filteredMqttLogs.length === 0" class="empty-hint">暂无数据，等待设备上报消息...</div>
      </div>
    </div>

    <!-- UDP 面板 -->
    <div v-show="activeTab === 'udp'" class="panel">
      <div class="toolbar">
        <div class="toolbar-actions">
          <el-tag :type="udpListening ? 'success' : 'info'" size="small">
            {{ udpListening ? '监听中' : '已暂停' }}
          </el-tag>
          <el-button size="small" :type="udpListening ? 'warning' : 'success'" @click="toggleUdpListening">
            <el-icon><component :is="udpListening ? VideoPause : VideoPlay" /></el-icon>
            {{ udpListening ? '暂停' : '恢复' }}
          </el-button>
          <el-checkbox v-model="udpAutoScroll" size="small">自动滚动</el-checkbox>
          <el-button size="small" type="danger" @click="clearUdpLogs">
            <el-icon><Delete /></el-icon>
            清空
          </el-button>
          <el-tag type="info" size="small">{{ udpLogs.length }} 条</el-tag>
        </div>
      </div>
      <div class="terminal" ref="udpTerminalRef" @mousedown.prevent>
        <div v-for="log in udpLogs" :key="log.id" class="log-line" :class="{ 'log-system': log.client === 'system' }">
          <div class="log-header">
            <span class="log-time">{{ log.timestamp }}</span>
            <span class="log-client" v-if="log.client !== 'system'">[{{ log.topic }}]</span>
          </div>
          <pre class="log-payload">{{ log.payload }}</pre>
        </div>
        <div v-if="udpLogs.length === 0" class="empty-hint">暂无数据，等待设备UDP消息...</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-monitoring {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #1e1e1e;
  color: #d4d4d4;
}

.tab-bar {
  display: flex;
  background: #252526;
  border-bottom: 1px solid #404040;
  flex-shrink: 0;
}

.tab-item {
  padding: 10px 24px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: #888;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-item:hover {
  color: #d4d4d4;
}

.tab-item.active {
  color: #409eff;
  border-bottom-color: #409eff;
}

.panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  padding: 10px 20px;
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
  flex-shrink: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 深色主题下输入框样式修复 */
.toolbar-actions :deep(.el-input__wrapper) {
  background-color: #3c3c3c;
  box-shadow: 0 0 0 1px #555 inset;
}

.toolbar-actions :deep(.el-input__inner) {
  color: #e0e0e0;
}

.toolbar-actions :deep(.el-input__inner::placeholder) {
  color: #888;
}

.toolbar-actions :deep(.el-select .el-input__wrapper) {
  background-color: #3c3c3c;
  box-shadow: 0 0 0 1px #555 inset;
}

.toolbar-actions :deep(.el-checkbox__label) {
  color: #d4d4d4;
}

.terminal {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
}

.terminal::-webkit-scrollbar {
  width: 8px;
}

.terminal::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.terminal::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.log-line {
  display: flex;
  flex-direction: column;
  padding: 6px 0;
  border-bottom: 1px solid #2a2a2a;
}

.log-line:hover {
  background: #2a2d35;
}

.log-system {
  color: #6a9955;
  font-style: italic;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.log-time {
  color: #808080;
  flex-shrink: 0;
  font-size: 12px;
}

.log-client {
  color: #569cd6;
  flex-shrink: 0;
  font-size: 12px;
}

.log-topic {
  color: #ce9178;
  flex-shrink: 0;
  font-size: 12px;
}

.log-payload {
  color: #d4d4d4;
  margin: 2px 0 0 0;
  padding-left: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 12px;
}

.empty-hint {
  text-align: center;
  color: #666;
  padding: 60px 0;
  font-size: 14px;
}
</style>
