<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { formatRuntime } from '../composables/useSignal'

interface DeviceStatus {
  deviceId: string
  clientId: string
  name: string
  uptime: number
  runtime: number
  heap_free: number
  heap_total: number
  flash_free: number
  flash_total: number
  cpu_cores: number
  cpu_freq_mhz: number
  chip_model: string
  flash_size: number
  network: string
  ip: string
  lastUpdate: number
}

interface DeviceListInfo {
  name: string
  runtime: number
  ip: string
}

const deviceMap = ref<Map<string, DeviceStatus>>(new Map())

// 来自设备列表的名称 & 运行时间映射（key: 设备号）
const deviceInfoMap = ref<Map<string, DeviceListInfo>>(new Map())

// 搜索 & 筛选
const searchText = ref('')
const networkTypeFilter = ref('')

// 排序：''=默认, 'heap_free_asc'/'heap_free_desc', 'flash_free_asc'/'flash_free_desc', 'flash_used_asc'/'flash_used_desc'
const sortType = ref('')

const sortOptions = [
  { label: '默认排序', value: '' },
  { label: '堆内存空闲  ↑（少→多）', value: 'heap_free_asc' },
  { label: '堆内存空闲  ↓（多→少）', value: 'heap_free_desc' },
  { label: 'Flash 空闲  ↑（少→多）', value: 'flash_free_asc' },
  { label: 'Flash 空闲  ↓（多→少）', value: 'flash_free_desc' },
  { label: 'Flash 已用  ↑（少→多）', value: 'flash_used_asc' },
  { label: 'Flash 已用  ↓（多→少）', value: 'flash_used_desc' },
]

const devices = computed(() => Array.from(deviceMap.value.values()))

const filteredDevices = computed(() => {
  let list = devices.value
  if (searchText.value) {
    const kw = searchText.value.toLowerCase()
    list = list.filter(d =>
        (d.deviceId && d.deviceId.toLowerCase().includes(kw)) ||
        (d.name && d.name.toLowerCase().includes(kw)) ||
        (d.clientId && d.clientId.toLowerCase().includes(kw)) ||
        (d.ip && d.ip.toLowerCase().includes(kw))
    )
  }
  if (networkTypeFilter.value) {
    list = list.filter(d => d.network === networkTypeFilter.value)
  }

  // 排序
  if (sortType.value) {
    const arr = [...list]
    switch (sortType.value) {
      case 'heap_free_asc':
        arr.sort((a, b) => a.heap_free - b.heap_free)
        break
      case 'heap_free_desc':
        arr.sort((a, b) => b.heap_free - a.heap_free)
        break
      case 'flash_free_asc':
        arr.sort((a, b) => a.flash_free - b.flash_free)
        break
      case 'flash_free_desc':
        arr.sort((a, b) => b.flash_free - a.flash_free)
        break
      case 'flash_used_asc':
        arr.sort((a, b) => (a.flash_total - a.flash_free) - (b.flash_total - b.flash_free))
        break
      case 'flash_used_desc':
        arr.sort((a, b) => (b.flash_total - b.flash_free) - (a.flash_total - a.flash_free))
        break
    }
    return arr
  }

  return list
})

