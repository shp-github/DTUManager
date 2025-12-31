<!-- components/NetworkInterfaceSelector.vue -->
<template>
  <div class="network-interface-selector">
    <!-- 加载状态 -->
    <div v-if="loadingInitial" class="loading-initial">
      <div class="loading-spinner"></div>
      <p>初始化DHCP服务...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="apiError" class="error-state">
      <div class="error-icon">⚠️</div>
      <h3>无法连接到系统服务</h3>
      <p>请确保应用程序已正确安装并具有必要的权限。</p>
      <button @click="retryConnection" class="btn-primary">重试连接</button>
    </div>

    <!-- 正常状态 -->
    <div v-else>
      <!-- 网卡选择模态框 -->
      <div v-if="showSelector" class="selector-modal">
        <div class="modal-overlay" @click="cancel"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h2>选择网络接口</h2>
            <button class="close-btn" @click="cancel">×</button>
          </div>

          <div class="description">
            <p>请选择要运行DHCP服务器的网络接口：</p>
          </div>

          <!-- IP设置面板 -->
          <div class="ip-config-panel">
            <h3>DHCP服务器配置</h3>

            <div class="config-form">
              <!-- 子网设置 -->
              <div class="form-group">
                <label for="subnet">子网地址</label>
                <input
                    id="subnet"
                    type="text"
                    v-model="config.subnet"
                    placeholder="例如: 192.168.100.0"
                    :disabled="startingServer"
                >
                <div class="hint">DHCP服务的网络子网</div>
              </div>

              <!-- 子网掩码 -->
              <div class="form-group">
                <label for="netmask">子网掩码</label>
                <input
                    id="netmask"
                    type="text"
                    v-model="config.netmask"
                    placeholder="例如: 255.255.255.0"
                    :disabled="startingServer"
                >
              </div>

              <!-- IP池起始地址 -->
              <div class="form-group">
                <label for="ipStart">IP池起始地址</label>
                <input
                    id="ipStart"
                    type="text"
                    v-model="config.ipPoolStart"
                    placeholder="例如: 192.168.100.100"
                    :disabled="startingServer"
                >
                <div class="hint">DHCP分配的起始IP地址</div>
              </div>

              <!-- IP池结束地址 -->
              <div class="form-group">
                <label for="ipEnd">IP池结束地址</label>
                <input
                    id="ipEnd"
                    type="text"
                    v-model="config.ipPoolEnd"
                    placeholder="例如: 192.168.100.200"
                    :disabled="startingServer"
                >
                <div class="hint">DHCP分配的结束IP地址</div>
              </div>

              <!-- 租约时间 -->
              <div class="form-group">
                <label for="leaseTime">租约时间（小时）</label>
                <input
                    id="leaseTime"
                    type="number"
                    v-model.number="config.leaseTime"
                    min="1"
                    max="720"
                    :disabled="startingServer"
                >
                <div class="hint">IP地址租用时间，1-720小时</div>
              </div>

              <!-- DNS服务器 -->
              <div class="form-group">
                <label for="dns">DNS服务器</label>
                <input
                    id="dns"
                    type="text"
                    v-model="config.dns"
                    placeholder="例如: 8.8.8.8,8.8.4.4"
                    :disabled="startingServer"
                >
                <div class="hint">多个DNS用逗号分隔</div>
              </div>
            </div>

            <div class="config-summary">
              <p><strong>配置摘要：</strong></p>
              <p>IP池范围：{{ config.ipPoolStart }} - {{ config.ipPoolEnd }}</p>
              <p>子网：{{ config.subnet }} / {{ config.netmask }}</p>
              <p>租约：{{ config.leaseTime }} 小时</p>
            </div>
          </div>

          <!-- 网络接口列表 -->
          <div class="interfaces-section">
            <h3>选择网络接口</h3>

            <div v-if="loading" class="loading">
              <div class="loading-spinner-small"></div>
              加载网络接口中...
            </div>

            <div v-else class="interfaces-list">
              <div
                  v-for="iface in interfaces"
                  :key="iface.name + iface.ip"
                  class="interface-card"
                  :class="{
                  'selected': selectedInterface?.name === iface.name,
                  'internal': iface.internal,
                  'loopback': iface.ip.startsWith('127.'),
                  'link-local': iface.ip.startsWith('169.254.')
                }"
                  @click="selectInterface(iface)"
              >
                <div class="interface-info">
                  <div class="interface-header">
                    <h4>{{ iface.name }}</h4>
                    <div class="interface-badges">
                      <span v-if="iface.internal" class="badge internal">内部</span>
                      <span v-if="iface.ip.startsWith('127.')" class="badge loopback">回环</span>
                      <span v-if="iface.ip.startsWith('169.254.')" class="badge link-local">链路本地</span>
                      <span v-if="isRecommended(iface)" class="badge recommended">推荐</span>
                    </div>
                  </div>

                  <div class="details">
                    <div class="detail-item">
                      <span class="label">IP地址:</span>
                      <span class="value">{{ iface.ip }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">MAC地址:</span>
                      <span class="value">{{ iface.mac || 'N/A' }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">类型:</span>
                      <span class="value">
                        <span v-if="iface.internal" class="status internal">内部接口</span>
                        <span v-else class="status external">外部接口</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="interfaces.length === 0" class="no-interfaces">
                <div class="no-data-icon">📡</div>
                <p>未找到可用的网络接口</p>
              </div>
            </div>
          </div>

          <div class="actions">
            <button
                @click="confirmSelection"
                :disabled="!selectedInterface || startingServer"
                class="btn-primary"
            >
              <span v-if="startingServer" class="btn-loading">
                <span class="spinner"></span>
                启动中...
              </span>
              <span v-else>确认选择并启动DHCP</span>
            </button>
            <button @click="cancel" class="btn-secondary" :disabled="startingServer">
              取消
            </button>
            <button @click="refreshInterfaces" class="btn-text" :disabled="startingServer">
              刷新列表
            </button>
            <button @click="resetConfig" class="btn-text" :disabled="startingServer">
              重置配置
            </button>
          </div>

          <div class="tips">
            <p><strong>💡 提示：</strong></p>
            <p>1. 建议选择显示"推荐"的外部网络接口</p>
            <p>2. 确保IP池范围在子网内且不与其他设备冲突</p>
            <p>3. 选择错误的接口可能导致DHCP服务无法正常工作</p>
          </div>
        </div>
      </div>

      <!-- DHCP状态显示面板 -->
      <div class="status-panel">
        <div class="status-header">
          <h3>DHCP服务器状态</h3>
          <div class="status-controls">
            <span class="status-indicator" :class="{ 'running': dhcpStatus?.running }">
              {{ dhcpStatus?.running ? '运行中' : '已停止' }}
            </span>
            <button v-if="dhcpStatus?.running" @click="showConfigPanel = !showConfigPanel" class="btn-text">
              {{ showConfigPanel ? '隐藏配置' : '修改配置' }}
            </button>
          </div>
        </div>

        <!-- 配置修改面板 -->
        <div v-if="showConfigPanel && dhcpStatus?.running" class="config-edit-panel">
          <h4>修改DHCP配置</h4>
          <div class="edit-form">
            <div class="form-row">
              <div class="form-group">
                <label>IP池起始</label>
                <input type="text" v-model="editConfig.ipPoolStart" placeholder="例如: 192.168.100.100">
              </div>
              <div class="form-group">
                <label>IP池结束</label>
                <input type="text" v-model="editConfig.ipPoolEnd" placeholder="例如: 192.168.100.200">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>租约时间（小时）</label>
                <input type="number" v-model.number="editConfig.leaseTime" min="1" max="720">
              </div>
              <div class="form-group">
                <label>DNS服务器</label>
                <input type="text" v-model="editConfig.dns" placeholder="例如: 8.8.8.8,8.8.4.4">
              </div>
            </div>
            <div class="edit-actions">
              <button @click="applyConfig" class="btn-primary">应用配置</button>
              <button @click="showConfigPanel = false" class="btn-secondary">取消</button>
            </div>
          </div>
        </div>

        <div v-if="dhcpStatus?.running" class="status-details">
          <div class="detail-grid">
            <div class="detail-row">
              <span class="label">网卡:</span>
              <span class="value">{{ dhcpStatus.interface }}</span>
            </div>
            <div class="detail-row">
              <span class="label">服务器IP:</span>
              <span class="value">{{ dhcpStatus.ip }}</span>
            </div>
            <div class="detail-row">
              <span class="label">网关地址:</span>
              <span class="value">{{ dhcpStatus.gateway }}</span>
            </div>
            <div class="detail-row">
              <span class="label">子网掩码:</span>
              <span class="value">{{ dhcpStatus.netmask }}</span>
            </div>
            <div class="detail-row">
              <span class="label">IP池范围:</span>
              <span class="value">{{ getIPPoolRange() }}</span>
            </div>
            <div class="detail-row">
              <span class="label">已分配租约:</span>
              <span class="value">{{ dhcpStatus.leases.length }} 个</span>
            </div>
            <div class="detail-row">
              <span class="label">可用IP:</span>
              <span class="value">{{ dhcpStatus.availableIPs }}/{{ dhcpStatus.totalIPs }}</span>
            </div>
            <div class="detail-row">
              <span class="label">租约时间:</span>
              <span class="value">{{ Math.floor((config.leaseTime || 24) / 24) }} 天</span>
            </div>
          </div>

          <!-- 租约列表 -->
          <div v-if="dhcpStatus.leases.length > 0" class="leases-section">
            <div class="leases-header">
              <h4>当前设备租约</h4>
              <button @click="refreshLeases" class="btn-text">刷新</button>
            </div>
            <div class="leases-list">
              <div v-for="lease in dhcpStatus.leases" :key="lease.mac" class="lease-item">
                <div class="lease-mac">{{ lease.mac }}</div>
                <div class="lease-ip">{{ lease.ip }}</div>
                <div class="lease-time">
                  {{ formatTimeAgo(lease.lastSeen) }}
                </div>
                <div class="lease-actions">
                  <button @click="releaseLease(lease.mac)" class="btn-text-small" title="释放租约">
                    释放
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="action-buttons">
            <button @click="showSelector = true" class="btn-secondary">
              更换网卡
            </button>
            <button @click="stopDHCP" class="btn-danger">
              停止服务器
            </button>
            <button @click="refreshStatus" class="btn-text">
              刷新状态
            </button>
          </div>
        </div>

        <div v-else class="status-stopped">
          <div class="stopped-icon">🛑</div>
          <p>DHCP服务器未运行</p>
          <p class="stopped-description">启动DHCP服务器后，设备将自动获取IP地址</p>
          <button @click="showSelector = true" class="btn-primary">
            启动DHCP服务器
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'

interface NetworkInterface {
  name: string
  ip: string
  mac: string
  internal: boolean
}

interface DHCPStatus {
  running: boolean
  interface: string
  ip: string
  gateway: string
  subnet: string
  netmask: string
  port: number
  leases: any[]
  availableIPs: number
  totalIPs: number
}

interface DHCPLease {
  mac: string
  ip: string
  lastSeen: number
  deviceId?: string
}

interface DHCPConfig {
  subnet: string
  netmask: string
  ipPoolStart: string
  ipPoolEnd: string
  leaseTime: number
  dns: string
}

// 状态变量
const showSelector = ref(false)
const showConfigPanel = ref(false)
const interfaces = ref<NetworkInterface[]>([])
const selectedInterface = ref<NetworkInterface | null>(null)
const dhcpStatus = ref<DHCPStatus | null>(null)
const loading = ref(false)
const loadingInitial = ref(true)
const apiError = ref(false)
const startingServer = ref(false)

// 配置
const config = ref<DHCPConfig>({
  subnet: '192.168.100.0',
  netmask: '255.255.255.0',
  ipPoolStart: '192.168.100.100',
  ipPoolEnd: '192.168.100.200',
  leaseTime: 24,
  dns: '8.8.8.8,8.8.4.4'
})

const editConfig = ref<Partial<DHCPConfig>>({})

// 检查 API 是否可用
const checkApiAvailability = (): boolean => {
  if (!window.electronAPI) {
    console.error('window.electronAPI 未定义，请检查预加载脚本配置')
    apiError.value = true
    return false
  }

  const requiredMethods = [
    'getNetworkInterfaces',
    'getDHCPStatus',
    'startDHCPServer',
    'stopDHCPServer',
    'reconfigureDHCP',
    'getDHCPLeases',
    'getDHCPConfig',
    'on',
    'off'
  ]

  for (const method of requiredMethods) {
    if (typeof (window.electronAPI as any)[method] !== 'function') {
      console.error(`window.electronAPI.${method} 不是函数`)
      apiError.value = true
      return false
    }
  }

  console.log('API检查通过，所有方法都可用')
  return true
}

// 重试连接
const retryConnection = async () => {
  loadingInitial.value = true
  apiError.value = false

  await new Promise(resolve => setTimeout(resolve, 1000))

  if (checkApiAvailability()) {
    await initializeComponent()
  }
}

// 检查是否推荐使用该网卡
const isRecommended = (iface: NetworkInterface) => {
  return !iface.internal &&
      !iface.ip.startsWith('127.') &&
      !iface.ip.startsWith('169.254.')
}

// 格式化时间差
const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days}天前`
  } else if (hours > 0) {
    return `${hours}小时前`
  } else if (minutes > 0) {
    return `${minutes}分钟前`
  } else {
    return '刚刚'
  }
}

// 获取IP池范围
const getIPPoolRange = (): string => {
  if (!dhcpStatus.value) return ''
  return `${config.value.ipPoolStart} - ${config.value.ipPoolEnd}`
}

// 重置配置
const resetConfig = () => {
  config.value = {
    subnet: '192.168.100.0',
    netmask: '255.255.255.0',
    ipPoolStart: '192.168.100.100',
    ipPoolEnd: '192.168.100.200',
    leaseTime: 24,
    dns: '8.8.8.8,8.8.4.4'
  }
}

// 应用配置
const applyConfig = async () => {
  if (!window.electronAPI || !dhcpStatus.value?.running) return

  try {
    // 重新启动服务器使用新配置
    const newConfig = {
      ...config.value,
      ...editConfig.value,
      interfaceName: dhcpStatus.value.interface,
      interfaceIP: dhcpStatus.value.ip,
      gateway: dhcpStatus.value.gateway,
      port: dhcpStatus.value.port
    }

    const result = await window.electronAPI.startDHCPServer(newConfig)
    if (result.success) {
      dhcpStatus.value = result.status
      showConfigPanel.value = false
      alert('配置已更新')
    } else {
      alert('配置更新失败: ' + result.message)
    }
  } catch (error) {
    console.error('更新配置失败:', error)
    alert('更新配置失败: ' + (error instanceof Error ? error.message : '未知错误'))
  }
}

// 释放租约
const releaseLease = async (mac: string) => {
  if (!window.electronAPI || !confirm(`确定要释放设备 ${mac} 的租约吗？`)) {
    return
  }

  try {
    // 这里需要实现释放租约的API
    // 暂时通过停止并重启服务器来清除租约
    alert('释放租约功能正在开发中')
  } catch (error) {
    console.error('释放租约失败:', error)
  }
}

// 刷新租约列表
const refreshLeases = async () => {
  await loadDHCPStatus()
}

// 获取网络接口列表
const loadInterfaces = async () => {
  if (!window.electronAPI) return

  loading.value = true
  try {
    const data = await window.electronAPI.getNetworkInterfaces()
    interfaces.value = data || []
    console.log('获取到网络接口:', interfaces.value)

    // 自动选择推荐网卡
    const recommended = interfaces.value.find(isRecommended)
    if (recommended) {
      selectedInterface.value = recommended
      // 根据选中的网卡IP自动设置子网
      const ipParts = recommended.ip.split('.')
      config.value.subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0`
      config.value.ipPoolStart = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.100`
      config.value.ipPoolEnd = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.200`
      config.value.gateway = recommended.ip
    }
  } catch (error) {
    console.error('获取网络接口失败:', error)
    apiError.value = true
  } finally {
    loading.value = false
  }
}

