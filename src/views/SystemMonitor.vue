<template>
  <div class="system-monitor">
    <el-tabs v-model="activeTab" type="border-card" class="monitor-tabs">
      <!-- ============================================================ -->
      <!-- Tab 1: 监控面板                                                  -->
      <!-- ============================================================ -->
      <el-tab-pane name="dashboard">
        <template #label>
          <span class="tab-label">
            <el-icon :size="16"><Odometer /></el-icon>
            <span>监控面板</span>
          </span>
        </template>

        <div class="dashboard" v-loading="loading">
          <template v-if="systemInfo">

            <!-- 共享 SVG 渐变定义 -->
            <svg style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
              <defs>
                <linearGradient id="gpu-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#00f5ff" />
                  <stop offset="30%" stop-color="#6366f1" />
                  <stop offset="60%" stop-color="#a855f7" />
                  <stop offset="100%" stop-color="#f472b6" />
                </linearGradient>
                <linearGradient id="cpu-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#22c55e" />
                  <stop offset="30%" stop-color="#eab308" />
                  <stop offset="65%" stop-color="#f97316" />
                  <stop offset="100%" stop-color="#ef4444" />
                </linearGradient>
              </defs>
            </svg>

            <!-- ========================================== -->
            <!-- 第一行：3列布局  GPU | CPU | 内存+磁盘     -->
            <!-- ========================================== -->
            <div class="grid-top">
              <!-- 第1列：GPU 圆形仪表 -->
              <div class="card gauge-card">
                <div class="card-title">
                  <el-icon :size="22"><Odometer /></el-icon>
                  <span>GPU</span>
                </div>
                <div class="gauge-wrap gauge-lg">
                  <svg viewBox="0 0 260 260" class="gauge-svg">
                    <circle cx="130" cy="130" r="95" fill="none" class="gauge-bg" />
                    <circle cx="130" cy="130" r="95" fill="none" class="gauge-ticks-ring" />
                    <circle cx="130" cy="130" r="95" fill="none"
                      stroke="url(#gpu-grad)" stroke-width="14" stroke-linecap="round"
                      :stroke-dasharray="gpuDasharray"
                      transform="rotate(-90 130 130)"
                      class="gauge-arc" />
                  </svg>
                  <div class="gauge-inner">
                    <span class="gauge-pct gauge-pct-lg gauge-pct-gpu">{{ systemInfo.gpuUsage || 0 }}%</span>
                  </div>
                </div>
                <div class="gauge-model-text">{{ systemInfo.gpuModel || 'N/A' }}</div>
              </div>

              <!-- 第2列：CPU 圆形仪表 -->
              <div class="card gauge-card">
                <div class="card-title">
                  <el-icon :size="22"><Cpu /></el-icon>
                  <span>CPU</span>
                </div>
                <div class="gauge-wrap gauge-lg">
                  <svg viewBox="0 0 260 260" class="gauge-svg">
                    <circle cx="130" cy="130" r="95" fill="none" class="gauge-bg" />
                    <circle cx="130" cy="130" r="95" fill="none" class="gauge-ticks-ring" />
                    <circle cx="130" cy="130" r="95" fill="none"
                      stroke="url(#cpu-grad)" stroke-width="14" stroke-linecap="round"
                      :stroke-dasharray="cpuGaugeDasharray"
                      transform="rotate(-90 130 130)"
                      class="gauge-arc" />
                  </svg>
                  <div class="gauge-inner">
                    <span class="gauge-pct gauge-pct-lg gauge-pct-cpu">{{ Math.round(systemInfo.cpuUsage) }}%</span>
                    <span class="gauge-sub">{{ systemInfo.cpuCores }} 核</span>
                  </div>
                </div>
                <div class="sub-text model-text" style="text-align:center; margin-top:10px;">{{ systemInfo.cpuModel }}</div>
              </div>

              <!-- 第3列：内存 + 磁盘（纵向堆叠） -->
              <div class="stack-col">
                <div class="card">
                  <div class="card-title">
                    <el-icon :size="18"><Monitor /></el-icon>
                    <span>内存</span>
                  </div>
                  <div class="big-number" :style="{ color: memCardColor }">
                    {{ Math.round(systemInfo.memoryUsage) }}<span class="unit">%</span>
                  </div>
                  <div class="sub-text">已用 {{ formatBytes(systemInfo.usedMemory) }} / 总计 {{ formatBytes(systemInfo.totalMemory) }}</div>
                  <div class="progress-bar">
                    <div class="fill" :class="memBarClass" :style="{ width: systemInfo.memoryUsage + '%' }"></div>
                  </div>
                  <div class="card-meta">
                    <span>已用 {{ formatBytes(systemInfo.usedMemory) }}</span>
                    <span>可用 {{ formatBytes(systemInfo.freeMemory) }}</span>
                  </div>
                </div>

                <div class="card">
                  <div class="card-title">
                    <el-icon :size="18"><FolderOpened /></el-icon>
                    <span>磁盘</span>
                  </div>
                  <div class="big-number" :style="{ color: diskCardColor }">
                    {{ diskTotalUsage }}<span class="unit">%</span>
                  </div>
                  <div class="sub-text">{{ systemInfo.disks?.length || 0 }} 个分区 · {{ formatBytes(totalDiskUsed) }} / {{ formatBytes(totalDiskSize) }}</div>
                  <div class="progress-bar">
                    <div class="fill" :class="diskBarClass" :style="{ width: diskTotalUsage + '%' }"></div>
                  </div>
                  <div class="disk-list" v-if="systemInfo.disks?.length">
                    <div v-for="d in systemInfo.disks" :key="d.path" class="disk-row">
                      <span>{{ d.path }}</span>
                      <span>{{ d.usage }}%</span>
                      <div class="mini-bar"><div class="mini-fill" :style="{ width: d.usage + '%' }"></div></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 第二行：磁盘IO  + 网络IO                     -->
            <!-- ========================================== -->
            <div class="grid-io">
              <!-- 磁盘 IO -->
              <div class="card">
                <div class="card-title">
                  <el-icon :size="18"><FolderOpened /></el-icon>
                  <span>磁盘 IO</span>
                </div>
                <div class="net-chart-wrap" v-if="diskHistory.length >= 2">
                  <div class="net-legend">
                    <span class="net-lgd io-lgd-read"><i></i>读</span>
                    <span class="net-lgd io-lgd-write"><i></i>写</span>
                  </div>
                  <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="net-chart-svg" preserveAspectRatio="none">
                    <polyline :points="diskChartPointsRead" fill="none" stroke="#22c55e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    <polyline :points="diskChartPointsWrite" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
                <div v-else class="sub-text" style="text-align:center; padding: 12px 0;">采集数据中…</div>
                <div v-if="systemInfo.diskRate?.length" class="net-now">
                  <template v-for="dio in systemInfo.diskRate" :key="dio.name">
                    <span class="nio-label" style="color:#22c55e">读 {{ formatSpeed(dio.readSpeed) }}</span>
                    <span class="nio-sep">|</span>
                    <span class="nio-label" style="color:#ef4444">写 {{ formatSpeed(dio.writeSpeed) }}</span>
                  </template>
                </div>
              </div>

              <!-- 网络 IO -->
              <div class="card">
                <div class="card-title">
                  <el-icon :size="18"><Connection /></el-icon>
                  <span>网络 IO</span>
                </div>
                <!-- 折线图 -->
                <div class="net-chart-wrap" v-if="netHistory.length >= 2">
                  <div class="net-legend">
                    <span class="net-lgd net-lgd-dl"><i></i>下载</span>
                    <span class="net-lgd net-lgd-ul"><i></i>上传</span>
                  </div>
                  <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="net-chart-svg" preserveAspectRatio="none">
                    <polyline :points="netChartPointsRx" fill="none" stroke="#3b82f6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                    <polyline :points="netChartPointsTx" fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
                <div v-else class="sub-text" style="text-align:center; padding: 12px 0;">采集数据中…</div>
                <!-- 当前速率 -->
                <div v-if="systemInfo.networkRate?.length" class="net-now">
                  <template v-for="nio in systemInfo.networkRate" :key="nio.name">
                    <span class="nio-label io-down">↓ {{ formatSpeed(nio.rxSpeed) }}</span>
                    <span class="nio-sep">|</span>
                    <span class="nio-label io-up">↑ {{ formatSpeed(nio.txSpeed) }}</span>
                  </template>
                </div>
              </div>
            </div>

            <!-- ========================================== -->
            <!-- 网络（全宽）                                -->
            <!-- ========================================== -->
            <div class="card full-width">
              <div class="card-title">
                <el-icon :size="18"><Connection /></el-icon>
                <span>网络</span>
              </div>
              <div class="network-grid" v-if="systemInfo.networks?.length">
                <div v-for="net in systemInfo.networks" :key="net.name" class="network-item">
                  <span class="net-label">{{ net.name }}</span>
                  <span class="net-value">{{ net.ip }}</span>
                  <span class="net-mac">{{ net.mac }}</span>
                </div>
              </div>
              <div v-else class="sub-text">无活动网络接口</div>
            </div>

            <!-- ========================================== -->
            <!-- 系统信息（全宽）                            -->
            <!-- ========================================== -->
            <div class="card full-width">
              <div class="card-title">
                <el-icon :size="18"><Setting /></el-icon>
                <span>系统信息</span>
              </div>
              <div class="inline-stats">
                <div class="stat-item">
                  <div class="stat-label">操作系统</div>
                  <div class="stat-value">{{ getOSDisplayName(systemInfo.platform, systemInfo.osRelease) }}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label">架构</div>
                  <div class="stat-value">{{ systemInfo.arch }}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label">Node.js</div>
                  <div class="stat-value">{{ systemInfo.nodeVersion }}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label">Electron</div>
                  <div class="stat-value">{{ systemInfo.electronVersion }}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label">Chrome</div>
                  <div class="stat-value">{{ systemInfo.chromeVersion }}</div>
                </div>
                <div class="stat-item">
                  <div class="stat-label">当前时间</div>
                  <div class="stat-value">{{ currentTime }}</div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </el-tab-pane>

      <!-- ============================================================ -->
      <!-- Tab 2: 本地信息                                                  -->
      <!-- ============================================================ -->
      <el-tab-pane name="info">
        <template #label>
          <span class="tab-label">
            <el-icon :size="16"><InfoFilled /></el-icon>
            <span>本地信息</span>
          </span>
        </template>

        <div class="detail-view" v-loading="loading2" v-if="systemInfo">
          <div class="stat-row">
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(64,158,255,0.15); color: #409eff;"><el-icon :size="26"><Cpu /></el-icon></div>
              <div class="stat-body">
                <div class="stat-val">{{ Math.round(systemInfo.cpuUsage) }}%</div>
                <div class="stat-lbl">CPU 使用率</div>
                <div class="stat-sub">{{ systemInfo.cpuCores }} 核 · {{ systemInfo.cpuModel?.slice(0, 20) }}...</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(103,194,58,0.15); color: #67c23a;"><el-icon :size="26"><Monitor /></el-icon></div>
              <div class="stat-body">
                <div class="stat-val">{{ Math.round(systemInfo.memoryUsage) }}%</div>
                <div class="stat-lbl">内存使用率</div>
                <div class="stat-sub">{{ formatBytes(systemInfo.usedMemory) }} / {{ formatBytes(systemInfo.totalMemory) }}</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(230,162,60,0.15); color: #e6a23c;"><el-icon :size="26"><FolderOpened /></el-icon></div>
              <div class="stat-body">
                <div class="stat-val">{{ diskTotalUsage }}%</div>
                <div class="stat-lbl">磁盘使用率</div>
                <div class="stat-sub">{{ systemInfo.disks?.length || 0 }} 个分区</div>
              </div>
            </div>
            <div class="stat-card">
              <div class="stat-icon" style="background: rgba(139,92,246,0.15); color: #8b5cf6;"><el-icon :size="26"><Timer /></el-icon></div>
              <div class="stat-body">
                <div class="stat-val">{{ formatUptimeShort(systemInfo.uptime) }}</div>
                <div class="stat-lbl">运行时间</div>
                <div class="stat-sub">{{ currentTime }}</div>
              </div>
            </div>
          </div>

          <div class="progress-row">
            <div class="prog-card">
              <div class="prog-head"><el-icon :size="16"><Cpu /></el-icon><span>CPU</span><span class="prog-pct">{{ Math.round(systemInfo.cpuUsage) }}%</span></div>
              <el-progress :percentage="Math.round(systemInfo.cpuUsage)" :stroke-width="12" :color="cpuColor" />
              <div class="prog-detail">{{ systemInfo.cpuModel }}</div>
            </div>
            <div class="prog-card">
              <div class="prog-head"><el-icon :size="16"><Monitor /></el-icon><span>内存</span><span class="prog-pct">{{ Math.round(systemInfo.memoryUsage) }}%</span></div>
              <el-progress :percentage="Math.round(systemInfo.memoryUsage)" :stroke-width="12" :color="memoryColor" />
              <div class="prog-detail">已用 {{ formatBytes(systemInfo.usedMemory) }} · 可用 {{ formatBytes(systemInfo.freeMemory) }}</div>
            </div>
            <div class="prog-card">
              <div class="prog-head"><el-icon :size="16"><FolderOpened /></el-icon><span>磁盘</span><span class="prog-pct">{{ diskTotalUsage }}%</span></div>
              <el-progress :percentage="diskTotalUsage" :stroke-width="12" :color="diskColor" />
              <div class="prog-detail">已用 {{ formatBytes(totalDiskUsed) }} · 总容量 {{ formatBytes(totalDiskSize) }}</div>
            </div>
          </div>

          <div class="bottom-row">
            <el-card class="det-card" shadow="hover">
              <template #header><div class="det-card-head"><el-icon :size="16"><Setting /></el-icon><span>系统信息</span></div></template>
              <div class="det-list">
                <div class="det-item"><el-icon :size="14"><Monitor /></el-icon><span class="det-l">主机名</span><span class="det-v">{{ systemInfo.hostname }}</span></div>
                <div class="det-item"><el-icon :size="14"><Connection /></el-icon><span class="det-l">操作系统</span><span class="det-v">{{ getOSDisplayName(systemInfo.platform, systemInfo.osRelease) }}</span></div>
                <div class="det-item"><el-icon :size="14"><Cpu /></el-icon><span class="det-l">架构</span><span class="det-v">{{ systemInfo.arch }}</span></div>
                <div class="det-item"><el-icon :size="14"><DataAnalysis /></el-icon><span class="det-l">Node.js</span><span class="det-v">{{ systemInfo.nodeVersion }}</span></div>
                <div class="det-item"><el-icon :size="14"><Odometer /></el-icon><span class="det-l">Electron</span><span class="det-v">{{ systemInfo.electronVersion }}</span></div>
                <div class="det-item"><el-icon :size="14"><TrendCharts /></el-icon><span class="det-l">Chrome</span><span class="det-v">{{ systemInfo.chromeVersion }}</span></div>
              </div>
            </el-card>
            <el-card class="det-card" shadow="hover">
              <template #header><div class="det-card-head"><el-icon :size="16"><FolderOpened /></el-icon><span>磁盘分区</span></div></template>
              <div class="det-list">
                <div v-for="d in systemInfo.disks" :key="d.path" class="det-item">
                  <el-icon :size="14"><FolderOpened /></el-icon><span class="det-l">{{ d.path }}</span>
                  <span class="det-v">{{ formatBytes(d.used) }} / {{ formatBytes(d.total) }}</span>
                  <el-progress :percentage="d.usage" :stroke-width="6" style="width:80px;flex-shrink:0"
                    :color="d.usage>80?'#f56c6c':d.usage>50?'#e6a23c':'#67c23a'" />
                </div>
              </div>
            </el-card>
            <el-card class="det-card net-card" shadow="hover">
              <template #header><div class="det-card-head"><el-icon :size="16"><Connection /></el-icon><span>网络接口</span></div></template>
              <el-table :data="systemInfo.networks" stripe size="small" style="width:100%">
                <el-table-column prop="name" label="接口" min-width="100" />
                <el-table-column prop="ip" label="IP 地址" min-width="130" />
                <el-table-column prop="mac" label="MAC 地址" min-width="150" />
                <el-table-column prop="netmask" label="子网掩码" min-width="130" />
              </el-table>
            </el-card>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  TrendCharts, Cpu, Monitor, Timer, Connection,
  Setting, DataAnalysis, Odometer, FolderOpened, InfoFilled
} from '@element-plus/icons-vue'