// 格式化字节
const formatBytes = (bytes: number) => {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

// 计算使用率百分比
const getHeapUsage = (device: DeviceStatus) => {
  if (!device.heap_total) return 0
  return Math.round(((device.heap_total - device.heap_free) / device.heap_total) * 100)
}

const getFlashUsage = (device: DeviceStatus) => {
  if (!device.flash_total) return 0
  return Math.round(((device.flash_total - device.flash_free) / device.flash_total) * 100)
}

// 进度条颜色
const getProgressColor = (percentage: number) => {
  if (percentage < 60) return '#67c23a'
  if (percentage < 80) return '#e6a23c'
  return '#f56c6c'
}

// 网络类型图标颜色
const getNetworkColor = (type: string) => {
  const colors: Record<string, string> = {
    ETH: '#409eff', WiFi: '#67c23a', WIFI: '#67c23a', '4G': '#e6a23c', LTE: '#e6a23c'
  }
  return colors[type] || '#909399'
}

// 处理UDP消息
const handleUdpMessage = (_event: any, data: any) => {
  const { ip, parsed, raw } = data

  try {
    const payload = parsed || (typeof raw === 'string' ? JSON.parse(raw) : raw)

    // 只处理 type 为 resource 的消息
    if (!payload || payload.type !== 'resource') return

    const deviceId = payload.id || ip

    // 从设备列表查找名称和运行时间：优先按设备号匹配，其次按IP匹配
    const devInfo = deviceInfoMap.value.get(payload.id)
      || deviceInfoMap.value.get(ip)
      || deviceInfoMap.value.get(deviceId)

    const status: DeviceStatus = {
      deviceId,
      clientId: payload.clientId || '',
      name: devInfo?.name || '',
      uptime: payload.uptime || 0,
      runtime: devInfo?.runtime ?? payload.uptime ?? 0,
      heap_free: payload.heap_free || 0,
      heap_total: payload.heap_total || 0,
      flash_free: payload.flash_free || 0,
      flash_total: payload.flash_total || 0,
      cpu_cores: payload.cpu_cores || 0,
      cpu_freq_mhz: payload.cpu_freq_mhz || 0,
      chip_model: payload.chip_model || '未知',
      flash_size: payload.flash_size || 0,
      network: payload.network || '未知',
      ip: payload.ip || ip,
      lastUpdate: Date.now()
    }

    const newMap = new Map(deviceMap.value)
    newMap.set(deviceId, status)
    deviceMap.value = newMap
  } catch (e) {
    console.warn('解析设备资源消息失败:', e)
  }
}

onMounted(() => {
  window.electronAPI.onUdpMessageReceived(handleUdpMessage)

  // 监听设备列表更新，建立 设备号/ip→名称/运行时间 双键映射
  window.electronAPI.onDeviceDiscovered((list: any[]) => {
    const newMap = new Map<string, DeviceListInfo>()
    for (const dev of list) {
      if (!dev.id) continue
      const info: DeviceListInfo = {
        name: dev.name || '',
        runtime: dev.runtime || 0,
        ip: dev.ip || '',
      }
      // 同时按设备号和IP建索引，方便资源消息通过任一key匹配
      newMap.set(dev.id, info)
      if (dev.ip) {
        newMap.set(dev.ip, info)
      }
    }
    deviceInfoMap.value = newMap
  })
})

onBeforeUnmount(() => {
  window.electronAPI.removeUdpListeners()
})
</script>

<template>
  <div class="device-resource">
    <h2 class="page-title">设备资源</h2>

    <!-- 搜索栏 -->
    <div class="resource-search">
      <el-input
          v-model="searchText"
          placeholder="搜索设备号 / 名称 / IP"
          clearable
          class="search-input"
      />
      <el-radio-group v-model="networkTypeFilter" size="default">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="ETH">ETH</el-radio-button>
        <el-radio-button value="WiFi">WiFi</el-radio-button>
      </el-radio-group>
      <el-select v-model="sortType" placeholder="排序方式" class="sort-select" size="default">
        <el-option
            v-for="opt in sortOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
        />
      </el-select>
      <span class="device-count">共 {{ filteredDevices.length }} 台设备</span>
    </div>

    <div v-if="filteredDevices.length === 0" class="empty-state">
      <div class="empty-icon">📡</div>
      <p class="empty-text">{{ devices.length === 0 ? '等待设备上报资源信息...' : '没有匹配的设备' }}</p>
      <p class="empty-hint">订阅主题: /dev/status/#</p>
    </div>

    <div v-for="device in filteredDevices" :key="device.deviceId" class="device-section">
      <!-- 设备标题 -->
      <div class="device-header">
        <div class="device-title">
          <span class="chip-badge">{{ device.chip_model }}</span>
          <span v-if="device.name" class="device-name">{{ device.name }}</span>
          <span class="device-id">{{ device.deviceId }}</span>
          <span v-if="device.clientId" class="client-id">{{ device.clientId }}</span>
        </div>
        <div class="device-meta">
          <el-tag size="small" :color="getNetworkColor(device.network)" effect="dark" style="border:none;">
            {{ device.network }}
          </el-tag>
          <span class="device-ip">{{ device.ip }}</span>
        </div>
      </div>

      <!-- 统计卡片 -->
      <div class="stat-cards">
        <!-- 运行时间 -->
        <div class="stat-card uptime-card">
          <div class="stat-card-icon">⏱</div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ formatRuntime(device.runtime) }}</div>
            <div class="stat-card-label">运行时间</div>
          </div>
        </div>

        <!-- CPU -->
        <div class="stat-card cpu-card">
          <div class="stat-card-icon">🧠</div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ device.cpu_cores }} 核 @ {{ device.cpu_freq_mhz }} MHz</div>
            <div class="stat-card-label">CPU</div>
          </div>
        </div>

        <!-- 网络 -->
        <div class="stat-card network-card">
          <div class="stat-card-icon">🌐</div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ device.ip }}</div>
            <div class="stat-card-label">{{ device.network }} 网络</div>
          </div>
        </div>

        <!-- Flash 容量 -->
        <div class="stat-card flash-card">
          <div class="stat-card-icon">💾</div>
          <div class="stat-card-body">
            <div class="stat-card-value">{{ formatBytes(device.flash_total) }}</div>
            <div class="stat-card-label">Flash 总容量</div>
          </div>
        </div>
      </div>

      <!-- 内存图表区域 -->
      <div class="chart-row">
        <!-- 堆内存使用 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <span class="card-title">堆内存 (Heap)</span>
          </template>
          <div class="memory-chart">
            <el-progress
                type="dashboard"
                :percentage="getHeapUsage(device)"
                :width="120"
                :stroke-width="12"
                :color="getProgressColor(getHeapUsage(device))"
            >
              <template #default="{ percentage }">
                <div class="progress-inner">
                  <span class="progress-value">{{ percentage }}%</span>
                  <span class="progress-label">已使用</span>
                </div>
              </template>
            </el-progress>
            <div class="memory-detail">
              <div class="detail-row">
                <span class="detail-label">总量</span>
                <span class="detail-value">{{ formatBytes(device.heap_total) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">已用</span>
                <span class="detail-value used">{{ formatBytes(device.heap_total - device.heap_free) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">空闲</span>
                <span class="detail-value free">{{ formatBytes(device.heap_free) }}</span>
              </div>
            </div>
          </div>
        </el-card>

        <!-- Flash使用 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <span class="card-title">Flash 存储</span>
          </template>
          <div class="memory-chart">
            <el-progress
                type="dashboard"
                :percentage="getFlashUsage(device)"
                :width="120"
                :stroke-width="12"
                :color="getProgressColor(getFlashUsage(device))"
            >
              <template #default="{ percentage }">
                <div class="progress-inner">
                  <span class="progress-value">{{ percentage }}%</span>
                  <span class="progress-label">已使用</span>
                </div>
              </template>
            </el-progress>
            <div class="memory-detail">
              <div class="detail-row">
                <span class="detail-label">总量</span>
                <span class="detail-value">{{ formatBytes(device.flash_total) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">已用</span>
                <span class="detail-value used">{{ formatBytes(device.flash_total - device.flash_free) }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">空闲</span>
                <span class="detail-value free">{{ formatBytes(device.flash_free) }}</span>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 芯片信息 -->
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <span class="card-title">芯片信息</span>
          </template>
          <div class="chip-info">
            <div class="chip-visual">
              <div class="chip-icon">⬡</div>
              <div class="chip-name">{{ device.chip_model }}</div>
            </div>
            <div class="chip-specs">
              <div class="spec-item">
                <span class="spec-label">核心数</span>
                <span class="spec-value">{{ device.cpu_cores }} 核</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">主频</span>
                <span class="spec-value">{{ device.cpu_freq_mhz }} MHz</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">Flash</span>
                <span class="spec-value">{{ formatBytes(device.flash_total) }}</span>
              </div>
              <div class="spec-item">
                <span class="spec-label">网络</span>
                <span class="spec-value">{{ device.network }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.device-resource {
  padding: 14px;
  background: var(--page-bg);
  min-height: 100%;
}

.page-title {
  font-size: 21px;
  font-weight: 700;
  color: #333;
  margin: 0 0 14px 0;
}

/* 搜索栏 */
.resource-search {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.search-input {
  width: 260px;
}

.sort-select {
  width: 200px;
}

.resource-search :deep(.el-input__wrapper) {
  border: 1px solid #c0c4cc;
  box-shadow: 0 0 0 1px rgba(59,130,246,0.1);
  background: #fafbfc;
  border-radius: 8px;
}
.resource-search :deep(.el-input__wrapper:hover) {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59,130,246,0.15);
}
.resource-search :deep(.el-input__wrapper.is-focus) {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
}

.device-count {
  font-size: 14px;
  font-weight: 600;
  color: #606266;
  margin-left: auto;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
}

.empty-icon {
  font-size: 60px;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 18px;
  color: #606266;
  margin: 0 0 8px 0;
}

.empty-hint {
  font-size: 14px;
  color: #909399;
  margin: 0;
  font-family: 'Consolas', monospace;
  background: #f0f2f5;
  padding: 4px 12px;
  border-radius: 4px;
}

/* 设备分区 */
.device-section {
  margin-bottom: 18px;
}

.device-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 14px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}

.device-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chip-badge {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: #fff;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
}

.device-id {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  font-family: 'Consolas', monospace;
}

.device-name {
  font-size: 14px;
  font-weight: 600;
  color: #409eff;
}

.client-id {
  font-size: 13px;
  color: #909399;
  font-family: 'Consolas', monospace;
  background: #f0f2f5;
  padding: 2px 8px;
  border-radius: 4px;
}

.device-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.device-ip {
  font-size: 14px;
  color: #606266;
  font-family: 'Consolas', monospace;
}

/* 统计卡片 */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.stat-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}

.stat-card-icon {
  font-size: 22px;
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  flex-shrink: 0;
}

.uptime-card .stat-card-icon { background: #ecf5ff; }
.cpu-card .stat-card-icon { background: #f0f9eb; }
.network-card .stat-card-icon { background: #fdf6ec; }
.flash-card .stat-card-icon { background: #fef0f0; }

.stat-card-body {
  display: flex;
  flex-direction: column;
}

.stat-card-value {
  font-size: 15px;
  font-weight: 700;
  color: #333;
}

.stat-card-label {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

/* 图表行 */
.chart-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.chart-card {
  border-radius: 10px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

/* 内存圆形图表 */
.memory-chart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.progress-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.progress-value {
  font-size: 20px;
  font-weight: 700;
  color: #333;
}

.progress-label {
  font-size: 12px;
  color: #909399;
}

.memory-detail {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 6px;
}

.detail-label {
  font-size: 13px;
  color: #909399;
}

.detail-value {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  font-family: 'Consolas', monospace;
}

.detail-value.used {
  color: #e6a23c;
}

.detail-value.free {
  color: #67c23a;
}

/* 芯片信息 */
.chip-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.chip-visual {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.chip-icon {
  font-size: 36px;
  color: #667eea;
}

.chip-name {
  font-size: 14px;
  font-weight: 700;
  color: #333;
}

.chip-specs {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.spec-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 8px;
  background: #f9fafb;
  border-radius: 8px;
}

.spec-label {
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
}

.spec-value {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}
</style>

<!-- 暗夜模式适配 -->
<style>
html.dark .resource-search {
  background: #1e1e1e;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
html.dark .resource-search .el-input__wrapper {
  background: #2a2a2a !important;
  border-color: #444 !important;
  box-shadow: none !important;
}
html.dark .resource-search .el-input__wrapper:hover {
  border-color: #58a6ff !important;
}
html.dark .resource-search .el-input__wrapper.is-focus {
  border-color: #58a6ff !important;
  box-shadow: 0 0 0 2px rgba(88,166,255,0.2) !important;
}
html.dark .resource-search .el-input__inner {
  color: #e0e0e0 !important;
}
html.dark .resource-search .el-radio-button__inner {
  background: #2a2a2a !important;
  border-color: #444 !important;
  color: #a0aec0 !important;
}
html.dark .resource-search .el-radio-button__original-radio:checked + .el-radio-button__inner {
  background: rgba(88,166,255,0.2) !important;
  border-color: #58a6ff !important;
  color: #58a6ff !important;
}
html.dark .resource-search .sort-select .el-input__wrapper {
  background: #2a2a2a !important;
  border-color: #444 !important;
  box-shadow: none !important;
}
html.dark .resource-search .sort-select .el-input__wrapper:hover {
  border-color: #58a6ff !important;
}
html.dark .resource-search .sort-select .el-input__wrapper.is-focus {
  border-color: #58a6ff !important;
  box-shadow: 0 0 0 2px rgba(88,166,255,0.2) !important;
}
html.dark .resource-search .sort-select .el-input__inner {
  color: #e0e0e0 !important;
}
html.dark .device-count {
  color: #a0aec0;
}

html.dark .device-name {
  color: #58a6ff !important;
}
</style>
