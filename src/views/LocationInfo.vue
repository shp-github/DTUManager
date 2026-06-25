<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Monitor, Cpu, Connection } from '@element-plus/icons-vue'

interface NetworkInfo {
  name: string
  ip: string
  mac: string
  netmask: string
}

interface DiskInfo {
  path: string
  total: number
  used: number
  free: number
  usage: number
}

interface SystemInfo {
  hostname: string
  platform: string
  arch: string
  osType: string
  osRelease: string
  cpuModel: string
  cpuCores: number
  cpuUsage: number
  totalMemory: number
  usedMemory: number
  freeMemory: number
  memoryUsage: number
  uptime: number
  networks: NetworkInfo[]
  disks: DiskInfo[]
  nodeVersion: string
  electronVersion: string
  chromeVersion: string
}

const systemInfo = ref<SystemInfo | null>(null)
const currentTime = ref('')
const loading = ref(true)
let timer: number | null = null
let refreshTimer: number | null = null

// 格式化字节
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
}

// 格式化运行时间
const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}天`)
  if (hours > 0) parts.push(`${hours}小时`)
  if (mins > 0) parts.push(`${mins}分钟`)
  parts.push(`${secs}秒`)
  return parts.join(' ')
}

// 更新时间
const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  })
}

// 获取系统信息
const fetchSystemInfo = async () => {
  try {
    systemInfo.value = await window.electronAPI.getSystemInfo()
  } catch (e) {
    console.error('获取系统信息失败:', e)
  } finally {
    loading.value = false
  }
}

// 获取操作系统友好名称
const getOSDisplayName = (platform: string, release: string) => {
  if (platform === 'win32') {
    // Windows 10/11 根据 build 号区分：build >= 22000 为 Windows 11
    const match = release.match(/^(\d+)\.(\d+)\.(\d+)/)
    if (match) {
      const build = parseInt(match[3], 10)
      return build >= 22000 ? `Windows 11 (${release})` : `Windows 10 (${release})`
    }
    return `Windows ${release}`
  }
  const map: Record<string, string> = {
    darwin: 'macOS',
    linux: 'Linux'
  }
  return `${map[platform] || platform} ${release}`
}

onMounted(() => {
  updateTime()
  fetchSystemInfo()
  timer = window.setInterval(updateTime, 1000)
  refreshTimer = window.setInterval(fetchSystemInfo, 3000) // 每3秒刷新
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="location-info" v-loading="loading">
    <h2 class="page-title">本地信息</h2>

    <div class="info-grid" v-if="systemInfo">
      <!-- 系统信息卡片 -->
      <el-card class="info-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Monitor /></el-icon>
            <span>系统信息</span>
          </div>
        </template>
        <div class="info-list">
          <div class="info-item">
            <span class="label">主机名</span>
            <span class="value">{{ systemInfo.hostname }}</span>
          </div>
          <div class="info-item">
            <span class="label">操作系统</span>
            <span class="value">{{ getOSDisplayName(systemInfo.platform, systemInfo.osRelease) }}</span>
          </div>
          <div class="info-item">
            <span class="label">架构</span>
            <span class="value">{{ systemInfo.arch }}</span>
          </div>
          <div class="info-item">
            <span class="label">系统运行时间</span>
            <span class="value">{{ formatUptime(systemInfo.uptime) }}</span>
          </div>
          <div class="info-item">
            <span class="label">当前时间</span>
            <span class="value time-value">{{ currentTime }}</span>
          </div>
        </div>
      </el-card>

      <!-- CPU 信息卡片 -->
      <el-card class="info-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Cpu /></el-icon>
            <span>CPU 信息</span>
          </div>
        </template>
        <div class="info-list">
          <div class="info-item">
            <span class="label">型号</span>
            <span class="value cpu-model">{{ systemInfo.cpuModel }}</span>
          </div>
          <div class="info-item">
            <span class="label">核心数</span>
            <span class="value">{{ systemInfo.cpuCores }} 核</span>
          </div>
          <div class="info-item">
            <span class="label">使用率 ({{ systemInfo.cpuUsage }}%)</span>
            <div class="value progress-value">
              <el-progress :percentage="Number(systemInfo.cpuUsage)" :stroke-width="16" :text-inside="true"
                :color="systemInfo.cpuUsage > 80 ? '#f56c6c' : systemInfo.cpuUsage > 50 ? '#e6a23c' : '#67c23a'" />
            </div>
          </div>
        </div>
      </el-card>

      <!-- 内存信息卡片 -->
      <el-card class="info-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Monitor /></el-icon>
            <span>内存信息</span>
          </div>
        </template>
        <div class="info-list">
          <div class="info-item">
            <span class="label">总内存 ({{ formatBytes(systemInfo.totalMemory) }})</span>
            <div class="value progress-value">
              <el-progress :percentage="100" :stroke-width="16" :text-inside="true" color="#409eff" />
            </div>
          </div>
          <div class="info-item">
            <span class="label">已使用 ({{ formatBytes(systemInfo.usedMemory) }})</span>
            <div class="value progress-value">
              <el-progress :percentage="Number(systemInfo.memoryUsage)" :stroke-width="16" :text-inside="true"
                :color="systemInfo.memoryUsage > 80 ? '#f56c6c' : systemInfo.memoryUsage > 50 ? '#e6a23c' : '#67c23a'" />
            </div>
          </div>
          <div class="info-item">
            <span class="label">可用 ({{ formatBytes(systemInfo.freeMemory) }})</span>
            <div class="value progress-value">
              <el-progress :percentage="Number((100 - systemInfo.memoryUsage).toFixed(1))" :stroke-width="16" :text-inside="true" color="#67c23a" />
            </div>
          </div>
        </div>
      </el-card>

      <!-- 磁盘信息卡片 -->
      <el-card class="info-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Monitor /></el-icon>
            <span>磁盘信息</span>
          </div>
        </template>
        <div class="info-list">
          <div class="info-item" v-for="disk in systemInfo.disks" :key="disk.path">
            <span class="label">{{ disk.path }} ({{ formatBytes(disk.total) }})</span>
            <div class="value progress-value">
              <el-progress :percentage="disk.usage" :stroke-width="16" :text-inside="true"
                :color="disk.usage > 80 ? '#f56c6c' : disk.usage > 50 ? '#e6a23c' : '#67c23a'" />
            </div>
          </div>
        </div>
      </el-card>

      <!-- 网络信息卡片 -->
      <el-card class="info-card network-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Connection /></el-icon>
            <span>网络接口</span>
          </div>
        </template>
        <el-table :data="systemInfo.networks" stripe size="small" style="width: 100%">
          <el-table-column prop="name" label="接口名称" min-width="120" />
          <el-table-column prop="ip" label="IP 地址" min-width="130" />
          <el-table-column prop="mac" label="MAC 地址" min-width="150" />
          <el-table-column prop="netmask" label="子网掩码" min-width="130" />
        </el-table>
      </el-card>

    </div>
  </div>
</template>

<style scoped>
.location-info {
  padding: 16px 20px;
  background: var(--page-bg);
  min-height: 100%;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #333;
  margin: 0 0 16px 0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-card {
  border-radius: 8px;
}

.info-card :deep(.el-card__body) {
  padding: 14px 18px;
}

.network-card {
  grid-column: 1 / -1;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.info-item .label {
  color: #606266;
  font-size: 14px;
  flex-shrink: 0;
}

.info-item .value {
  color: #333;
  font-size: 14px;
  font-weight: 500;
  text-align: right;
  flex: 1;
  margin-left: 16px;
}

.cpu-model {
  font-size: 12px !important;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-value {
  font-family: 'Consolas', monospace;
  color: #409eff;
}

.info-item .value :deep(.el-progress) {
  width: 100%;
  max-width: 180px;
}

.info-item .progress-value {
  display: flex;
  justify-content: flex-end;
  flex: 1;
  margin-left: 16px;
}

.info-item .progress-value :deep(.el-progress) {
  width: 180px;
  min-width: 180px;
}

.info-item .progress-value :deep(.el-progress-bar__innerText) {
  font-size: 12px !important;
}

.info-item .progress-value :deep(.el-progress-bar) {
  display: block;
}

.info-item .progress-value :deep(.el-progress-bar__outer) {
  display: block;
}

/* 网络表格字体 */
.network-card :deep(.el-table) {
  font-size: 13px;
}
.network-card :deep(.el-table th) {
  font-size: 13px;
}
</style>
