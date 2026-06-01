<template>
  <div class="log-view-container">
    <!-- 工具栏 -->
    <el-card class="filter-card" shadow="never">
      <div class="filter-bar">
        <div class="filter-item">
          <span class="filter-label">日期:</span>
          <el-select
            v-model="selectedDate"
            placeholder="选择日期"
            @change="onDateChange"
            :loading="loadingDates"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="d in dateList"
              :key="d"
              :label="d"
              :value="d"
            />
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">设备:</span>
          <el-select
            v-model="selectedDevice"
            placeholder="输入名称或编号搜索设备"
            @change="onDeviceChange"
            :loading="loadingDevices"
            :disabled="!selectedDate"
            clearable
            filterable
            :filter-method="filterDevices"
            style="width: 300px"
          >
            <el-option
              v-for="dev in filteredDeviceList"
              :key="dev.id"
              :label="dev.name"
              :value="dev.id"
            >
              <span style="font-weight:600">{{ dev.name }}</span>
              <span style="color:#909399;margin-left:8px;font-size:12px">{{ dev.id }}</span>
            </el-option>
          </el-select>
        </div>

        <div class="filter-item">
          <span class="filter-label">协议:</span>
          <el-radio-group v-model="selectedProtocol" @change="loadLogContent">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="udp">UDP</el-radio-button>
            <el-radio-button value="mqtt">MQTT</el-radio-button>
          </el-radio-group>
        </div>

        <div class="filter-item">
          <span class="filter-label">搜索:</span>
          <el-input
            v-model="searchKeyword"
            placeholder="输入关键词过滤..."
            clearable
            @input="onSearch"
            style="width: 200px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <div class="filter-item">
          <el-switch
            v-model="autoRefresh"
            active-text="自动刷新"
            @change="onAutoRefreshToggle"
          />
        </div>

        <div class="filter-item">
          <el-switch
            v-model="autoScroll"
            active-text="自动滚动"
          />
        </div>

        <div class="filter-item">
          <el-button @click="loadLogContent" :loading="loadingLog" type="primary">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 日志内容 -->
    <el-card class="log-content-card" shadow="never">
      <template #header>
        <div class="log-header">
          <span class="log-title">
            日志内容
            <span v-if="filteredLines.length" class="line-count">
              （显示 {{ filteredLines.length }} / {{ allLines.length }} 行）
            </span>
          </span>
          <el-switch
            v-model="showLineNumbers"
            active-text="行号"
            size="small"
          />
        </div>
      </template>

      <div
        class="log-content"
        ref="logContentRef"
        v-loading="loadingLog"
        element-loading-text="加载日志中..."
      >
        <template v-if="!selectedDate || !selectedDevice">
          <div class="log-placeholder">
            <el-icon :size="48" color="#c0c4cc"><Document /></el-icon>
            <p>请选择日期和设备以查看日志</p>
          </div>
        </template>
        <template v-else-if="loadingLog">
          <div class="log-placeholder">
            <p>正在加载日志...</p>
          </div>
        </template>
        <template v-else-if="filteredLines.length === 0">
          <div class="log-placeholder">
            <el-icon :size="48" color="#c0c4cc"><FolderOpened /></el-icon>
            <p>暂无日志记录</p>
          </div>
        </template>
        <template v-else>
          <div class="log-lines">
            <div
              v-for="(line, idx) in filteredLines"
              :key="idx"
              class="log-line"
              :class="getLineClass(line)"
            >
              <span v-if="showLineNumbers" class="line-number">{{ line.originalIndex + 1 }}</span>
              <span class="line-content" v-html="highlightLine(line.text)"></span>
            </div>
          </div>
        </template>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Search, Refresh, Document, FolderOpened } from '@element-plus/icons-vue'

// 日期列表
const dateList = ref<string[]>([])
const loadingDates = ref(false)

// 设备列表
const deviceList = ref<{ id: string; name: string }[]>([])
const filteredDeviceList = ref<{ id: string; name: string }[]>([])
const loadingDevices = ref(false)

// 选择项
const selectedDate = ref('')
const selectedDevice = ref('')
const selectedProtocol = ref('all')
const searchKeyword = ref('')
const autoRefresh = ref(false)
const autoScroll = ref(true)
const showLineNumbers = ref(true)