const activeTab = ref('dashboard')

interface NetworkInfo { name: string; ip: string; mac: string; netmask: string }
interface DiskInfo { path: string; total: number; used: number; free: number; usage: number }
interface NetIORate { name: string; rxSpeed: number; txSpeed: number }
interface DiskIORate { name: string; readSpeed: number; writeSpeed: number }
interface SystemInfo {
  hostname: string; platform: string; arch: string; osType: string; osRelease: string
  cpuModel: string; cpuCores: number; cpuUsage: number
  totalMemory: number; usedMemory: number; freeMemory: number; memoryUsage: number
  uptime: number; networks: NetworkInfo[]; disks: DiskInfo[]
  nodeVersion: string; electronVersion: string; chromeVersion: string
  gpuModel: string; gpuUsage: number
  networkRate: NetIORate[]; diskRate: DiskIORate[]
}

const systemInfo = ref<SystemInfo | null>(null)
const currentTime = ref('')
const loading = ref(true)
const loading2 = ref(true)
let timer: number | null = null
let refreshTimer: number | null = null

// 网络 IO 历史（最近 20 个点，用于折线图）
const netHistory = ref<{ rx: number; tx: number }[]>([])
const MAX_NET_POINTS = 20

const pushNetHistory = () => {
  if (!systemInfo.value?.networkRate?.length) return
  const nio = systemInfo.value.networkRate[0]
  netHistory.value.push({ rx: nio.rxSpeed, tx: nio.txSpeed })
  if (netHistory.value.length > MAX_NET_POINTS) netHistory.value.shift()
}