// 选择网卡
const selectInterface = (iface: NetworkInterface) => {
  selectedInterface.value = iface
  // 更新配置
  const ipParts = iface.ip.split('.')
  config.value.subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0`
  config.value.gateway = iface.ip

  //设置
  config.value.ipPoolStart = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.100`
  config.value.ipPoolEnd = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.200`

}

// 确认选择并启动DHCP
const confirmSelection = async () => {
  if (!selectedInterface.value || !window.electronAPI) return

  startingServer.value = true
  try {
    const fullConfig = {
      interfaceName: selectedInterface.value.name,
      interfaceIP: selectedInterface.value.ip,
      gateway: config.value.gateway,
      subnet: config.value.subnet,
      netmask: config.value.netmask,
      ipPoolStart: config.value.ipPoolStart,
      ipPoolEnd: config.value.ipPoolEnd,
      leaseTime: config.value.leaseTime * 3600, // 转换为秒
      dns: config.value.dns.split(',').map(dns => dns.trim()).filter(dns => dns),
      port: 67
    }

    console.log('正在启动DHCP服务器:', fullConfig)
    const result = await window.electronAPI.startDHCPServer(fullConfig)

    if (result.success) {
      dhcpStatus.value = result.status
      showSelector.value = false
      console.log('DHCP服务器启动成功')
    } else {
      console.error('DHCP服务器启动失败:', result)
      alert('DHCP服务器启动失败，请检查网络配置')
    }
  } catch (error) {
    console.error('启动DHCP失败:', error)
    alert(`启动DHCP失败: ${error instanceof Error ? error.message : '未知错误'}`)
  } finally {
    startingServer.value = false
  }
}

// 取消选择
const cancel = () => {
  showSelector.value = false
  resetConfig()
}

// 刷新接口列表
const refreshInterfaces = () => {
  loadInterfaces()
}

// 停止DHCP服务器
const stopDHCP = async () => {
  if (!window.electronAPI) return

  if (!confirm('确定要停止DHCP服务器吗？正在连接的设备将失去网络连接。')) {
    return
  }

  try {
    await window.electronAPI.stopDHCPServer()
    dhcpStatus.value = null
    showConfigPanel.value = false
  } catch (error) {
    console.error('停止DHCP失败:', error)
    alert(`停止DHCP失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 获取DHCP状态
const loadDHCPStatus = async () => {
  if (!window.electronAPI) return

  try {
    const status = await window.electronAPI.getDHCPStatus()
    dhcpStatus.value = status
    console.log('DHCP状态:', status)
  } catch (error) {
    console.error('获取DHCP状态失败:', error)
  }
}

// 刷新状态
const refreshStatus = async () => {
  await loadDHCPStatus()
}

// 设置事件监听
const setupListeners = () => {
  if (!window.electronAPI) {
    console.error('无法设置事件监听: window.electronAPI 未定义')
    return
  }

  console.log('正在设置事件监听...')

  try {
    // DHCP服务器状态更新
    window.electronAPI.on('dhcp-server-status', (status: DHCPStatus) => {
      console.log('收到DHCP状态更新:', status)
      dhcpStatus.value = status
    })

    // 新设备注册
    window.electronAPI.on('dhcp-device-registered', (device: any) => {
      console.log('新设备注册:', device)
      // 刷新状态
      loadDHCPStatus()
    })

    // DHCP服务器启动
    window.electronAPI.on('dhcp-server-started', () => {
      console.log('DHCP服务器已启动')
      loadDHCPStatus()
    })

    // DHCP服务器停止
    window.electronAPI.on('dhcp-server-stopped', () => {
      console.log('DHCP服务器已停止')
      dhcpStatus.value = null
      showConfigPanel.value = false
    })

    // 应用就绪
    window.electronAPI.on('app-ready', () => {
      console.log('应用已就绪，检查DHCP状态')
      checkIfNeedToShowSelector()
    })

    console.log('事件监听设置完成')
  } catch (error) {
    console.error('设置事件监听失败:', error)
    apiError.value = true
  }
}

// 检查是否需要显示选择器
const checkIfNeedToShowSelector = async () => {
  if (!window.electronAPI) return

  try {
    const status = await window.electronAPI.getDHCPStatus()
    dhcpStatus.value = status

    // 如果没有运行的DHCP服务器，显示选择器
    if (!status?.running) {
      console.log('没有运行中的DHCP服务器，显示网卡选择器')
      showSelector.value = true
    } else {
      console.log('DHCP服务器已在运行，状态:', status)
    }
  } catch (error) {
    console.error('检查DHCP状态失败:', error)
    // 出错时也显示选择器
    showSelector.value = true
  }
}

// 初始化组件
const initializeComponent = async () => {
  console.log('初始化DHCP选择器组件...')

  // 等待DOM更新
  await nextTick()

  if (!checkApiAvailability()) {
    loadingInitial.value = false
    return
  }

  try {
    // 设置事件监听
    setupListeners()

    // 加载网络接口
    await loadInterfaces()

    // 检查DHCP状态
    await loadDHCPStatus()

    // 检查是否需要显示选择器
    await checkIfNeedToShowSelector()

    console.log('DHCP选择器组件初始化完成')
  } catch (error) {
    console.error('组件初始化失败:', error)
    apiError.value = true
  } finally {
    loadingInitial.value = false
  }
}

onMounted(() => {
  console.log('网卡选择器组件已挂载')
  console.log('检查 window.electronAPI:', window.electronAPI)

  // 延迟初始化，确保DOM已完全加载
  setTimeout(() => {
    initializeComponent()
  }, 100)
})

onUnmounted(() => {
  // 清理事件监听
  if (window.electronAPI) {
    try {
      // 注意：这里简化处理，实际使用时可能需要保存回调引用
      console.log('清理事件监听')
    } catch (error) {
      console.error('清理事件监听失败:', error)
    }
  }
})
</script>

<style scoped>
.network-interface-selector {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
}

/* ========== 加载状态样式 ========== */
.loading-initial {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 40px;
  text-align: center;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #4CAF50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.loading-initial p {
  color: #666;
  margin: 0;
  font-size: 16px;
}

/* ========== 错误状态样式 ========== */
.error-state {
  text-align: center;
  padding: 60px 40px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.error-icon {
  font-size: 60px;
  margin-bottom: 20px;
  opacity: 0.8;
}

.error-state h3 {
  margin: 0 0 16px 0;
  color: #f44336;
  font-size: 20px;
}

.error-state p {
  margin: 0 0 24px 0;
  color: #666;
  line-height: 1.5;
  max-width: 400px;
  margin-left: auto;
  margin-right: auto;
}

/* ========== 模态框样式 ========== */
.selector-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}

.modal-content {
  position: relative;
  background: white;
  border-radius: 16px;
  padding: 32px;
  max-width: 900px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  width: 95%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-header h2 {
  margin: 0;
  color: #333;
  font-size: 24px;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f5f5f5;
  color: #666;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #e0e0e0;
  color: #333;
}

.description {
  margin-bottom: 24px;
}

.description p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

/* ========== IP配置面板 ========== */
.ip-config-panel {
  background: #f9f9f9;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.ip-config-panel h3 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 18px;
}

.config-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-weight: 500;
  color: #333;
  margin-bottom: 6px;
  font-size: 14px;
}

.form-group input {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #4CAF50;
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.1);
}