// 日志内容
const allLines = ref<{ text: string; originalIndex: number }[]>([])
const filteredLines = ref<{ text: string; originalIndex: number }[]>([])
const loadingLog = ref(false)
const logContentRef = ref<HTMLElement | null>(null)

// 定时器
let refreshTimer: ReturnType<typeof setInterval> | null = null

// 加载日期列表
async function loadDates() {
  loadingDates.value = true
  try {
    dateList.value = await window.electronAPI.getLogDates()
    // 默认选中最新日期
    if (dateList.value.length > 0 && !selectedDate.value) {
      selectedDate.value = dateList.value[0]
      await onDateChange(selectedDate.value)
    }
  } catch (err) {
    console.error('加载日期列表失败:', err)
  } finally {
    loadingDates.value = false
  }
}

// 日期变更
async function onDateChange(date: string) {
  selectedDevice.value = ''
  deviceList.value = []
  filteredDeviceList.value = []
  allLines.value = []
  filteredLines.value = []
  if (!date) return

  loadingDevices.value = true
  try {
    const devices = await window.electronAPI.getLogDevices(date)
    deviceList.value = devices
    filteredDeviceList.value = devices
    // 默认选中第一个设备
    if (devices.length > 0) {
      selectedDevice.value = devices[0].id
      await loadLogContent()
    }
  } catch (err) {
    console.error('加载设备列表失败:', err)
  } finally {
    loadingDevices.value = false
  }
}

// 自定义设备过滤（支持名称或ID搜索）
function filterDevices(keyword: string) {
  if (!keyword) {
    filteredDeviceList.value = [...deviceList.value]
  } else {
    const kw = keyword.toLowerCase()
    filteredDeviceList.value = deviceList.value.filter(
      dev => dev.name.toLowerCase().includes(kw) || dev.id.toLowerCase().includes(kw)
    )
  }
}

// 设备变更
async function onDeviceChange() {
  await loadLogContent()
}

// 读取日志内容（silent=true 时不显示loading，用于自动刷新）
async function loadLogContent(silent = false) {
  if (!selectedDate.value || !selectedDevice.value) return

  // 手动刷新或首次加载才显示loading，自动刷新静默更新避免闪烁
  if (!silent) loadingLog.value = true
  try {
    let udpContent = ''
    let mqttContent = ''

    if (selectedProtocol.value === 'all' || selectedProtocol.value === 'udp') {
      udpContent = await window.electronAPI.readLogFile(
        selectedDate.value,
        selectedDevice.value,
        'udp'
      )
    }
    if (selectedProtocol.value === 'all' || selectedProtocol.value === 'mqtt') {
      mqttContent = await window.electronAPI.readLogFile(
        selectedDate.value,
        selectedDevice.value,
        'mqtt'
      )
    }

    // 合并并排序
    const lines: { text: string; originalIndex: number }[] = []
    if (selectedProtocol.value === 'all') {
      // 合并UDP和MQTT，按时间戳排序
      const allRawLines: { text: string }[] = []

      if (udpContent) {
        udpContent.split('\n').filter(l => l.trim()).forEach(line => {
          allRawLines.push({ text: '[UDP] ' + line })
        })
      }
      if (mqttContent) {
        mqttContent.split('\n').filter(l => l.trim()).forEach(line => {
          allRawLines.push({ text: '[MQTT] ' + line })
        })
      }

      // 按时间戳排序
      allRawLines.sort((a, b) => {
        const timeA = extractTimestamp(a.text)
        const timeB = extractTimestamp(b.text)
        return timeA.localeCompare(timeB)
      })

      allRawLines.forEach((line, idx) => {
        lines.push({ text: line.text, originalIndex: idx })
      })
    } else {
      const content = selectedProtocol.value === 'udp' ? udpContent : mqttContent
      if (content) {
        content.split('\n').filter(l => l.trim()).forEach((line, idx) => {
          lines.push({ text: line, originalIndex: idx })
        })
      }
    }

    // 自动刷新时，内容没变化就跳过DOM更新，避免闪烁
    const newText = lines.map(l => l.text).join('\n')
    const oldText = allLines.value.map(l => l.text).join('\n')
    if (newText !== oldText || !silent) {
      allLines.value = lines
      applyFilter()
    }

    await nextTick()
    // requestAnimationFrame 确保浏览器完成布局后再滚动
    requestAnimationFrame(() => {
      scrollToBottom()
    })
  } catch (err) {
    console.error('读取日志失败:', err)
  } finally {
    loadingLog.value = false
  }
}

