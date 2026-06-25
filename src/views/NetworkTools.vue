<script setup lang="ts">
import { ref, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'

// ========== 模式选择 ==========
const workMode = ref<'client' | 'server'>('client')
const protocol = ref<'tcp' | 'udp'>('tcp')

// ========== 网卡接口 ==========
interface NetworkInterface {
  name: string
  ip: string
  mac: string
  netmask: string
}
const networkInterfaces = ref<NetworkInterface[]>([])
const selectedLocalIp = ref('')

// ========== 连接设置 ==========
const remoteHost = ref('192.168.0.114')
const remotePort = ref(502)
const localPort = ref(502)
const isConnected = ref(false)
const isListening = ref(false)
const connecting = ref(false)
const autoReconnect = ref(true)
const reconnectTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const reconnectAttempts = ref(0)
const MAX_RECONNECT = 10
const sendHex = ref(true)
const sendInput = ref('')
const autoScroll = ref(true)
const terminalRef = ref<HTMLDivElement | null>(null)
const receiveHex = ref(true)  // 接收显示模式：true=HEX, false=ASCII

interface LogEntry {
  id: number
  type: 'send' | 'receive' | 'system'
  data: string
  timestamp: string
}

const logs = ref<LogEntry[]>([])
let logId = 0

// ========== Modbus TCP 快捷指令 ==========
const modbusMode = ref<'rtu' | 'tcp'>('rtu')
const modbusSlaveId = ref(1)
const modbusFuncCode = ref('03')
const modbusStartAddr = ref(0)
const modbusQuantity = ref(1)
const modbusWriteValue = ref(0)
let modbusTransId = 0

// Modbus RTU CRC16 计算
const calcCRC16 = (data: number[]): number => {
  let crc = 0xFFFF
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      if (crc & 0x0001) {
        crc = (crc >> 1) ^ 0xA001
      } else {
        crc >>= 1
      }
    }
  }
  return crc
}

const funcCodes = [
  { value: '01', label: '01 - 读线圈' },
  { value: '02', label: '02 - 读离散输入' },
  { value: '03', label: '03 - 读保持寄存器' },
  { value: '04', label: '04 - 读输入寄存器' },
  { value: '05', label: '05 - 写单个线圈' },
  { value: '06', label: '06 - 写单个寄存器' },
  { value: '10', label: '10 - 写多个寄存器' },
]

const isWriteFunc = computed(() => ['05', '06', '10'].includes(modbusFuncCode.value))

// 格式化时间
const formatTime = () => {
  const now = new Date()
  return now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
}

// 添加日志
const addLog = (type: LogEntry['type'], data: string) => {
  logs.value.push({ id: ++logId, type, data, timestamp: formatTime() })
  if (logs.value.length > 3000) logs.value = logs.value.slice(-2000)
  if (autoScroll.value) {
    nextTick(() => {
      if (terminalRef.value) terminalRef.value.scrollTop = terminalRef.value.scrollHeight
    })
  }
}

// 格式化 HEX
const formatHex = (hex: string) => {
  return hex.replace(/\s/g, '').replace(/(.{2})/g, '$1 ').trim().toUpperCase()
}

// 获取网卡列表
const loadNetworkInterfaces = async () => {
  try {
    const result = await window.electronAPI.invoke('get-network-interfaces-list')
    networkInterfaces.value = result || []
    if (networkInterfaces.value.length > 0 && !selectedLocalIp.value) {
      selectedLocalIp.value = networkInterfaces.value[0].ip
    }
  } catch (e: any) {
    addLog('system', `获取网卡列表失败: ${e.message}`)
  }
}

