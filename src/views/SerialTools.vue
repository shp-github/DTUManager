<script setup lang="ts">
import { ref, nextTick, computed, onMounted, onBeforeUnmount, watch } from 'vue'

interface SerialPortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  pnpId?: string
  vendorId?: string
  productId?: string
}

interface LogEntry {
  id: number
  type: 'send' | 'receive' | 'system'
  data: string
  timestamp: string
}

const ports = ref<SerialPortInfo[]>([])
const selectedPort = ref('')
const baudRate = ref(115200)
const isConnected = ref(false)
const connecting = ref(false)
const sendInput = ref('')
const sendHex = ref(true)
const logs = ref<LogEntry[]>([])
const autoScroll = ref(true)
const terminalRef = ref<HTMLDivElement | null>(null)
const receiveHex = ref(false)  // 接收显示模式：true=HEX, false=ASCII（默认ASCII）
let logId = 0

// ========== 搜索功能 ==========
const searchVisible = ref(false)
const searchQuery = ref('')
const currentMatchIndex = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)

// 匹配的日志数组索引列表
const searchMatches = computed(() => {
  if (!searchQuery.value.trim()) return []
  const query = searchQuery.value.toLowerCase()
  return logs.value
    .map((log, index) => log.data.toLowerCase().includes(query) ? index : -1)
    .filter(i => i !== -1)
})

// 当前匹配对应的 log id
const currentMatchLogId = computed(() => {
  if (searchMatches.value.length === 0 || currentMatchIndex.value >= searchMatches.value.length) return null
  const logIndex = searchMatches.value[currentMatchIndex.value]
  return logs.value[logIndex]?.id ?? null
})

// 搜索条件变化时重置索引
watch(searchQuery, () => { currentMatchIndex.value = 0 })

const baudRates = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]

// ========== Modbus RTU ==========
const modbusSlaveId = ref(1)
const modbusFuncCode = ref('03')
const modbusStartAddr = ref(0)
const modbusQuantity = ref(1)
const modbusWriteValue = ref(0)

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

// CRC16 Modbus
const crc16Modbus = (data: number[]): number => {
  let crc = 0xFFFF
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      if (crc & 1) {
        crc = (crc >> 1) ^ 0xA001
      } else {
        crc >>= 1
      }
    }
  }
  return crc
}

// 生成 Modbus RTU 帧
const buildModbusRtuFrame = () => {
  const slaveId = modbusSlaveId.value & 0xFF
  const fc = parseInt(modbusFuncCode.value, 16)
  const startAddr = modbusStartAddr.value & 0xFFFF
  const quantity = modbusQuantity.value & 0xFFFF
  const writeVal = modbusWriteValue.value & 0xFFFF

  let pdu: number[] = []

  if (fc === 0x01 || fc === 0x02 || fc === 0x03 || fc === 0x04) {
    pdu = [slaveId, fc, (startAddr >> 8) & 0xFF, startAddr & 0xFF, (quantity >> 8) & 0xFF, quantity & 0xFF]
  } else if (fc === 0x05) {
    const coilVal = writeVal ? 0xFF00 : 0x0000
    pdu = [slaveId, fc, (startAddr >> 8) & 0xFF, startAddr & 0xFF, (coilVal >> 8) & 0xFF, coilVal & 0xFF]
  } else if (fc === 0x06) {
    pdu = [slaveId, fc, (startAddr >> 8) & 0xFF, startAddr & 0xFF, (writeVal >> 8) & 0xFF, writeVal & 0xFF]
  } else if (fc === 0x10) {
    const byteCount = quantity * 2
    pdu = [slaveId, fc, (startAddr >> 8) & 0xFF, startAddr & 0xFF, (quantity >> 8) & 0xFF, quantity & 0xFF, byteCount]
    for (let i = 0; i < quantity; i++) {
      pdu.push((writeVal >> 8) & 0xFF, writeVal & 0xFF)
    }
  }

  // 计算 CRC16
  const crc = crc16Modbus(pdu)
  pdu.push(crc & 0xFF, (crc >> 8) & 0xFF) // CRC 低字节在前

  return pdu.map(b => b.toString(16).padStart(2, '0')).join(' ')
}

