<template>
  <div class="upgrade-container">
    <!-- 顶部栏：标题 + 升级按钮 -->
    <div class="top-bar">
      <h2 class="page-title">
        <el-icon :size="26"><UploadFilled /></el-icon>
        固件升级
      </h2>
      <div class="top-actions">
        <el-tag type="warning" v-if="!selectedFile" size="large">未选择固件</el-tag>
        <el-tag type="warning" v-if="selectedDeviceIds.length === 0" size="large">未选择设备</el-tag>
        <el-button
            type="primary"
            size="large"
            :disabled="!selectedFile || selectedDeviceIds.length === 0 || upgrading"
            :loading="upgrading"
            @click="startUpgrade"
        >
          {{ upgrading ? '升级中...' : `开始升级 (${selectedDeviceIds.length}台)` }}
        </el-button>
        <el-button
            v-if="upgrading"
            size="large"
            type="danger"
            @click="cancelUpgrade"
        >
          取消
        </el-button>
      </div>
    </div>

    <!-- 主体左右分栏 -->
    <div class="main-split">
      <!-- 左侧：固件选择 -->
      <div class="left-panel">
        <div class="panel-label">
          <el-icon :size="20"><FolderOpened /></el-icon>
          <span>固件文件</span>
        </div>

        <el-upload
            class="upload-demo"
            drag
            action=""
            :auto-upload="false"
            :on-change="handleUpgradeFile"
            :file-list="fileList"
            :limit="1"
            accept=".bin"
        >
          <el-icon class="el-icon--upload" :size="36"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            拖拽或<em>点击选择</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">.bin 格式，≤2MB</div>
          </template>
        </el-upload>

        <div v-if="selectedFile" class="file-selected-bar">
          <el-icon color="#67c23a" :size="18"><CircleCheckFilled /></el-icon>
          <div class="file-info-text">
            <span class="file-name">{{ selectedFile.name }}</span>
            <span class="file-size">{{ formatFileSize(selectedFile.size) }}</span>
          </div>
          <el-button type="danger" size="small" text @click="clearFile">移除</el-button>
        </div>

        <div v-else class="file-empty-hint">
          请上传 .bin 固件文件
        </div>
      </div>

      <!-- 右侧：设备列表 -->
      <div class="right-panel">
        <div class="panel-label">
          <el-icon :size="20"><Monitor /></el-icon>
          <span>目标设备</span>
          <el-tag type="success" v-if="selectedDeviceIds.length > 0" size="small">
            {{ selectedDeviceIds.length }}台
          </el-tag>
          <el-switch
              v-model="autoRefreshEnabled"
              active-text="自动"
              inactive-text="暂停"
              style="margin-left: auto;"
          />
          <el-input
              v-model="searchText"
              placeholder="搜索设备号/名称/IP"
              clearable
              style="width: 200px; margin-left: 8px;"
          />
          <el-select v-model="networkTypeFilter" placeholder="全部" clearable style="width: 100px; margin-left: 6px;">
            <el-option label="全部" value="" />
            <el-option label="ETH" value="ETH" />
            <el-option label="WiFi" value="WiFi" />
          </el-select>
        </div>

        <div class="device-cards-grid" v-if="filteredDevices.length > 0">
          <div
              v-for="device in filteredDevices"
              :key="device.id"
              class="device-card"
              :class="{
                selected: isDeviceSelected(device.id),
                upgrading: isDeviceUpgrading(device.id),
                'upgrade-success': isDeviceUpgradeSuccess(device.id),
                'upgrade-error': isDeviceUpgradeError(device.id),
              }"
              @click="upgrading ? null : toggleDeviceSelection(device)"
          >
            <div class="card-header">
              <el-checkbox
                  v-if="!upgrading"
                  :model-value="isDeviceSelected(device.id)"
                  @click.stop="toggleDeviceSelection(device)"
                  size="large"
              />
              <span class="device-name">{{ device.name || device.id }}</span>
              <el-tag size="small" :type="device.networkType === 'WiFi' ? 'success' : ''">
                {{ device.networkType || 'ETH' }}
              </el-tag>
            </div>
            <div class="card-body">
              <div class="info-row">
                <span class="label">运行时间</span>
                <span class="value">{{ formatRuntime(device.runtime) }}</span>
              </div>
              <div class="info-row">
                <span class="label">IP</span>
                <span class="value">{{ device.ip }}</span>
              </div>
              <div class="info-row">
                <span class="label">固件</span>
                <span class="value">{{ device.firmware || '-' }}</span>
              </div>
            </div>

            <div v-if="upgradeProgressMap[device.id]" class="card-progress">
              <el-progress
                  :percentage="upgradeProgressMap[device.id].progress"
                  :status="upgradeProgressMap[device.id].progress >= 100 ? 'success' : ''"
                  :stroke-width="8"
              />
              <span class="progress-label">{{ upgradeProgressMap[device.id].statusText }}</span>
            </div>
          </div>
        </div>

        <div v-else class="empty-tip">暂无设备，等待设备上线...</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled, FolderOpened, Monitor, CircleCheckFilled } from '@element-plus/icons-vue'