// 生成 Modbus 帧
const buildModbusFrame = () => {
  const fc = parseInt(modbusFuncCode.value, 16)
  const startAddr = modbusStartAddr.value & 0xFFFF
  const quantity = modbusQuantity.value & 0xFFFF
  const writeVal = modbusWriteValue.value & 0xFFFF

  let pdu: number[] = []

  if (fc === 0x01 || fc === 0x02 || fc === 0x03 || fc === 0x04) {
    pdu = [fc, (startAddr >> 8) & 0xFF, startAddr & 0xFF, (quantity >> 8) & 0xFF, quantity & 0xFF]
  } else if (fc === 0x05) {
    const coilVal = writeVal ? 0xFF00 : 0x0000
    pdu = [fc, (startAddr >> 8) & 0xFF, startAddr & 0xFF, (coilVal >> 8) & 0xFF, coilVal & 0xFF]
  } else if (fc === 0x06) {
    pdu = [fc, (startAddr >> 8) & 0xFF, startAddr & 0xFF, (writeVal >> 8) & 0xFF, writeVal & 0xFF]
  } else if (fc === 0x10) {
    const byteCount = quantity * 2
    pdu = [fc, (startAddr >> 8) & 0xFF, startAddr & 0xFF, (quantity >> 8) & 0xFF, quantity & 0xFF, byteCount]
    for (let i = 0; i < quantity; i++) {
      pdu.push((writeVal >> 8) & 0xFF, writeVal & 0xFF)
    }
  }

  if (modbusMode.value === 'tcp') {
    // TCP: MBAP 头 + PDU
    modbusTransId++
    const transId = modbusTransId & 0xFFFF
    const unitId = modbusSlaveId.value & 0xFF
    const length = pdu.length + 1
    const mbap = [
      (transId >> 8) & 0xFF, transId & 0xFF,
      0x00, 0x00,
      (length >> 8) & 0xFF, length & 0xFF,
      unitId
    ]
    const frame = [...mbap, ...pdu]
    return frame.map(b => b.toString(16).padStart(2, '0')).join(' ')
  } else {
    // RTU: 地址 + PDU + CRC16
    const addr = modbusSlaveId.value & 0xFF
    const adu = [addr, ...pdu]
    const crc = calcCRC16(adu)
    adu.push(crc & 0xFF, (crc >> 8) & 0xFF)
    return adu.map(b => b.toString(16).padStart(2, '0')).join(' ')
  }
}

// 发送 Modbus 指令
const sendModbusCommand = async () => {
  const hexStr = buildModbusFrame()
  sendInput.value = hexStr
  sendHex.value = true
  await sendData()
}

// ========== 客户端模式 ==========
const connect = async () => {
  if (!remoteHost.value.trim()) return
  connecting.value = true
  try {
    const result = await window.electronAPI.invoke('network-tcp-connect', {
      host: remoteHost.value.trim(),
      port: remotePort.value,
      protocol: protocol.value
    })
    if (result.success) {
      isConnected.value = true
      reconnectAttempts.value = 0
      addLog('system', `[客户端] 已连接到 ${remoteHost.value}:${remotePort.value} (${protocol.value.toUpperCase()})`)
    } else {
      addLog('system', `连接失败: ${result.error}`)
    }
  } catch (e: any) {
    addLog('system', `连接异常: ${e.message}`)
  } finally {
    connecting.value = false
  }
}

const disconnect = async () => {
  cancelReconnect()
  stopTimer()
  try {
    await window.electronAPI.invoke('network-tcp-disconnect')
    isConnected.value = false
    addLog('system', '已断开连接')
  } catch (e: any) {
    addLog('system', `断开失败: ${e.message}`)
  }
}

// ========== 服务端模式 ==========
const startServer = async () => {
  if (!selectedLocalIp.value) return
  connecting.value = true
  try {
    const result = await window.electronAPI.invoke('network-server-start', {
      host: selectedLocalIp.value,
      port: localPort.value,
      protocol: protocol.value
    })
    if (result.success) {
      isListening.value = true
      addLog('system', `[服务端] 正在监听 ${selectedLocalIp.value}:${localPort.value} (${protocol.value.toUpperCase()})`)
    } else {
      addLog('system', `启动服务失败: ${result.error}`)
    }
  } catch (e: any) {
    addLog('system', `启动异常: ${e.message}`)
  } finally {
    connecting.value = false
  }
}

const stopServer = async () => {
  stopTimer()
  try {
    await window.electronAPI.invoke('network-server-stop')
    isListening.value = false
    addLog('system', '服务端已停止')
  } catch (e: any) {
    addLog('system', `停止失败: ${e.message}`)
  }
}