// 发送 Modbus 指令
const sendModbusCommand = async () => {
  const hexStr = buildModbusRtuFrame()
  sendInput.value = hexStr
  sendHex.value = true
  await sendData()
}

// 格式化 HEX 显示
const formatHex = (hex: string) => {
  return hex.replace(/\s/g, '').replace(/(.{2})/g, '$1 ').trim().toUpperCase()
}

// 格式化时间
const formatTime = () => {
  const now = new Date()
  return now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
}

// 添加日志
const addLog = (type: LogEntry['type'], data: string) => {
  logs.value.push({ id: ++logId, type, data, timestamp: formatTime() })
  if (logs.value.length > 2000) logs.value = logs.value.slice(-1500)
  if (autoScroll.value) {
    nextTick(() => {
      if (terminalRef.value) terminalRef.value.scrollTop = terminalRef.value.scrollHeight
    })
  }
}

// 刷新端口列表
const refreshPorts = async () => {
  try {
    const result = await window.electronAPI.invoke('serial-list-ports')
    ports.value = result.ports || []
    if (ports.value.length > 0 && !selectedPort.value) {
      selectedPort.value = ports.value[0].path
    }
  } catch (e: any) {
    addLog('system', `获取串口列表失败: ${e.message}`)
  }
}

// 连接串口
const connect = async () => {
  if (!selectedPort.value) return
  connecting.value = true
  try {
    const result = await window.electronAPI.invoke('serial-open', {
      path: selectedPort.value,
      baudRate: baudRate.value
    })
    if (result.success) {
      isConnected.value = true
      addLog('system', `已连接到 ${selectedPort.value} (波特率: ${baudRate.value})`)
    } else {
      addLog('system', `连接失败: ${result.error}`)
    }
  } catch (e: any) {
    addLog('system', `连接异常: ${e.message}`)
  } finally {
    connecting.value = false
  }
}

// 断开连接
const disconnect = async () => {
  try {
    const result = await window.electronAPI.invoke('serial-close')
    if (result.success) {
      isConnected.value = false
      addLog('system', '已断开连接')
    }
  } catch (e: any) {
    addLog('system', `断开失败: ${e.message}`)
  }
}

// 发送数据
const sendData = async () => {
  if (!isConnected.value || !sendInput.value.trim()) return
  try {
    const data = sendInput.value
    const result = await window.electronAPI.invoke('serial-send', {
      data,
      hex: sendHex.value
    })
    if (result.success) {
      const display = sendHex.value ? formatHex(data) : data
      addLog('send', display)
    } else {
      addLog('system', `发送失败: ${result.error}`)
    }
  } catch (e: any) {
    addLog('system', `发送异常: ${e.message}`)
  }
}

// 清空日志
const clearLogs = () => {
  logs.value = []
  logId = 0
}

// ========== 搜索相关方法 ==========

// HTML 转义
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 高亮文本（支持区分当前匹配）
const getHighlightedHtml = (text: string, isActiveLine: boolean): string => {
  const escaped = escapeHtml(text)
  if (!searchQuery.value.trim()) return escaped
  const escapedQuery = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  const cls = isActiveLine ? 'search-highlight-current' : 'search-highlight'
  return escaped.replace(regex, `<mark class="${cls}">$1</mark>`)
}

// 打开搜索栏
const openSearch = () => {
  searchVisible.value = true
  nextTick(() => { searchInputRef.value?.focus() })
}

// 关闭搜索栏
const closeSearch = () => {
  searchVisible.value = false
  searchQuery.value = ''
  currentMatchIndex.value = 0
}