.form-group input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}

.hint {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.config-summary {
  background: white;
  border-radius: 8px;
  padding: 16px;
  border-left: 4px solid #4CAF50;
}

.config-summary p {
  margin: 4px 0;
  font-size: 13px;
  color: #666;
}

.config-summary p:first-child {
  font-weight: 500;
  color: #333;
}

/* ========== 网络接口区域 ========== */
.interfaces-section {
  margin-bottom: 24px;
}

.interfaces-section h3 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 18px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #666;
}

.loading-spinner-small {
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #4CAF50;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

/* ========== 网络接口列表样式 ========== */
.interfaces-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px;
}

.interface-card {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
}

.interface-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.interface-card.selected {
  border-color: #4CAF50;
  background: #f0f9f0;
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.2);
}

.interface-card.internal {
  border-color: #ff9800;
}

.interface-card.loopback {
  border-color: #9e9e9e;
}

.interface-card.link-local {
  border-color: #ff9800;
}

.interface-info h4 {
  margin: 0 0 8px 0;
  color: #333;
  font-size: 16px;
}

.interface-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge.internal {
  background: #fff3e0;
  color: #ef6c00;
}

.badge.loopback {
  background: #f5f5f5;
  color: #666;
}

.badge.link-local {
  background: #fff3e0;
  color: #ef6c00;
}