// 提取时间戳用于排序
function extractTimestamp(line: string): string {
  const match = line.match(/\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/)
  return match ? match[1] : '99:99:99.999'
}

// 应用搜索过滤
function applyFilter() {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    filteredLines.value = [...allLines.value]
  } else {
    filteredLines.value = allLines.value.filter(line =>
      line.text.toLowerCase().includes(keyword)
    )
  }
}

// 搜索
function onSearch() {
  applyFilter()
}

// 高亮搜索关键词
function highlightLine(text: string): string {
  const keyword = searchKeyword.value.trim()
  if (!keyword) return escapeHtml(text)
  const escaped = escapeHtml(text)
  const escapedKeyword = escapeHtml(keyword)
  const regex = new RegExp(`(${escapedKeyword})`, 'gi')
  return escaped.replace(regex, '<mark class="search-highlight">$1</mark>')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 获取行样式
function getLineClass(line: { text: string }): string {
  if (line.text.startsWith('[UDP]')) return 'log-udp'
  if (line.text.startsWith('[MQTT]')) return 'log-mqtt'
  return ''
}

// 滚动到底部
function scrollToBottom() {
  if (autoScroll.value && logContentRef.value) {
    logContentRef.value.scrollTop = logContentRef.value.scrollHeight
  }
}

// 自动刷新
function onAutoRefreshToggle(val: boolean) {
  if (val) {
    refreshTimer = setInterval(() => {
      loadLogContent(true)
    }, 3000)
  } else {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }
}

// 监听协议切换
watch(selectedProtocol, () => {
  // 通过 @change 已处理
})

// 初始化
onMounted(() => {
  loadDates()
})

// 清理
onBeforeUnmount(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style scoped>
.log-view-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 80px);
  gap: 12px;
}

.filter-card {
  flex-shrink: 0;
}

.filter-card :deep(.el-card__body) {
  padding: 12px 16px;
}

.filter-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
  min-width: 36px;
}

.log-content-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.log-content-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0;
  min-height: 0;
  overflow: hidden;
}

.log-content-card :deep(.el-card__header) {
  padding: 10px 16px;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.log-title {
  font-size: 15px;
  font-weight: 600;
}

.line-count {
  font-weight: 400;
  font-size: 13px;
  color: #909399;
}

.log-content {
  flex: 1;
  padding: 8px 0;
  overflow-y: auto;
  background-color: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Consolas', 'Courier New', 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  min-height: 0;
}

.log-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #909399;
  gap: 12px;
}

.log-placeholder p {
  margin: 0;
  font-size: 14px;
}

.log-lines {
  padding: 0 12px;
}

.log-line {
  display: flex;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line:hover {
  background-color: rgba(255, 255, 255, 0.04);
}

.line-number {
  flex-shrink: 0;
  width: 48px;
  text-align: right;
  padding-right: 12px;
  color: #858585;
  user-select: none;
  font-size: 12px;
}

.line-content {
  flex: 1;
}

.log-udp .line-content {
  color: #569cd6;
}

.log-mqtt .line-content {
  color: #6a9955;
}

:deep(.search-highlight) {
  background-color: #e8a030;
  color: #000;
  padding: 0 2px;
  border-radius: 2px;
  font-weight: bold;
}

/* 滚动条样式 */
.log-content::-webkit-scrollbar {
  width: 8px;
  display: block !important;
}

.log-content::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.log-content::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.log-content::-webkit-scrollbar-thumb:hover {
  background: #777;
}

/* Element Plus loading 暗色覆盖 */
.log-content :deep(.el-loading-mask) {
  background-color: rgba(30, 30, 30, 0.8);
}

.log-content :deep(.el-loading-text) {
  color: #d4d4d4;
}
</style>