// ========== 数据收发 ==========
const sendData = async () => {
  const active = workMode.value === 'client' ? isConnected.value : isListening.value
  if (!active || !sendInput.value.trim()) return
  try {
    const result = await window.electronAPI.invoke('network-tcp-send', {
      data: sendInput.value,
      hex: sendHex.value
    })
    if (result.success) {
      const display = sendHex.value ? formatHex(sendInput.value) : sendInput.value
      addLog('send', display)
    } else {
      addLog('system', `发送失败: ${result.error}`)
      // 如果是连接断开导致的失败，更新状态并触发重连
      if (result.error === 'TCP未连接' || result.error === 'UDP未连接') {
        isConnected.value = false
        tryReconnect()
      }
    }
  } catch (e: any) {
    addLog('system', `发送异常: ${e.message}`)
  }
}

const clearLogs = () => { logs.value = []; logId = 0 }

// ========== 定时发送 ==========
const timerEnabled = ref(false)
const timerInterval = ref(1000)
const timerHandle = ref<ReturnType<typeof setInterval> | null>(null)

const toggleTimer = () => {
  if (timerEnabled.value) {
    stopTimer()
  } else {
    startTimer()
  }
}

const startTimer = () => {
  if (timerHandle.value) return
  if (!sendInput.value.trim()) {
    timerEnabled.value = false
    addLog('system', '定时发送启动失败: 输入内容为空')
    return
  }
  const active = workMode.value === 'client' ? isConnected.value : isListening.value
  if (!active) {
    timerEnabled.value = false
    addLog('system', '定时发送启动失败: 未连接/未监听')
    return
  }
  timerEnabled.value = true
  addLog('system', `定时发送已启动 (每 ${timerInterval.value}ms)`)
  timerHandle.value = setInterval(() => {
    sendData()
  }, timerInterval.value)
}

const stopTimer = () => {
  if (timerHandle.value) {
    clearInterval(timerHandle.value)
    timerHandle.value = null
  }
  timerEnabled.value = false
  addLog('system', '定时发送已停止')
}

const onTimerIntervalChange = () => {
  if (timerEnabled.value) {
    stopTimer()
    startTimer()
  }
}

// 接收数据
const handleNetworkData = (_event: any, data: any) => {
  // 客户端连接通知（有 client 字段）
  if (data && data.client) {
    addLog('system', `[客户端连接] ${data.client}`)
    return
  }

  // 系统消息：hex 为空字符串（后端把 hex='' 作为系统消息标识）
  if (!data || data.hex === '' || data.hex == null) {
    const msg = (data && data.data) || ''
    addLog('system', msg)

    // 连接断开 / 错误 → 触发自动重连
    if (msg.startsWith('[连接已关闭]') || msg.startsWith('[ERROR]')) {
      if (workMode.value === 'client') {
        isConnected.value = false
        tryReconnect()
      }
    }
    return
  }

  // 数据消息：hex 非空 → 根据显示模式决定展示 HEX 还是 ASCII
  const hexStr = data.hex || ''
  let display = ''
  if (receiveHex.value) {
    display = formatHex(hexStr)
  } else {
    // ASCII 模式：保留中文、可打印 ASCII、换行回车制表符，其余显示为 .
    const raw = data.data || ''
    display = raw.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '.')
  }
  addLog('receive', display)
}

// 自动重连
const tryReconnect = () => {
  if (workMode.value !== 'client') return
  if (!autoReconnect.value) return
  if (reconnectTimer.value) return
  if (reconnectAttempts.value >= MAX_RECONNECT) {
    addLog('system', `重连失败: 已达最大重试次数(${MAX_RECONNECT})`)
    reconnectAttempts.value = 0
    return
  }
  reconnectAttempts.value++
  const delay = Math.min(2000 * reconnectAttempts.value, 15000)
  addLog('system', `将在 ${delay / 1000}s 后第${reconnectAttempts.value}次自动重连...`)
  reconnectTimer.value = setTimeout(async () => {
    reconnectTimer.value = null
    await connect()
  }, delay)
}