.badge.recommended {
  background: #e8f5e8;
  color: #4CAF50;
}

.details {
  margin-top: 8px;
}

.detail-item {
  margin-bottom: 4px;
  display: flex;
}

.detail-item .label {
  font-weight: 500;
  color: #666;
  min-width: 60px;
  font-size: 12px;
}

.detail-item .value {
  color: #333;
  margin-left: 8px;
  font-size: 12px;
  word-break: break-all;
}

.status {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}

.status.internal {
  background: #fff3e0;
  color: #ef6c00;
}

.status.external {
  background: #e8f5e8;
  color: #4CAF50;
}

.no-interfaces {
  grid-column: 1 / -1;
  text-align: center;
  padding: 40px 20px;
  color: #666;
}

.no-data-icon {
  font-size: 36px;
  margin-bottom: 12px;
  opacity: 0.5;
}

/* ========== 操作按钮样式 ========== */
.actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #eee;
  flex-wrap: wrap;
}

button {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-primary {
  background: linear-gradient(135deg, #4CAF50, #45a049);
  color: white;
  flex: 1;
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #45a049, #3d8b40);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.btn-loading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-loading .spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.btn-secondary {
  background: #f5f5f5;
  color: #333;
}

.btn-secondary:hover:not(:disabled) {
  background: #e0e0e0;
}

.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-text {
  background: transparent;
  color: #666;
}

.btn-text:hover:not(:disabled) {
  color: #333;
  background: #f5f5f5;
}

.btn-text:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
}

.btn-text-small {
  padding: 4px 8px;
  font-size: 12px;
  background: transparent;
  color: #666;
  border: none;
  cursor: pointer;
}

.btn-text-small:hover {
  color: #333;
  background: #f5f5f5;
}

.tips {
  margin-top: 20px;
  padding: 16px;
  background: #f9f9f9;
  border-radius: 8px;
  border-left: 4px solid #4CAF50;
}

.tips p {
  margin: 4px 0;
  color: #666;
  font-size: 12px;
  line-height: 1.5;
}

/* ========== 状态面板样式 ========== */
.status-panel {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  margin-top: 0;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #eee;
}

.status-header h3 {
  margin: 0;
  color: #333;
  font-size: 20px;
}

.status-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-indicator {
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-indicator.running {
  background: #e8f5e8;
  color: #4CAF50;
}

.status-indicator:not(.running) {
  background: #ffebee;
  color: #f44336;
}

/* ========== 配置编辑面板 ========== */
.config-edit-panel {
  background: #f9f9f9;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  border: 1px solid #e0e0e0;
}

.config-edit-panel h4 {
  margin: 0 0 16px 0;
  color: #333;
  font-size: 16px;
}

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.edit-form .form-group label {
  font-size: 13px;
  margin-bottom: 4px;
}

.edit-form .form-group input {
  padding: 8px 12px;
  font-size: 13px;
}

.edit-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

/* ========== 状态详情样式 ========== */
.status-details {
  border-top: none;
  padding-top: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.detail-row {
  background: #f9f9f9;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-row .label {
  font-weight: 500;
  color: #666;
  font-size: 14px;
}

.detail-row .value {
  color: #333;
  font-weight: 500;
  font-size: 14px;
}

/* ========== 租约列表样式 ========== */
.leases-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid #eee;
}

.leases-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.leases-header h4 {
  margin: 0;
  color: #333;
  font-size: 16px;
}

.leases-list {
  background: #f9f9f9;
  border-radius: 8px;
  overflow: hidden;
}

.lease-item {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 16px;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
  align-items: center;
}

.lease-item:last-child {
  border-bottom: none;
}

.lease-item:hover {
  background: #f0f0f0;
}

.lease-mac {
  font-family: 'Courier New', monospace;
  font-weight: 600;
  color: #333;
  font-size: 13px;
}

.lease-ip {
  color: #4CAF50;
  font-weight: 500;
  font-size: 13px;
}

.lease-time {
  color: #666;
  font-size: 12px;
  white-space: nowrap;
}

.lease-actions {
  display: flex;
  justify-content: flex-end;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

/* ========== 停止状态样式 ========== */
.status-stopped {
  text-align: center;
  padding: 40px 20px;
}

.stopped-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.status-stopped p {
  margin: 0 0 12px 0;
  color: #666;
}

.stopped-description {
  font-size: 14px;
  color: #999;
  margin-bottom: 24px !important;
}

/* ========== 响应式设计 ========== */
@media (max-width: 768px) {
  .modal-content {
    padding: 20px;
    width: 95%;
    max-height: 85vh;
  }

  .config-form {
    grid-template-columns: 1fr;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .interfaces-list {
    grid-template-columns: 1fr;
    max-height: 300px;
  }

  .actions {
    flex-direction: column;
  }

  .action-buttons {
    flex-direction: column;
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .lease-item {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}

/* ========== 滚动条样式 ========== */
.interfaces-list::-webkit-scrollbar {
  width: 6px;
}

.interfaces-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.interfaces-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.interfaces-list::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.modal-content::-webkit-scrollbar {
  width: 8px;
}

.modal-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.modal-content::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

.modal-content::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>