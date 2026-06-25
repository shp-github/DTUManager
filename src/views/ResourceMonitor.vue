<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

interface DeviceInfo {
  id: string
  name: string
  mac: string
  ip: string
  networkType: string
  RSSI: number | null
  runtime: number
  firmware: string
  heart_interval: number
}

const devices = ref<DeviceInfo[]>([])
let listener: any = null

// 格式化运行时间
const formatRuntime = (seconds: number) => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${mins}分`
  return `${mins}分钟`
}

// 统计数据
const totalDevices = computed(() => devices.value.length)

const networkTypeStats = computed(() => {
  const map: Record<string, number> = {}
  devices.value.forEach(d => {
    const type = d.networkType || '未知'
    map[type] = (map[type] || 0) + 1
  })
  return Object.entries(map).map(([name, count]) => ({ name, count }))
})

const firmwareStats = computed(() => {
  const map: Record<string, number> = {}
  devices.value.forEach(d => {
    const fw = d.firmware || '未知'
    map[fw] = (map[fw] || 0) + 1
  })
  return Object.entries(map).map(([name, count]) => ({ name, count }))
})

const avgRuntime = computed(() => {
  if (devices.value.length === 0) return 0
  const total = devices.value.reduce((sum, d) => sum + (d.runtime || 0), 0)
  return Math.floor(total / devices.value.length)
})

const maxRuntime = computed(() => {
  if (devices.value.length === 0) return 0
  return Math.max(...devices.value.map(d => d.runtime || 0))
})

const avgHeartbeat = computed(() => {
  if (devices.value.length === 0) return 0
  const total = devices.value.reduce((sum, d) => sum + (d.heart_interval || 0), 0)
  return Math.floor(total / devices.value.length)
})

// 信号强度分布
const signalDistribution = computed(() => {
  const levels = { '强 (>-50)': 0, '中 (-50~-70)': 0, '弱 (<-70)': 0, '无信号': 0 }
  devices.value.forEach(d => {
    if (d.RSSI === null || d.RSSI === 0) levels['无信号']++
    else if (d.RSSI > -50) levels['强 (>-50)']++
    else if (d.RSSI > -70) levels['中 (-50~-70)']++
    else levels['弱 (<-70)']++
  })
  return Object.entries(levels).filter(([, v]) => v > 0).map(([name, count]) => ({ name, count }))
})

// 网络类型颜色
const getNetworkColor = (type: string) => {
  const colors: Record<string, string> = {
    ETH: '#409eff', WiFi: '#67c23a', WIFI: '#67c23a', '4G': '#e6a23c', LTE: '#e6a23c', '未知': '#909399'
  }
  return colors[type] || '#909399'
}

// 信号颜色
const getSignalColor = (rssi: number | null) => {
  if (rssi === null || rssi === 0) return '#909399'
  if (rssi > -50) return '#67c23a'
  if (rssi > -70) return '#e6a23c'
  return '#f56c6c'
}

// 运行时间百分比（相对最大值）
const getRuntimePercent = (runtime: number) => {
  if (maxRuntime.value === 0) return 0
  return Math.min((runtime / maxRuntime.value) * 100, 100)
}

onMounted(() => {
  window.electronAPI.onDeviceDiscovered((list: any[]) => {
    devices.value = [...list]
  })
})

onBeforeUnmount(() => {
  // 清理（如有需要）
})
</script>

<template>
  <div class="resource-monitor">
    <h2 class="page-title">资源监控</h2>

    <!-- 顶部统计卡片 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-icon" style="background: #ecf5ff; color: #409eff;">
          <span class="icon-text">📡</span>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ totalDevices }}</div>
          <div class="stat-label">在线设备</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: #f0f9eb; color: #67c23a;">
          <span class="icon-text">⏱</span>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ formatRuntime(avgRuntime) }}</div>
          <div class="stat-label">平均运行时间</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: #fdf6ec; color: #e6a23c;">
          <span class="icon-text">💓</span>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ avgHeartbeat }}s</div>
          <div class="stat-label">平均心跳间隔</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background: #fef0f0; color: #f56c6c;">
          <span class="icon-text">🔧</span>
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ firmwareStats.length }}</div>
          <div class="stat-label">固件版本数</div>
        </div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="chart-row">
      <!-- 网络类型分布 -->
      <el-card class="chart-card" shadow="hover">
        <template #header>
          <span class="card-title">网络类型分布</span>
        </template>
        <div class="bar-chart">
          <div v-for="item in networkTypeStats" :key="item.name" class="bar-item">
            <div class="bar-label">{{ item.name }}</div>
            <div class="bar-track">
              <div class="bar-fill" :style="{
                width: totalDevices ? (item.count / totalDevices * 100) + '%' : '0%',
                background: getNetworkColor(item.name)
              }"></div>
            </div>
            <div class="bar-value">{{ item.count }}</div>
          </div>
          <div v-if="networkTypeStats.length === 0" class="empty-chart">暂无设备数据</div>
        </div>
      </el-card>

      <!-- 固件版本分布 -->
      <el-card class="chart-card" shadow="hover">
        <template #header>
          <span class="card-title">固件版本分布</span>
        </template>
        <div class="bar-chart">
          <div v-for="item in firmwareStats" :key="item.name" class="bar-item">
            <div class="bar-label">{{ item.name }}</div>
            <div class="bar-track">
              <div class="bar-fill" :style="{
                width: totalDevices ? (item.count / totalDevices * 100) + '%' : '0%',
                background: '#409eff'
              }"></div>
            </div>
            <div class="bar-value">{{ item.count }}</div>
          </div>
          <div v-if="firmwareStats.length === 0" class="empty-chart">暂无设备数据</div>
        </div>
      </el-card>

      <!-- 信号强度分布 -->
      <el-card class="chart-card" shadow="hover">
        <template #header>
          <span class="card-title">信号强度分布</span>
        </template>
        <div class="bar-chart">
          <div v-for="item in signalDistribution" :key="item.name" class="bar-item">
            <div class="bar-label">{{ item.name }}</div>
            <div class="bar-track">
              <div class="bar-fill" :style="{
                width: totalDevices ? (item.count / totalDevices * 100) + '%' : '0%',
                background: '#67c23a'
              }"></div>
            </div>
            <div class="bar-value">{{ item.count }}</div>
          </div>
          <div v-if="signalDistribution.length === 0" class="empty-chart">暂无设备数据</div>
        </div>
      </el-card>
    </div>

    <!-- 设备详情列表 -->
    <el-card class="device-list-card" shadow="hover">
      <template #header>
        <span class="card-title">设备运行状态</span>
      </template>
      <div class="device-grid" v-if="devices.length > 0">
        <div v-for="device in devices" :key="device.id" class="device-tile">
          <div class="tile-header">
            <span class="device-name">{{ device.name || device.id }}</span>
            <el-tag size="small" :color="getNetworkColor(device.networkType)" effect="dark" style="border: none;">
              {{ device.networkType }}
            </el-tag>
          </div>
          <div class="tile-body">
            <div class="tile-row">
              <span class="tile-label">ID</span>
              <span class="tile-value mono">{{ device.id }}</span>
            </div>
            <div class="tile-row">
              <span class="tile-label">IP</span>
              <span class="tile-value mono">{{ device.ip }}</span>
            </div>
            <div class="tile-row">
              <span class="tile-label">固件</span>
              <span class="tile-value">{{ device.firmware }}</span>
            </div>
            <div class="tile-row">
              <span class="tile-label">运行时间</span>
              <span class="tile-value">{{ formatRuntime(device.runtime) }}</span>
            </div>
            <div class="tile-row">
              <span class="tile-label">运行进度</span>
              <el-progress
                :percentage="getRuntimePercent(device.runtime)"
                :stroke-width="10"
                :show-text="false"
                :color="'#409eff'"
              />
            </div>
            <div class="tile-row">
              <span class="tile-label">信号</span>
              <span class="tile-value" :style="{ color: getSignalColor(device.RSSI) }">
                {{ device.RSSI === 0 || device.RSSI === null ? 'N/A' : device.RSSI + ' dBm' }}
              </span>
            </div>
            <div class="tile-row">
              <span class="tile-label">心跳</span>
              <span class="tile-value">{{ device.heart_interval }}s</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-chart" style="padding: 40px;">暂无在线设备，等待设备上报...</div>
    </el-card>
  </div>
</template>

<style scoped>
.resource-monitor {
  padding: 20px;
  background: var(--page-bg);
  min-height: 100%;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #333;
  margin: 0 0 20px 0;
}

/* 统计卡片 */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: #fff;
  border-radius: 10px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transition: transform 0.2s, box-shadow 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}

.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-text {
  font-size: 24px;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #333;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

/* 图表区域 */
.chart-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.chart-card {
  border-radius: 10px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.bar-chart {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bar-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.bar-label {
  width: 80px;
  font-size: 13px;
  color: #606266;
  flex-shrink: 0;
  text-align: right;
}

.bar-track {
  flex: 1;
  height: 20px;
  background: #f0f2f5;
  border-radius: 10px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.5s ease;
  min-width: 4px;
}

.bar-value {
  width: 30px;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  text-align: center;
}

.empty-chart {
  text-align: center;
  color: #c0c4cc;
  font-size: 14px;
  padding: 20px;
}

/* 设备方块列表 */
.device-list-card {
  border-radius: 10px;
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.device-tile {
  background: #f9fafb;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  padding: 16px;
  transition: box-shadow 0.2s, transform 0.2s;
}

.device-tile:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  transform: translateY(-2px);
}

.tile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #ebeef5;
}

.device-name {
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.tile-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tile-label {
  font-size: 12px;
  color: #909399;
}

.tile-value {
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.mono {
  font-family: 'Consolas', monospace;
  font-size: 12px;
}

.tile-row :deep(.el-progress) {
  flex: 1;
  margin-left: 8px;
}
</style>