const cancelReconnect = () => {
  if (reconnectTimer.value) {
    clearTimeout(reconnectTimer.value)
    reconnectTimer.value = null
  }
  reconnectAttempts.value = 0
}

// Ping
const pingHost = ref('')
const pingResult = ref<string[]>([])
const pinging = ref(false)

const doPing = async () => {
  if (!pingHost.value.trim()) return
  pinging.value = true
  pingResult.value = []
  try {
    const result = await window.electronAPI.invoke('network-ping', pingHost.value.trim())
    pingResult.value = result.lines || []
    if (result.error) pingResult.value.push(`错误: ${result.error}`)
  } catch (e: any) {
    pingResult.value = [`执行失败: ${e.message}`]
  } finally {
    pinging.value = false
  }
}

// 是否可发送
const canSend = computed(() => {
  return workMode.value === 'client' ? isConnected.value : isListening.value
})

onMounted(() => {
  loadNetworkInterfaces()
  window.electronAPI.on('network-data', handleNetworkData)
})

onBeforeUnmount(() => {
  cancelReconnect()
  stopTimer()
  window.electronAPI.off('network-data', handleNetworkData)
  if (isConnected.value) window.electronAPI.invoke('network-tcp-disconnect')
  if (isListening.value) window.electronAPI.invoke('network-server-stop')
})
</script>