// 滚动到当前匹配行
const scrollToCurrentMatch = () => {
  if (searchMatches.value.length === 0) return
  const logId = currentMatchLogId.value
  if (logId != null) {
    nextTick(() => {
      const el = document.querySelector(`[data-log-id="${logId}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }
}

// 上一个匹配
const prevMatch = () => {
  if (searchMatches.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value - 1 + searchMatches.value.length) % searchMatches.value.length
  scrollToCurrentMatch()
}

// 下一个匹配
const nextMatch = () => {
  if (searchMatches.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value + 1) % searchMatches.value.length
  scrollToCurrentMatch()
}

// 键盘事件：Ctrl+F 打开搜索，Esc 关闭
const onKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    openSearch()
    return
  }
  if (e.key === 'Escape' && searchVisible.value && document.activeElement === searchInputRef.value) {
    closeSearch()
  }
}

// 接收串口数据
const handleSerialData = (_event: any, data: any) => {
  // 调试：打印实际接收到的数据
  console.log('[SerialTools] raw data:', data)

  // 系统消息（hex 为空字符串或 null）
  if (data && (data.hex === '' || data.hex == null)) {
    const msg = data.data || ''
    if (msg) addLog('system', msg)
    return
  }

  // 数据消息
  const hexStr = data && data.hex ? data.hex : ''
  let display = ''
  if (receiveHex.value) {
    display = formatHex(hexStr)
  } else {
    const raw = data && data.data ? data.data : ''
    display = String(raw).replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '.')
  }
  addLog('receive', display)
}

onMounted(() => {
  refreshPorts()
  window.electronAPI.on('serial-data', handleSerialData)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.electronAPI.off('serial-data', handleSerialData)
  if (isConnected.value) {
    window.electronAPI.invoke('serial-close')
  }
})
</script>

<template>
  <div class="serial-tools">
    <div class="main-layout">
      <!-- 左侧：连接 + 终端 -->
      <div class="left-panel">
        <!-- 连接控制栏 -->
        <el-card class="control-card" shadow="hover">
          <div class="control-row">
            <el-select v-model="selectedPort" placeholder="选择串口" :disabled="isConnected" style="width: 170px;" size="small">
              <el-option v-for="port in ports" :key="port.path" :label="port.path + (port.manufacturer ? ` (${port.manufacturer})` : '')" :value="port.path" />
            </el-select>
            <el-button @click="refreshPorts" :disabled="isConnected" circle size="small">↻</el-button>
            <el-select v-model="baudRate" :disabled="isConnected" style="width: 120px;" size="small">
              <el-option v-for="rate in baudRates" :key="rate" :label="rate + ' bps'" :value="rate" />
            </el-select>
            <el-button v-if="!isConnected" type="primary" size="small" @click="connect" :loading="connecting" :disabled="!selectedPort">
              打开串口
            </el-button>
            <el-button v-else type="danger" size="small" @click="disconnect">关闭串口</el-button>
            <el-tag :type="isConnected ? 'success' : 'info'" size="small" effect="dark">
              {{ isConnected ? '已连接' : '未连接' }}
            </el-tag>
            <div class="spacer"></div>
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

        <!-- 搜索栏（Ctrl+F 唤起） -->
        <div v-if="searchVisible" class="search-bar">
          <div class="search-input-wrap">
            <svg class="search-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              class="search-input"
              placeholder="查找..."
              @keydown.enter="nextMatch"
              @keydown.escape="closeSearch"
            />
          </div>
          <span class="search-count" v-if="searchQuery.trim()">
            {{ searchMatches.length > 0 ? `${currentMatchIndex + 1} / ${searchMatches.length}` : '0 / 0' }}
          </span>
          <button class="search-btn" @click="prevMatch" :disabled="searchMatches.length === 0" title="上一个 (Shift+Enter)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="18 15 12 9 6 15"/>
            </svg>
          </button>
          <button class="search-btn" @click="nextMatch" :disabled="searchMatches.length === 0" title="下一个 (Enter)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <button class="search-btn search-close-btn" @click="closeSearch" title="关闭 (Esc)">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- 终端 -->
        <div class="terminal" ref="terminalRef">
          <div v-if="logs.length === 0" class="empty-hint">串口数据将在此显示...</div>
          <div v-for="log in logs" :key="log.id" :data-log-id="log.id" class="log-line" :class="['log-' + log.type, { 'log-line-active': currentMatchLogId === log.id }]">
            <span class="log-time">[{{ log.timestamp }}]</span>
            <span class="log-tag" v-if="log.type === 'send'">[TX]</span>
            <span class="log-tag" v-else-if="log.type === 'receive'">[RX]</span>
            <span class="log-tag" v-else>[SYS]</span>
            <span class="log-data" v-html="getHighlightedHtml(log.data, currentMatchLogId === log.id)"></span>
          </div>
        </div>

        <!-- 发送栏 -->
        <div class="send-bar">
          <el-checkbox v-model="sendHex" label="HEX" size="small" />
          <el-input v-model="sendInput" placeholder="输入要发送的数据" :disabled="!isConnected" @keyup.enter="sendData" style="flex: 1;" size="small" />
          <el-button type="primary" size="small" @click="sendData" :disabled="!isConnected || !sendInput.trim()">发送</el-button>
        </div>
      </div>

      <!-- 右侧：Modbus RTU -->
      <div class="right-panel">
        <el-card class="modbus-card" shadow="hover">
          <template #header>
            <span class="card-title">📋 Modbus RTU 指令</span>
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
              <code class="hex-preview">{{ formatHex(buildModbusRtuFrame()) }}</code>
            </div>
            <el-button type="success" size="small" @click="sendModbusCommand" :disabled="!isConnected" style="width: 100%;">
              发送 Modbus 指令
            </el-button>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.serial-tools {
  padding: 16px;
  background: var(--page-bg);
  height: 100%;
  display: flex;
  flex-direction: column;
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
  flex-shrink: 0;
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
  min-height: 120px;
  user-select: text;
  cursor: text;
  scrollbar-width: none;
}

.terminal::-webkit-scrollbar {
  display: none;
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

/* Modbus 面板 */
.modbus-card {
  border-radius: 8px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
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

/* ========== 搜索栏 ========== */
.search-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: #2d2d2d;
  border-bottom: 1px solid #3c3c3c;
  animation: search-bar-in 0.15s ease-out;
}

@keyframes search-bar-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.search-input-wrap {
  display: flex;
  align-items: center;
  flex: 1;
  background: #3c3c3c;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 2px 6px;
  gap: 4px;
}

.search-input-wrap:focus-within {
  border-color: #409eff;
}

.search-icon {
  color: #888;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: #d4d4d4;
  font-size: 12px;
  padding: 3px 0;
  min-width: 0;
}

.search-input::placeholder { color: #777; }

.search-count {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
  min-width: 50px;
  text-align: center;
  user-select: none;
}

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #ccc;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}

.search-btn:hover { background: #444; }
.search-btn:disabled { color: #555; background: transparent; cursor: default; }

.search-close-btn:hover { background: rgba(245, 108, 108, 0.2); color: #f56c6c; }

/* 搜索高亮 */
:deep(mark.search-highlight) {
  background: rgba(255, 204, 0, 0.4);
  color: #fff;
  border-radius: 2px;
  padding: 0 1px;
}

:deep(mark.search-highlight-current) {
  background: rgba(255, 152, 0, 0.65);
  color: #fff;
  border-radius: 2px;
  padding: 0 1px;
}

/* 当前匹配行高亮 */
.log-line-active {
  background: rgba(255, 255, 255, 0.05);
  border-left: 2px solid #409eff;
  padding-left: 10px !important;
}
</style>
