<template>
  <div class="terminal-container">
    <h3>设备终端</h3>

    <!-- 终端控制栏 -->
    <div class="terminal-controls">
      <el-button type="primary" size="small" @click="connectTerminal">
        {{ isConnected ? '断开终端' : '连接终端' }}
      </el-button>
      <el-button size="small" @click="clearTerminal">清空终端</el-button>
      <el-tag :type="isConnected ? 'success' : 'info'">
        {{ isConnected ? '已连接' : '未连接' }}
      </el-tag>
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
          placeholder="输入要发送的消息，格式：主题 消息内容"
          :disabled="!isConnected"
          @keyup.enter="sendTerminalMessage"
      >
        <template #append>
          <el-button
              :disabled="!isConnected || !terminalInput"
              @click="sendTerminalMessage"
          >
            发送
          </el-button>
        </template>
      </el-input>

      <div class="quick-commands">
        <el-button
            size="small"
            v-for="cmd in quickCommands"
            :key="cmd.name"
            @click="executeQuickCommand(cmd)"
            :disabled="!isConnected"
        >
          {{ cmd.name }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  deviceId: string
}>()

// 终端状态
const isConnected = ref(false)
const terminalLogs = ref<any[]>([])
const terminalInput = ref('')
const terminalOutput = ref<HTMLElement>()

// 快速命令
const quickCommands = ref([
  { name: '获取配置', topic: 'config/get', message: '{"type":"get_config"}' },
  { name: '重启设备', topic: 'cmd/reboot', message: '{"type":"reboot"}' },
  { name: '设备信息', topic: 'sys/info', message: '{"type":"get_info"}' },
  { name: '清空终端', topic: '', message: '', action: 'clear' }
])

// 连接终端
const connectTerminal = async () => {
  if (isConnected.value) {
    // 断开连接
    isConnected.value = false
    addTerminalLog('info', '终端已断开连接')
    return
  }

  try {
    // 订阅设备相关主题
    await subscribeToDeviceTopics()
    isConnected.value = true
    addTerminalLog('success', '终端已连接，开始监听设备消息')
  } catch (error) {
    addTerminalLog('error', `连接失败: ${error}`)
  }
}

// 订阅设备主题
const subscribeToDeviceTopics = async () => {
  // 订阅设备响应主题
  const cooTopic = `/dev/coo/${props.deviceId}`
  const otaTopic = `/dev/ota/${props.deviceId}`

  addTerminalLog('info', `订阅主题: ${cooTopic}`)
  addTerminalLog('info', `订阅主题: ${otaTopic}`)

  // 这里可以通过 IPC 告诉主进程订阅这些主题
  // await window.electronAPI.mqttSubscribe([cooTopic, otaTopic])
}

// 发送终端消息
const sendTerminalMessage = async () => {
  if (!terminalInput.value.trim()) return

  const input = terminalInput.value.trim()
  let topic = ''
  let message = ''

  // 解析输入：支持 "主题 消息" 格式或直接 JSON 消息
  if (input.includes(' ')) {
    const parts = input.split(' ')
    topic = parts[0]
    message = parts.slice(1).join(' ')
  } else {
    // 如果没有指定主题，使用默认主题
    topic = `/server/coo/${props.deviceId}`
    message = input
  }

  try {
    // 尝试解析 JSON
    const parsedMessage = JSON.parse(message)
    message = JSON.stringify(parsedMessage)
  } catch {
    // 如果不是 JSON，保持原样
    message = JSON.stringify({ data: message })
  }

  // 通过 MQTT 发布消息
  const success = await window.electronAPI.mqttPublish({
    topic: topic,
    message: message,
    options: { qos: 1 }
  })

  if (success) {
    addTerminalLog('send', `发送到 ${topic}: ${message}`)
    terminalInput.value = ''
  } else {
    addTerminalLog('error', '消息发送失败')
  }
}

// 执行快速命令
const executeQuickCommand = (cmd: any) => {
  if (cmd.action === 'clear') {
    clearTerminal()
    return
  }

  // 发布快速命令
  const topic = cmd.topic.startsWith('/') ? cmd.topic : `/server/coo/${props.deviceId}`

  window.electronAPI.mqttPublish({
    topic: topic,
    message: cmd.message,
    options: { qos: 1 }
  }).then(success => {
    if (success) {
      addTerminalLog('send', `快速命令: ${cmd.name} -> ${topic}`)
    }
  })
}

// 添加终端日志
const addTerminalLog = (type: string, message: string, topic?: string) => {
  const log = {
    type,
    message,
    topic,
    timestamp: new Date().toLocaleTimeString()
  }

  terminalLogs.value.push(log)

  // 限制日志数量
  if (terminalLogs.value.length > 1000) {
    terminalLogs.value = terminalLogs.value.slice(-500)
  }

  // 自动滚动到底部
  nextTick(() => {
    if (terminalOutput.value) {
      terminalOutput.value.scrollTop = terminalOutput.value.scrollHeight
    }
  })
}

// 清空终端
const clearTerminal = () => {
  terminalLogs.value = []
}

// 监听 MQTT 消息
const handleMqttMessage = (event: any, data: any) => {
  if (!isConnected.value) return

  const { topic, payload, client } = data

  // 只处理当前设备的消息
  if (topic.includes(props.deviceId)) {
    addTerminalLog('receive', payload, topic)
  }
}

// 组件生命周期
onMounted(() => {
  // 监听 MQTT 消息
  window.electronAPI.onMqttMessagePublished(handleMqttMessage)

  // 添加欢迎信息
  addTerminalLog('info', `终端已就绪，设备ID: ${props.deviceId}`)
  addTerminalLog('info', '输入格式: "主题 消息内容" 或直接输入JSON消息')
  addTerminalLog('info', '支持的主题:')
  addTerminalLog('info', `  订阅: /dev/coo/${props.deviceId}, /dev/ota/${props.deviceId}`)
  addTerminalLog('info', `  发布: /server/coo/${props.deviceId}`)
})

onUnmounted(() => {
  // 清理监听器
  window.electronAPI.removeMqttMessageListener()
})
</script>

<style scoped>
.terminal-container {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  background: #fafafa;
  margin-top: 20px;
}

.terminal-container h3 {
  margin: 0 0 16px 0;
  color: #303133;
  font-size: 16px;
}

.terminal-controls {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
}

.terminal-output {
  height: 300px;
  background: #1e1e1e;
  border-radius: 4px;
  padding: 12px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: #d4d4d4;
  overflow-y: auto;
  margin-bottom: 16px;
}

.log-entry {
  margin-bottom: 4px;
  line-height: 1.4;
}

.log-entry .timestamp {
  color: #6a9955;
  margin-right: 8px;
}

.log-entry .topic {
  color: #569cd6;
  margin-right: 8px;
  font-weight: bold;
}

.log-entry.info .message {
  color: #9cdcfe;
}

.log-entry.success .message {
  color: #4ec9b0;
}

.log-entry.error .message {
  color: #f44747;
}

.log-entry.send .message {
  color: #ce9178;
}

.log-entry.receive .message {
  color: #d7ba7d;
}

.terminal-input {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-commands {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.quick-commands .el-button {
  font-size: 12px;
  padding: 4px 8px;
}
</style>