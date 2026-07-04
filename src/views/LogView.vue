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

    <!-- Ctrl+F 搜索栏（参考串口工具） -->
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
              :class="[getLineClass(line), { 'log-line-active': currentMatchLineIdx === idx }]"
              :data-log-idx="idx"
            >
              <span v-if="showLineNumbers" class="line-number">{{ line.originalIndex + 1 }}</span>
              <span class="line-content" v-html="highlightLine(line.text, idx)"></span>
            </div>
          </div>
        </template>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
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

// ========== Ctrl+F 搜索 ==========
const searchVisible = ref(false)
const searchQuery = ref('')
const currentMatchIndex = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)

// 搜索匹配的行索引列表（在 filteredLines 中的索引）
const searchMatches = computed(() => {
  if (!searchQuery.value.trim()) return [] as number[]
  const query = searchQuery.value.toLowerCase()
  return filteredLines.value
    .map((line, idx) => line.text.toLowerCase().includes(query) ? idx : -1)
    .filter(i => i !== -1)
})

// 当前匹配行在 filteredLines 中的索引
const currentMatchLineIdx = computed(() => {
  if (searchMatches.value.length === 0) return -1
  return searchMatches.value[currentMatchIndex.value] ?? -1
})

// 搜索条件变化时重置索引
watch(searchQuery, () => { currentMatchIndex.value = 0 })

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

// 高亮搜索关键词（过滤词 + Ctrl+F 搜索词）
function highlightLine(text: string, lineIdx: number): string {
  let html = escapeHtml(text)

  // 高亮过滤关键词（橙色）
  const filterKw = searchKeyword.value.trim()
  if (filterKw) {
    const escapedKw = escapeHtml(filterKw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    html = html.replace(new RegExp(`(${escapedKw})`, 'gi'), '<mark class="search-highlight">$1</mark>')
  }

  // 高亮 Ctrl+F 搜索词
  const ctrlFKw = searchQuery.value.trim()
  if (ctrlFKw) {
    const isActiveLine = currentMatchLineIdx.value === lineIdx
    const cls = isActiveLine ? 'search-highlight-current' : 'search-highlight-ctrlf'
    const escapedCk = escapeHtml(ctrlFKw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    html = html.replace(new RegExp(`(${escapedCk})`, 'gi'), `<mark class="${cls}">$1</mark>`)
  }

  return html
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

// ========== Ctrl+F 搜索方法 ==========
function openSearch() {
  searchVisible.value = true
  nextTick(() => { searchInputRef.value?.focus() })
}

function closeSearch() {
  searchVisible.value = false
  searchQuery.value = ''
  currentMatchIndex.value = 0
}

function scrollToCurrentMatch() {
  if (searchMatches.value.length === 0) return
  const idx = currentMatchLineIdx.value
  if (idx >= 0) {
    nextTick(() => {
      const el = document.querySelector(`[data-log-idx="${idx}"]`)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
  }
}

function prevMatch() {
  if (searchMatches.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value - 1 + searchMatches.value.length) % searchMatches.value.length
  scrollToCurrentMatch()
}

function nextMatch() {
  if (searchMatches.value.length === 0) return
  currentMatchIndex.value = (currentMatchIndex.value + 1) % searchMatches.value.length
  scrollToCurrentMatch()
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    openSearch()
    return
  }
  if (e.key === 'Escape' && searchVisible.value && document.activeElement === searchInputRef.value) {
    closeSearch()
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
  window.addEventListener('keydown', onKeydown)
})

// 清理
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
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

/* 搜索高亮 */
:deep(.search-highlight) {
  background-color: #e8a030;
  color: #000;
  padding: 0 2px;
  border-radius: 2px;
  font-weight: bold;
}

/* Ctrl+F 搜索匹配高亮 */
:deep(.search-highlight-ctrlf) {
  background: rgba(255, 204, 0, 0.4);
  color: #fff;
  border-radius: 2px;
  padding: 0 1px;
}

/* 当前激活匹配高亮 */
:deep(.search-highlight-current) {
  background: rgba(255, 152, 0, 0.65);
  color: #fff;
  border-radius: 2px;
  padding: 0 1px;
}

/* 当前匹配行高亮 */
.log-line-active {
  background-color: rgba(255, 255, 255, 0.06);
  border-left: 2px solid #409eff;
  padding-left: 10px;
}

/* ========== 搜索栏（Ctrl+F） ========== */
.search-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #252526;
  border: 1px solid #333;
  border-top: none;
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
  background: #1e1e1e;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 3px 8px;
  gap: 6px;
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
  font-family: inherit;
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