// -- 设备列表 --
const allDevices = ref<any[]>([])
const searchText = ref('')
const networkTypeFilter = ref('')
const selectedDeviceIds = ref<string[]>([])
const autoRefreshEnabled = ref(true)

// -- 文件选择 --
const selectedFile = ref<File | null>(null)
const fileList = ref<any[]>([])

// -- 升级状态 --
const upgrading = ref(false)
const upgradeProgressMap = ref<Record<string, { progress: number; status: string; statusText: string }>>({})

// -- 计算属性 --
const filteredDevices = computed(() => {
  let list = allDevices.value
  if (searchText.value) {
    const kw = searchText.value.toLowerCase()
    list = list.filter(d =>
        (d.name && d.name.toLowerCase().includes(kw)) ||
        (d.id && d.id.toLowerCase().includes(kw)) ||
        (d.ip && d.ip.toLowerCase().includes(kw))
    )
  }
  if (networkTypeFilter.value) {
    list = list.filter(d => d.networkType === networkTypeFilter.value)
  }
  return list
})

// -- 辅助函数 --
const isDeviceSelected = (id: string) => selectedDeviceIds.value.includes(id)
const isDeviceUpgrading = (id: string) => {
  const p = upgradeProgressMap.value[id]
  return p && p.status === 'downloading'
}
const isDeviceUpgradeSuccess = (id: string) => {
  const p = upgradeProgressMap.value[id]
  return p && p.status === 'completed'
}
const isDeviceUpgradeError = (id: string) => {
  const p = upgradeProgressMap.value[id]
  return p && p.status === 'error'
}

const toggleDeviceSelection = (device: any) => {
  const arr = [...selectedDeviceIds.value]
  const idx = arr.indexOf(device.id)
  if (idx >= 0) {
    arr.splice(idx, 1)
  } else {
    arr.push(device.id)
  }
  selectedDeviceIds.value = arr
}

// -- 文件操作 --
const handleUpgradeFile = (file: any) => {
  const maxSize = 2 * 1024 * 1024
  if (file.size > maxSize) {
    ElMessage.error('文件大小超过 2MB 限制')
    selectedFile.value = null
    fileList.value = []
    return false
  }
  selectedFile.value = file.raw
  fileList.value = [file]
  ElMessage.success(`已选择: ${file.name}`)
}