<template>
  <div class="network-tools">
    <h2 class="page-title">网络工具</h2>

    <div class="main-layout">
      <!-- 左侧：连接 + 终端 -->
      <div class="left-panel">
        <!-- 连接控制 -->
        <el-card class="control-card" shadow="hover">
          <div class="control-row">
            <!-- 模式切换 -->
            <el-radio-group v-model="workMode" :disabled="isConnected || isListening" size="small">
              <el-radio-button value="client">客户端</el-radio-button>
              <el-radio-button value="server">服务端</el-radio-button>
            </el-radio-group>
            <!-- 协议 -->
            <el-radio-group v-model="protocol" :disabled="isConnected || isListening" size="small">
              <el-radio-button value="tcp">TCP</el-radio-button>
              <el-radio-button value="udp">UDP</el-radio-button>
            </el-radio-group>
          </div>
          <div class="control-row" style="margin-top: 10px;">
            <!-- 客户端模式 -->
            <template v-if="workMode === 'client'">
              <el-input v-model="remoteHost" placeholder="目标IP" :disabled="isConnected" style="width: 150px;" size="small">
                <template #prepend>IP</template>
              </el-input>
              <el-input-number v-model="remotePort" :min="1" :max="65535" :disabled="isConnected" style="width: 130px;" size="small" />
              <el-button v-if="!isConnected" type="primary" size="small" @click="connect" :loading="connecting">
                连接
              </el-button>
              <el-button v-else type="danger" size="small" @click="disconnect">断开</el-button>
              <el-tag :type="isConnected ? 'success' : 'info'" size="small" effect="dark">
                {{ isConnected ? '已连接' : '未连接' }}
              </el-tag>
            </template>
            <!-- 服务端模式 -->
            <template v-else>
              <el-select v-model="selectedLocalIp" :disabled="isListening" size="small" style="width: 200px;" placeholder="选择网卡IP">
                <el-option v-for="iface in networkInterfaces" :key="iface.ip" :label="`${iface.ip} (${iface.name})`" :value="iface.ip" />
              </el-select>
              <el-input-number v-model="localPort" :min="1" :max="65535" :disabled="isListening" style="width: 130px;" size="small" />
              <el-button v-if="!isListening" type="success" size="small" @click="startServer" :loading="connecting">
                启动监听
              </el-button>
              <el-button v-else type="danger" size="small" @click="stopServer">停止</el-button>
              <el-tag :type="isListening ? 'success' : 'info'" size="small" effect="dark">
                {{ isListening ? '监听中' : '未启动' }}
              </el-tag>
            </template>
            <div class="spacer"></div>
            <el-checkbox v-if="workMode === 'client'" v-model="autoReconnect" :label="reconnectAttempts > 0 ? `自动重连(${reconnectAttempts}/${MAX_RECONNECT})` : '自动重连'" size="small" />
            <el-button size="small" @click="clearLogs">清空</el-button>
            <el-checkbox v-model="autoScroll" label="自动滚动" size="small" />
          </div>
        </el-card>

        <!-- 接收显示模式切换 -->
        <div class="receive-mode-bar">
          <el-radio-group v-model="receiveHex" size="small">
            <el-radio-button :value="true">HEX</el-radio-button>
            <el-radio-button :value="false">ASCII</el-radio-button>
          </el-radio-group>
          <span class="receive-mode-hint">{{ receiveHex ? '十六进制显示' : 'ASCII 显示' }}</span>
        </div>

        <!-- 终端 -->
        <div class="terminal" ref="terminalRef">
          <div v-if="logs.length === 0" class="empty-hint">
            {{ workMode === 'client' ? '连接目标后，收发数据将在此显示...' : '启动服务端监听后，收发数据将在此显示...' }}
          </div>
          <div v-for="log in logs" :key="log.id" class="log-line" :class="'log-' + log.type">
            <span class="log-time">[{{ log.timestamp }}]</span>
            <span class="log-tag" v-if="log.type === 'send'">[TX]</span>
            <span class="log-tag" v-else-if="log.type === 'receive'">[RX]</span>
            <span class="log-tag" v-else>[SYS]</span>
            <span class="log-data">{{ log.data }}</span>
          </div>
        </div>

        <!-- 发送栏 -->
        <div class="send-bar">
          <el-checkbox v-model="sendHex" label="HEX" size="small" />
          <el-input v-model="sendInput" placeholder="输入要发送的数据" :disabled="!canSend" @keyup.enter="sendData" style="flex: 1;" size="small" />
          <el-button type="primary" size="small" @click="sendData" :disabled="!canSend || !sendInput.trim()">发送</el-button>
        </div>
        <!-- 定时发送栏 -->
        <div class="timer-bar">
          <el-switch v-model="timerEnabled" size="small" @change="toggleTimer" :disabled="!canSend || !sendInput.trim()" />
          <span class="timer-label">{{ timerEnabled ? '定时中' : '定时发' }}</span>
          <el-input-number v-model="timerInterval" :min="100" :max="60000" :step="100" :disabled="timerEnabled" size="small" style="width: 100px;" @change="onTimerIntervalChange" />
          <span class="timer-unit">ms</span>
        </div>
      </div>

      <!-- 右侧：Modbus + Ping -->
      <div class="right-panel">
        <!-- Modbus 指令 -->
        <el-card class="modbus-card" shadow="hover">
          <template #header>
            <div class="modbus-header">
              <span class="card-title">📋 Modbus 指令</span>
              <el-radio-group v-model="modbusMode" size="small">
                <el-radio-button value="rtu">RTU</el-radio-button>
                <el-radio-button value="tcp">TCP</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="modbus-form">
            <div class="form-row">
              <span class="form-label">从站地址</span>
              <el-input-number v-model="modbusSlaveId" :min="1" :max="247" size="small" style="width: 100%;" />
            </div>
            <div class="form-row">
              <span class="form-label">功能码</span>
              <el-select v-model="modbusFuncCode" size="small" style="width: 100%;">
                <el-option v-for="fc in funcCodes" :key="fc.value" :label="fc.label" :value="fc.value" />
              </el-select>
            </div>
            <div class="form-row">
              <span class="form-label">起始地址</span>
              <el-input-number v-model="modbusStartAddr" :min="0" :max="65535" size="small" style="width: 100%;" />
            </div>
            <div class="form-row" v-if="!isWriteFunc || modbusFuncCode === '10'">
              <span class="form-label">数量</span>
              <el-input-number v-model="modbusQuantity" :min="1" :max="125" size="small" style="width: 100%;" />
            </div>
            <div class="form-row" v-if="isWriteFunc">
              <span class="form-label">写入值</span>
              <el-input-number v-model="modbusWriteValue" :min="0" :max="65535" size="small" style="width: 100%;" />
            </div>
            <div class="form-row">
              <span class="form-label">预览</span>
              <code class="hex-preview">{{ formatHex(buildModbusFrame()) }}</code>
            </div>
            <el-button type="success" size="small" @click="sendModbusCommand" :disabled="!canSend" style="width: 100%;">
              发送 Modbus 指令
            </el-button>
          </div>
        </el-card>

        <!-- Ping -->
        <el-card class="ping-card" shadow="hover">
          <template #header>
            <span class="card-title">🏓 Ping 测试</span>
          </template>
          <div class="ping-body">
            <div class="input-row">
              <el-input v-model="pingHost" placeholder="IP / 域名" @keyup.enter="doPing" :disabled="pinging" size="small" />
              <el-button type="primary" size="small" @click="doPing" :loading="pinging" :disabled="!pingHost.trim()">Ping</el-button>
            </div>
            <div class="ping-result">
              <div v-for="(line, i) in pingResult" :key="i" class="ping-line">{{ line }}</div>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.network-tools {
  padding: 16px;
  background: var(--page-bg);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #333;
  margin: 0 0 12px 0;
}