// 磁盘 IO 历史
const diskHistory = ref<{ read: number; write: number }[]>([])

const pushDiskHistory = () => {
  if (!systemInfo.value?.diskRate?.length) return
  const dio = systemInfo.value.diskRate[0]
  diskHistory.value.push({ read: dio.readSpeed, write: dio.writeSpeed })
  if (diskHistory.value.length > MAX_NET_POINTS) diskHistory.value.shift()
}

// SVG 折线图常量
const chartW = 280
const chartH = 70
const chartPad = 3

const makePoints = (pts: { a: number; b: number }[], getVal: (p: { a: number; b: number }) => number) => {
  if (pts.length < 2) return ''
  const maxV = Math.max(1, ...pts.map(p => Math.max(getVal(p), 0)))
  return pts.map((p, i) => {
    const x = chartPad + (i / (MAX_NET_POINTS - 1)) * (chartW - 2 * chartPad)
    const y = chartH - chartPad - (Math.max(0, getVal(p)) / maxV) * (chartH - 2 * chartPad)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

const netChartPointsRx = computed(() => makePoints(netHistory.value, p => p.rx))
const netChartPointsTx = computed(() => makePoints(netHistory.value, p => p.tx))

const diskChartPointsRead = computed(() => makePoints(diskHistory.value, p => p.read))
const diskChartPointsWrite = computed(() => makePoints(diskHistory.value, p => p.write))

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
const formatSpeed = (bytesPerSec: number) => {
  if (!bytesPerSec || bytesPerSec < 0) return '0 B/s'
  return formatBytes(bytesPerSec) + '/s'
}
const formatUptimeShort = (seconds: number) => {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
const getOSDisplayName = (platform: string, release: string) => {
  if (platform === 'win32') {
    const m = release.match(/^(\d+)\.(\d+)\.(\d+)/)
    if (m) return parseInt(m[3]) >= 22000 ? 'Windows 11' : 'Windows 10'
    return 'Windows'
  }
  return { darwin: 'macOS', linux: 'Linux' }[platform] || platform
}

const totalDiskSize = computed(() => systemInfo.value?.disks?.reduce((s, d) => s + d.total, 0) ?? 0)
const totalDiskUsed = computed(() => systemInfo.value?.disks?.reduce((s, d) => s + d.used, 0) ?? 0)
const diskTotalUsage = computed(() => totalDiskSize.value ? Math.round((totalDiskUsed.value / totalDiskSize.value) * 100) : 0)

const cpuColor = computed(() => { const u = systemInfo.value?.cpuUsage ?? 0; return u > 80 ? '#f56c6c' : u > 50 ? '#e6a23c' : '#67c23a' })
const memoryColor = computed(() => { const u = systemInfo.value?.memoryUsage ?? 0; return u > 80 ? '#f56c6c' : u > 50 ? '#e6a23c' : '#67c23a' })
const diskColor = computed(() => diskTotalUsage.value > 80 ? '#f56c6c' : diskTotalUsage.value > 50 ? '#e6a23c' : '#67c23a')

const cpuCardColor = computed(() => { const u = systemInfo.value?.cpuUsage ?? 0; return u > 80 ? '#f87171' : u > 50 ? '#fbbf24' : '#4ade80' })
const memCardColor = computed(() => { const u = systemInfo.value?.memoryUsage ?? 0; return u > 80 ? '#f87171' : u > 50 ? '#fbbf24' : '#4ade80' })
const diskCardColor = computed(() => diskTotalUsage.value > 80 ? '#f87171' : diskTotalUsage.value > 50 ? '#fbbf24' : '#4ade80')
const gpuCardColor = computed(() => { const u = systemInfo.value?.gpuUsage ?? 0; return u > 80 ? '#f87171' : u > 50 ? '#fbbf24' : '#818cf8' })

const cpuBarClass = computed(() => { const u = systemInfo.value?.cpuUsage ?? 0; return u > 80 ? 'danger' : u > 50 ? 'warning' : '' })
const memBarClass = computed(() => { const u = systemInfo.value?.memoryUsage ?? 0; return u > 80 ? 'danger' : u > 50 ? 'warning' : '' })
const diskBarClass = computed(() => diskTotalUsage.value > 80 ? 'danger' : diskTotalUsage.value > 50 ? 'warning' : '')

const gaugeCircle = 2 * Math.PI * 95
const gpuDasharray = computed(() => { const p = Math.min((systemInfo.value?.gpuUsage ?? 0) / 100, 1); return `${(gaugeCircle * p).toFixed(1)} ${gaugeCircle.toFixed(1)}` })
const cpuGaugeDasharray = computed(() => { const p = Math.min((systemInfo.value?.cpuUsage ?? 0) / 100, 1); return `${(gaugeCircle * p).toFixed(1)} ${gaugeCircle.toFixed(1)}` })

const updateTime = () => {
  currentTime.value = new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
const fetchSystemInfo = async () => {
  try { systemInfo.value = await window.electronAPI.getSystemInfo(); pushNetHistory(); pushDiskHistory() } catch (e) { console.error(e) }
  finally { loading.value = false; loading2.value = false }
}

onMounted(() => { updateTime(); fetchSystemInfo(); timer = window.setInterval(updateTime, 1000); refreshTimer = window.setInterval(fetchSystemInfo, 3000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer); if (refreshTimer) clearInterval(refreshTimer) })
</script>

<style scoped>
/* ===== 根容器 ===== */
.system-monitor { height: 100%; display: flex; flex-direction: column; }
.monitor-tabs { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.monitor-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; overflow: hidden; padding: 0; }
.monitor-tabs :deep(.el-tab-pane) { height: 100%; overflow: auto; }

/* tab 标签 */
.monitor-tabs :deep(.el-tabs__item) { font-weight: 700; font-size: 14px; padding: 0 20px; transition: all 0.3s ease; }
.tab-label { display: inline-flex; align-items: center; gap: 6px; }
.tab-label .el-icon { transition: transform 0.3s ease; }
.monitor-tabs :deep(.el-tabs__item:hover) .tab-label .el-icon { transform: scale(1.15); }
.monitor-tabs :deep(.el-tabs__item.is-active) .tab-label .el-icon { color: var(--sidebar-active-indicator, #409eff); }

/* ============================================================
   Tab 1 — 监控面板 (主题自适应)
   ============================================================ */
.dashboard {
  padding: 24px 28px 28px 28px;
  min-height: 100%;
  background: #f0f2f5;
  color: #333;
}

/* 顶部栏 */
.header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;
  margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
}
.header-left { display: flex; align-items: center; gap: 14px; }
.header-left h1 {
  font-size: 24px; font-weight: 600; letter-spacing: 0.5px;
  background: linear-gradient(135deg, #1e3a5f, #409eff);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.badge {
  background: rgba(64,158,255,0.12); color: #409eff; padding: 4px 14px;
  border-radius: 40px; font-size: 12px; font-weight: 500; border: 1px solid rgba(64,158,255,0.2);
}
.header-right { display: flex; align-items: center; gap: 16px; }
.status-dot {
  display: inline-block; width: 9px; height: 9px; border-radius: 50%;
  background: #67c23a; box-shadow: 0 0 10px rgba(103,194,58,0.5); margin-right: 6px; animation: pulse-dot 2s infinite;
}
@keyframes pulse-dot { 0%,100%{opacity:.6} 50%{opacity:1} }
.status-label { font-size: 13px; color: #606266; }
.host-info { font-size: 13px; color: #909399; }

/* 网格 — 3列布局：GPU | CPU | 内存+磁盘纵向堆叠 */
.grid-top { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px; margin-bottom: 18px; }
.stack-col { display: flex; flex-direction: column; gap: 18px; }
.stack-col .card { margin-bottom: 0; flex: 1; }

/* 卡片 */
.card {
  background: #fff; border-radius: 16px; padding: 18px 20px 20px 20px;
  border: 1px solid #e5e7eb; box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  transition: border 0.2s, transform 0.15s;
  margin-bottom: 18px;
}
.card:last-child { margin-bottom: 0; }
.card:hover { border-color: #c0c4cc; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
.card-title {
  font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;
  color: #909399; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
}
.card-title .el-icon { font-size: 17px; color: #409eff; }
.big-number { font-size: 30px; font-weight: 600; color: #333; line-height: 1.2; }
.big-number .unit { font-size: 15px; font-weight: 400; color: #909399; margin-left: 3px; }
.sub-text { font-size: 13px; color: #909399; margin-top: 3px; }

/* 圆形仪表盘 */
.gauge-card { padding: 20px 20px 16px 20px; }
.gauge-wrap { position: relative; width: 140px; height: 140px; margin: 0 auto; }
.gauge-svg { width: 100%; height: 100%; }
.gauge-lg { width: 240px; height: 240px; }
.gauge-bg { stroke: #e5e7eb; stroke-width: 14; fill: none; }
.gauge-ticks-ring { stroke: #dcdfe6; stroke-width: 3; stroke-dasharray: 3.5 10.5; fill: none; }
.gauge-arc { transition: stroke-dasharray 0.8s ease; filter: drop-shadow(0 0 6px rgba(0,0,0,0.25)); }
.gauge-inner {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.gauge-pct { font-size: 26px; font-weight: 800; line-height: 1; font-family: 'SF Mono','Consolas',monospace; }
.gauge-pct-lg { font-size: 42px; }
.gauge-pct-gpu {
  background: linear-gradient(135deg, #00f5ff, #6366f1, #a855f7, #f472b6);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.gauge-pct-cpu {
  background: linear-gradient(135deg, #22c55e, #eab308, #f97316, #ef4444);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.gauge-sub { font-size: 12px; color: #909399; font-weight: 500; text-align: center; }
.gauge-model-text {
  font-size: 13px; color: #666; margin-top: 10px; text-align: center;
  word-break: break-word; line-height: 1.5; padding: 0 4px;
}
.model-text {
  font-size: 12px; color: #666; line-height: 1.5; word-break: break-word;
  white-space: normal;
}

/* 自定义进度条 */
.progress-bar { width: 100%; height: 5px; background: #e5e7eb; border-radius: 10px; margin-top: 10px; overflow: hidden; }
.progress-bar .fill { height: 100%; border-radius: 10px; transition: width 0.5s ease; }
.progress-bar .fill:not(.warning):not(.danger) {
  background: linear-gradient(90deg, #3b82f6, #6366f1, #a855f7);
}
.progress-bar .fill.warning {
  background: linear-gradient(90deg, #f59e0b, #f97316, #ef4444);
}
.progress-bar .fill.danger {
  background: linear-gradient(90deg, #ef4444, #ec4899, #a855f7);
}

.card-meta { display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; color: #909399; }

/* 磁盘 mini 进度条 */
.disk-list { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
.disk-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #606266; }
.disk-row span:first-child { width: 28px; font-weight: 600; color: #909399; }
.disk-row span:nth-child(2) { width: 30px; text-align: right; }
.mini-bar { flex: 1; height: 4px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
.mini-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
.mini-fill:not(.mini-warn):not(.mini-danger) {
  background: linear-gradient(90deg, #3b82f6, #6366f1);
}
.mini-fill.mini-warn {
  background: linear-gradient(90deg, #f59e0b, #f97316);
}
.mini-fill.mini-danger {
  background: linear-gradient(90deg, #ef4444, #ec4899);
}

/* IO 监控行 */
.grid-io { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18px; }
.io-list { display: flex; flex-direction: column; gap: 8px; }
.io-row { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 6px 0; border-bottom: 1px solid #f0f0f0; }
.io-row:last-child { border-bottom: none; }
.io-name { font-weight: 600; color: #333; min-width: 60px; flex-shrink: 0; }
.io-label { font-size: 11px; color: #909399; font-weight: 600; text-transform: uppercase; flex-shrink: 0; }
.io-down { color: #3b82f6; }
.io-up { color: #f59e0b; }
.io-val { font-family: 'SF Mono','Consolas',monospace; color: #555; font-weight: 500; }
.io-high { color: #f56c6c; font-weight: 700; }

/* 网络折线图 */
.net-chart-wrap { width: 100%; height: 70px; margin-bottom: 8px; }
.net-chart-svg { width: 100%; height: 100%; overflow: visible; }
.net-legend { display: flex; justify-content: center; gap: 16px; margin-bottom: 4px; font-size: 11px; }
.net-lgd { display: inline-flex; align-items: center; gap: 4px; color: #909399; font-weight: 500; }
.net-lgd i { display: inline-block; width: 12px; height: 2px; border-radius: 1px; }
.net-lgd-dl i { background: #3b82f6; }
.net-lgd-ul i { background: #f59e0b; }
.io-lgd-read i { background: #22c55e; }
.io-lgd-write i { background: #ef4444; }
.net-now { display: flex; align-items: center; justify-content: center; gap: 12px; font-size: 13px; padding-top: 6px; border-top: 1px solid #f0f0f0; }
.nio-label { font-family: 'SF Mono','Consolas',monospace; font-weight: 600; }
.nio-sep { color: #dcdfe6; }

/* 网络 */
.network-grid { display: flex; flex-wrap: wrap; gap: 16px 32px; }
.network-item { display: flex; flex-direction: column; gap: 2px; }
.net-label { font-size: 11px; color: #909399; font-weight: 600; text-transform: uppercase; }
.net-value { font-size: 17px; font-weight: 500; color: #333; }
.net-mac { font-size: 12px; color: #c0c4cc; }

/* 系统信息 */
.inline-stats { display: flex; flex-wrap: wrap; gap: 20px 40px; }
.stat-item { flex: 1 0 100px; }
.stat-label { font-size: 11px; color: #909399; margin-bottom: 2px; }
.stat-value { font-size: 17px; font-weight: 500; color: #333; }

/* ============================================================
   监控面板 — 暗夜模式
   ============================================================ */
html.dark .dashboard {
  background: radial-gradient(circle at 20% 30%, #1a2639, #0f1320);
  color: #e8edf5;
}
html.dark .header { border-bottom-color: rgba(255,255,255,0.06); }
html.dark .header-left h1 {
  background: linear-gradient(135deg, #f0f4ff, #b0c4ff);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
html.dark .badge { background: rgba(0,230,118,0.18); color: #00e676; border-color: rgba(0,230,118,0.2); }
html.dark .status-dot { background: #00e676; box-shadow: 0 0 10px #00e67688; }
html.dark .status-label { color: #b0bcdb; }
html.dark .host-info { color: #7d8bb0; }
html.dark .card {
  background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.04);
  box-shadow: 0 8px 20px -8px rgba(0,0,0,0.5);
}
html.dark .card:hover { border-color: rgba(255,255,255,0.08); }
html.dark .card-title { color: #7d8bb0; }
html.dark .card-title .el-icon { color: #99a8c9; }
html.dark .big-number { color: #f0f4ff; }
html.dark .big-number .unit { color: #99a8c9; }
html.dark .sub-text { color: #99a8c9; }
html.dark .progress-bar { background: rgba(255,255,255,0.06); }
html.dark .gauge-bg { stroke: rgba(255,255,255,0.06); }
html.dark .gauge-ticks-ring { stroke: rgba(255,255,255,0.08); }
html.dark .gauge-sub { color: #7d8bb0; }
html.dark .gauge-model-text { color: #7d8bb0; }
html.dark .model-text { color: #7d8bb0; }
html.dark .card-meta { color: #7d8bb0; }
html.dark .disk-row { color: #99a8c9; }
html.dark .disk-row span:first-child { color: #7d8bb0; }
html.dark .mini-bar { background: rgba(255,255,255,0.06); }
html.dark .io-row { border-bottom-color: rgba(255,255,255,0.04); }
html.dark .io-name { color: #e8edf5; }
html.dark .io-label { color: #7d8bb0; }
html.dark .io-val { color: #b0bcdb; }
html.dark .net-now { border-top-color: rgba(255,255,255,0.04); }
html.dark .net-lgd { color: #7d8bb0; }
html.dark .nio-sep { color: rgba(255,255,255,0.1); }
html.dark .net-label { color: #7d8bb0; }
html.dark .net-value { color: #e8edf5; }
html.dark .net-mac { color: #99a8c9; }
html.dark .stat-label { color: #7d8bb0; }
html.dark .stat-value { color: #e8edf5; }

/* ============================================================
   监控面板 — 绿色主题
   ============================================================ */
html.green .dashboard {
  background: radial-gradient(circle at 20% 30%, #0d2818, #051008);
  color: #d1fae5;
}
html.green .header { border-bottom-color: rgba(255,255,255,0.06); }
html.green .header-left h1 {
  background: linear-gradient(135deg, #ecfdf5, #6ee7b7);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
html.green .badge { background: rgba(0,230,118,0.18); color: #4ade80; border-color: rgba(0,230,118,0.2); }
html.green .status-label { color: #a7f3d0; }
html.green .host-info { color: #6ee7b7; }
html.green .card {
  background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.04);
  box-shadow: 0 8px 20px -8px rgba(0,0,0,0.5);
}
html.green .card:hover { border-color: rgba(74,222,128,0.2); }
html.green .card-title { color: #6ee7b7; }
html.green .card-title .el-icon { color: #4ade80; }
html.green .big-number { color: #ecfdf5; }
html.green .big-number .unit { color: #6ee7b7; }
html.green .sub-text { color: #86efac; }
html.green .progress-bar { background: rgba(255,255,255,0.06); }
html.green .gauge-bg { stroke: rgba(255,255,255,0.06); }
html.green .gauge-ticks-ring { stroke: rgba(255,255,255,0.08); }
html.green .gauge-sub { color: #6ee7b7; }
html.green .gauge-model-text { color: #6ee7b7; }
html.green .model-text { color: #6ee7b7; }
html.green .progress-bar .fill:not(.warning):not(.danger) { background: linear-gradient(90deg, #16a34a, #22d3ee, #6366f1); }
html.green .progress-bar .fill.warning { background: linear-gradient(90deg, #fbbf24, #f59e0b, #ef4444); }
html.green .progress-bar .fill.danger { background: linear-gradient(90deg, #ef4444, #ec4899, #a855f7); }
html.green .card-meta { color: #6ee7b7; }
html.green .disk-row { color: #86efac; }
html.green .disk-row span:first-child { color: #6ee7b7; }
html.green .mini-bar { background: rgba(255,255,255,0.06); }
html.green .io-row { border-bottom-color: rgba(255,255,255,0.04); }
html.green .io-name { color: #ecfdf5; }
html.green .io-label { color: #6ee7b7; }
html.green .io-val { color: #a7f3d0; }
html.green .net-now { border-top-color: rgba(255,255,255,0.04); }
html.green .net-lgd { color: #6ee7b7; }
html.green .nio-sep { color: rgba(255,255,255,0.1); }
html.green .mini-fill:not(.mini-warn):not(.mini-danger) { background: linear-gradient(90deg, #16a34a, #22d3ee); }
html.green .mini-fill.mini-warn { background: linear-gradient(90deg, #f59e0b, #f97316); }
html.green .mini-fill.mini-danger { background: linear-gradient(90deg, #ef4444, #ec4899); }
html.green .net-label { color: #6ee7b7; }
html.green .net-value { color: #ecfdf5; }
html.green .net-mac { color: #86efac; }
html.green .stat-label { color: #6ee7b7; }
html.green .stat-value { color: #ecfdf5; }

/* ===== 暗夜模式 tab 容器 ===== */
html.dark .monitor-tabs :deep(.el-tabs__header) { background: #0d1117; border-color: #2a2d35; }
html.dark .monitor-tabs :deep(.el-tabs__content) { background: #0f1320; }
html.dark .monitor-tabs :deep(.el-tabs__nav-wrap) { background: #0d1117; }
html.dark .monitor-tabs :deep(.el-tab-pane) { background: #0f1320; }
html.dark .monitor-tabs { background: #0d1117; border-color: #2a2d35; }
html.dark .monitor-tabs :deep(.el-tabs__item) { color: #a0aec0; font-weight: 700; }
html.dark .monitor-tabs :deep(.el-tabs__item.is-active) { color: var(--sidebar-text-active); background: #0f1320; font-weight: 700; }
html.dark .monitor-tabs :deep(.el-tabs__item.is-active) .tab-label .el-icon { color: var(--sidebar-active-indicator, #60a5fa); }

/* ============================================================
   Tab 2 — 本地信息
   ============================================================ */
.detail-view { padding: 16px 8px; background: var(--page-bg); min-height: 100%; }
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 14px; }
.stat-card { display: flex; align-items: center; gap: 12px; padding: 16px; background: #fff; border-radius: 12px; border: 1px solid #ebeef5; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: transform 0.2s ease, box-shadow 0.2s ease; }
.stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08); }
.stat-icon { width: 46px; height: 46px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.stat-body { flex: 1; min-width: 0; }
.stat-val { font-size: 22px; font-weight: 700; color: #333; line-height: 1.2; }
.stat-lbl { font-size: 12px; color: #909399; }
.stat-sub { font-size: 11px; color: #c0c4cc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.progress-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 14px; }
.prog-card { padding: 14px; background: #fff; border-radius: 12px; border: 1px solid #ebeef5; }
.prog-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #333; margin-bottom: 8px; }
.prog-pct { margin-left: auto; font-weight: 700; }
.prog-detail { font-size: 11px; color: #909399; margin-top: 6px; }

.bottom-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.det-card { border-radius: 12px; }
.det-card :deep(.el-card__body) { padding: 10px 14px; }
.net-card { grid-column: 1 / -1; }
.det-card-head { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: #333; }
.det-list { display: flex; flex-direction: column; gap: 6px; }
.det-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
.det-item:last-child { border-bottom: none; }
.det-item .el-icon { color: var(--el-color-primary, #409eff); flex-shrink: 0; }
.det-l { font-size: 12px; color: #909399; flex-shrink: 0; min-width: 55px; }
.det-v { font-size: 12px; color: #333; font-weight: 500; flex: 1; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 暗夜 — 本地信息 */
html.dark .detail-view { background: #0f1320; }
html.dark .stat-card { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.04); box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
html.dark .stat-val { color: #e5e7eb; }
html.dark .stat-lbl { color: #9ca3af; }
html.dark .stat-sub { color: #7d8bb0; }
html.dark .prog-card { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.04); }
html.dark .prog-head { color: #e5e7eb; }
html.dark .prog-detail { color: #9ca3af; }
html.dark .det-card { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.04); }
html.dark .det-card :deep(.el-card__header) { background: transparent; border-bottom-color: rgba(255,255,255,0.04); }
html.dark .det-card-head { color: #e5e7eb; }
html.dark .det-item { border-bottom-color: rgba(255,255,255,0.04); }
html.dark .det-l { color: #9ca3af; }
html.dark .det-v { color: #d1d5db; }
html.dark .net-card :deep(.el-table) { background: transparent; }
html.dark .net-card :deep(.el-table th) { background: rgba(255,255,255,0.03); color: #9ca3af; border-bottom-color: rgba(255,255,255,0.04); }
html.dark .net-card :deep(.el-table td) { background: transparent; color: #d1d5db; border-bottom-color: rgba(255,255,255,0.04); }
html.dark .net-card :deep(.el-table--striped .el-table__body tr.el-table__row--striped td) { background: rgba(255,255,255,0.02); }

/* 绿色 — 本地信息 */
html.green .detail-view { background: #051008; }
html.green .stat-card { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.04); box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
html.green .stat-val { color: #ecfdf5; }
html.green .stat-lbl { color: #86efac; }
html.green .stat-sub { color: #6ee7b7; }
html.green .prog-card { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.04); }
html.green .prog-head { color: #ecfdf5; }
html.green .prog-detail { color: #86efac; }
html.green .det-card { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.04); }
html.green .det-card :deep(.el-card__header) { background: transparent; border-bottom-color: rgba(255,255,255,0.04); }
html.green .det-card-head { color: #ecfdf5; }
html.green .det-item { border-bottom-color: rgba(255,255,255,0.04); }
html.green .det-l { color: #86efac; }
html.green .det-v { color: #d1fae5; }
html.green .net-card :deep(.el-table) { background: transparent; }
html.green .net-card :deep(.el-table th) { background: rgba(255,255,255,0.03); color: #86efac; border-bottom-color: rgba(255,255,255,0.04); }
html.green .net-card :deep(.el-table td) { background: transparent; color: #d1fae5; border-bottom-color: rgba(255,255,255,0.04); }
html.green .net-card :deep(.el-table--striped .el-table__body tr.el-table__row--striped td) { background: rgba(255,255,255,0.02); }

/* ===== 亮色主题：tab 容器保持浅色 ===== */
.monitor-tabs :deep(.el-tabs__header) { background: #fff; }
.monitor-tabs :deep(.el-tabs__content) { background: #f0f2f5; }
.monitor-tabs :deep(.el-tab-pane) { background: #f0f2f5; }
</style>