const clearFile = () => {
  selectedFile.value = null
  fileList.value = []
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatRuntime = (seconds: number | undefined): string => {
  if (seconds === undefined || seconds === null) return '-'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${mins}分`
  return `${mins}分`
}

// -- MQTT 进度监听 --
const handleMqttMessage = (_event: any, data: any) => {
  const { topic, payload } = data
  if (!topic || !topic.startsWith('/dev/ota/')) return

  // 解析设备ID
  const deviceId = topic.replace('/dev/ota/', '')

  let msg: any
  try {
    msg = typeof payload === 'string' ? JSON.parse(payload) : payload
  } catch {
    return
  }

  const { status, progress } = msg
  if (status === undefined && progress === undefined) return

  let statusText = ''
  if (status === 'downloading') {
    statusText = `下载中 ${progress || 0}%`
  } else if (status === 'completed') {
    statusText = '升级完成'
  } else if (status === 'error') {
    statusText = '升级失败'
  } else if (status === 'installing') {
    statusText = '安装中...'
  } else {
    statusText = status || '处理中'
  }

  upgradeProgressMap.value = {
    ...upgradeProgressMap.value,
    [deviceId]: {
      progress: progress ?? upgradeProgressMap.value[deviceId]?.progress ?? 0,
      status: status || 'downloading',
      statusText,
    }
  }
}

// -- 升级流程 --
const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

const ensureIPSelected = async (): Promise<boolean> => {
  try {
    const ips: string[] = await window.electronAPI.getAvailableIPs()
    if (!ips || ips.length === 0) {
      ElMessage.error('未检测到可用的网络接口')
      return false
    }
    if (ips.length === 1) {
      await window.electronAPI.setSelectedIP(ips[0])
      return true
    }
    await window.electronAPI.setSelectedIP(ips[0])
    return true
  } catch {
    return false
  }
}

const startUpgrade = async () => {
  if (!selectedFile.value || selectedDeviceIds.value.length === 0) {
    ElMessage.warning('请先选择固件文件和目标设备')
    return
  }

  try {
    await ElMessageBox.confirm(
        `确定要对 ${selectedDeviceIds.value.length} 台设备进行固件升级吗？`,
        '确认升级',
        { confirmButtonText: '确定升级', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }

  upgrading.value = true

  try {
    const ipReady = await ensureIPSelected()
    if (!ipReady) {
      upgrading.value = false
      return
    }

    // 读取并保存文件
    const arrayBuffer = await readFileAsArrayBuffer(selectedFile.value)
    const saveResult = await window.electronAPI.saveFile(selectedFile.value.name, arrayBuffer)
    if (!saveResult.success) {
      throw new Error(`文件保存失败: ${saveResult.error}`)
    }

    // 获取选中设备
    const targetDevices = allDevices.value.filter(d => selectedDeviceIds.value.includes(d.id))

    // 初始化进度
    const initMap: Record<string, any> = {}
    for (const d of targetDevices) {
      initMap[d.id] = { progress: 0, status: 'pending', statusText: '等待中' }
    }
    upgradeProgressMap.value = initMap

    // 逐个发送升级命令
    for (const device of targetDevices) {
      upgradeProgressMap.value = {
        ...upgradeProgressMap.value,
        [device.id]: { ...upgradeProgressMap.value[device.id], statusText: '发送命令中' }
      }

      try {
        const upgradeResult = await window.electronAPI.sendUpgradeCommand(
            device.ip,
            selectedFile.value!.name,
            { port: 8080, fileSize: selectedFile.value!.size }
        )

        if (!upgradeResult.success) {
          throw new Error(upgradeResult.error || '升级命令发送失败')
        }

        // MQTT 推送
        const topic = `/server/cmd/${device.id}`
        const message = JSON.stringify({ type: 'ota', downloadUrl: upgradeResult.downloadUrl })
        await window.electronAPI.mqttPublish(topic, message, { qos: 1 })

        ElMessage.success(`${device.id} 升级命令已发送`)
      } catch (err: any) {
        upgradeProgressMap.value = {
          ...upgradeProgressMap.value,
          [device.id]: { progress: 0, status: 'error', statusText: `发送失败: ${err.message}` }
        }
        ElMessage.error(`${device.id} 失败: ${err.message}`)
      }
    }
  } catch (error: any) {
    ElMessage.error(`升级失败: ${error.message}`)
  }
}

const cancelUpgrade = () => {
  upgrading.value = false
  ElMessage.warning('升级已取消（设备可能仍在进行中）')
}

// -- 生命周期 --
onMounted(() => {
  // 设备发现
  window.electronAPI.onDeviceDiscovered((list: any[]) => {
    if (!autoRefreshEnabled.value) return
    // 拒绝空列表，防止设备卡片短暂消失
    if (!list || list.length === 0) return
    allDevices.value = list
    // 清理已不在线的设备的勾选状态
    const onlineIds = new Set(list.map((d: any) => d.id))
    selectedDeviceIds.value = selectedDeviceIds.value.filter(id => onlineIds.has(id))
  })

  // MQTT OTA进度
  window.electronAPI.onMqttMessagePublished(handleMqttMessage)
})
</script>

<style scoped>
.upgrade-container {
  padding: 16px;
  background: var(--page-bg);
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
}

/* 顶部栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 10px;
  padding: 12px 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  flex-shrink: 0;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 左右分栏 */
.main-split {
  display: flex;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

/* 左侧——固件选择 */
.left-panel {
  width: 260px;
  min-width: 240px;
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.panel-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
  color: #303133;
  flex-wrap: wrap;
}

.file-selected-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  background: #f0f9eb;
  border-radius: 8px;
  border: 1px solid #b3e19d;
}

.file-info-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.file-selected-bar .file-name {
  font-weight: 600;
  color: #303133;
  font-size: 14px;
  word-break: break-all;
}

.file-selected-bar .file-size {
  color: #909399;
  font-size: 12px;
}

.file-empty-hint {
  text-align: center;
  color: #c0c4cc;
  font-size: 13px;
  padding: 8px 0;
}

:deep(.el-upload-dragger) {
  padding: 20px 10px;
}

:deep(.el-upload-dragger .el-icon--upload) {
  margin-bottom: 4px;
}

:deep(.el-upload__text) {
  font-size: 14px;
}

/* 右侧——设备列表 */
.right-panel {
  flex: 1;
  background: #fff;
  border-radius: 10px;
  padding: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.device-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
  margin-top: 10px;
  overflow-y: auto;
  flex: 1;
  align-content: start;
}

.device-card {
  background: #fff;
  border: 2px solid #e4e7ed;
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.device-card:hover {
  border-color: #409eff;
  box-shadow: 0 4px 14px rgba(64,158,255,0.12);
  transform: translateY(-1px);
}

.device-card.selected {
  border-color: #67c23a;
  background: #f0f9eb;
  box-shadow: 0 4px 14px rgba(103,194,58,0.15);
}

.device-card.upgrading {
  border-color: #e6a23c;
  background: #fdf6ec;
  cursor: default;
}

.device-card.upgrade-success {
  border-color: #67c23a;
  background: #f0f9eb;
  cursor: default;
}

.device-card.upgrade-error {
  border-color: #f56c6c;
  background: #fef0f0;
  cursor: default;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #f0f0f0;
}

.device-name {
  font-size: 16px;
  font-weight: 700;
  color: #303133;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-row .label {
  font-weight: 600;
  color: #909399;
  min-width: 44px;
  font-size: 14px;
}

.info-row .value {
  color: #303133;
  font-weight: 500;
  font-size: 15px;
}

.card-progress {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #f0f0f0;
}

.progress-label {
  display: block;
  text-align: center;
  margin-top: 3px;
  font-size: 13px;
  color: #606266;
  font-weight: 500;
}

.empty-tip {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 15px;
}

:deep(.el-checkbox__inner) {
  width: 16px;
  height: 16px;
}

:deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background-color: #67c23a;
  border-color: #67c23a;
}
</style>