.main-layout {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.right-panel {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
  overflow-y: auto;
}

.control-card {
  border-radius: 8px;
  margin-bottom: 10px;
}

.control-card :deep(.el-card__body) {
  padding: 10px 14px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.spacer { flex: 1; }

.terminal {
  flex: 1;
  background: #1e1e1e;
  border-radius: 8px 8px 0 0;
  padding: 12px;
  overflow-y: auto;
  font-family: 'Consolas', monospace;
  font-size: 12px;
  color: #d4d4d4;
  min-height: 200px;
}

.empty-hint { color: #666; text-align: center; padding: 50px 0; }

.log-line { line-height: 1.7; white-space: pre-wrap; word-break: break-all; }
.log-time { color: #555; margin-right: 4px; }
.log-tag { font-weight: 600; margin-right: 4px; }
.log-send .log-tag, .log-send .log-data { color: #e6a23c; }
.log-receive .log-tag, .log-receive .log-data { color: #67c23a; }
.log-system .log-tag { color: #409eff; }
.log-system .log-data { color: #909399; }

.send-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #2d2d2d;
  border-radius: 0 0 8px 8px;
}

.send-bar :deep(.el-checkbox__label) { color: #d4d4d4; }
.send-bar :deep(.el-input__wrapper) { background: #3c3c3c; box-shadow: none; }
.send-bar :deep(.el-input__inner) { color: #d4d4d4; }

/* 接收显示模式切换栏 */
.receive-mode-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px;
  background: #252526;
  border-bottom: 1px solid #333;
}

.receive-mode-hint {
  font-size: 12px;
  color: #909399;
}

/* 定时发送栏 */
.timer-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #2d2d2d;
  border-top: 1px solid #444;
}

.timer-label {
  font-size: 12px;
  color: #67c23a;
  width: 42px;
  flex-shrink: 0;
}

.timer-unit {
  font-size: 12px;
  color: #909399;
}

.timer-bar :deep(.el-input-number--small) {
  width: 100px;
}

.timer-bar :deep(.el-input__wrapper) {
  background: #3c3c3c;
  box-shadow: none;
}

.timer-bar :deep(.el-input__inner) {
  color: #d4d4d4;
}

/* 右侧面板 */
.modbus-card, .ping-card {
  border-radius: 8px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.modbus-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modbus-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-label {
  width: 65px;
  font-size: 12px;
  color: #606266;
  flex-shrink: 0;
}

.hex-preview {
  flex: 1;
  font-size: 11px;
  background: #f0f2f5;
  padding: 4px 8px;
  border-radius: 4px;
  word-break: break-all;
  color: #409eff;
  font-family: 'Consolas', monospace;
}

.ping-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-row {
  display: flex;
  gap: 8px;
}

.ping-result {
  background: #1e1e1e;
  border-radius: 6px;
  padding: 8px 10px;
  min-height: 80px;
  max-height: 150px;
  overflow-y: auto;
  font-family: 'Consolas', monospace;
  font-size: 11px;
  color: #d4d4d4;
}

.ping-line {
  line-height: 1.6;
}
</style>
