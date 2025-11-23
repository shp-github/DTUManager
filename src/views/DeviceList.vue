<template>
  <div class="dtu-list-container">
    <h2 class="title">DTU 列表</h2>

    <!-- 搜索 -->
    <div class="device-search">
      <el-input
          v-model="searchText"
          placeholder="输入设备号或IP搜索"
          clearable
          class="search-input"
      />
      <el-button type="primary" icon="el-icon-search" @click="searchDevices">
        搜索
      </el-button>
    </div>

    <!-- 设备表格 -->
    <el-table :data="filteredDevices" style="width:100%" stripe border>

      <el-table-column label="操作" >
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="goToConfig(row)">
            设备管理
          </el-button>
          <el-button
              type="warning"
              size="small"
              @click="openUpgradeDialog(row)">
            升级
          </el-button>
        </template>
      </el-table-column>

      <el-table-column prop="id" label="设备号" width="180" />
      <el-table-column prop="mac" label="MAC地址" width="180" />
      <el-table-column prop="ip" label="IP 地址" width="160" />
      <el-table-column prop="networkType" label="网络类型" width="120" />
      <el-table-column prop="RSSI" label="信号" width="80" />
      <el-table-column label="运行时间" width="200">
        <template #default="{ row }">
          {{ formatRuntime(row.runtime) }}
        </template>
      </el-table-column>
      <el-table-column prop="firmware" label="固件版本" width="120" />
      <el-table-column prop="heart_interval" label="心跳(s)" width="140" />
    </el-table>

  </div>


  <el-dialog
      v-model="upgradeDialogVisible"
      title="设备升级"
      width="500px"
      :before-close="handleDialogClose"
  >
    <div class="upgrade-content">
      <div v-if="currentDevice" class="device-info">
        <p><strong>目标设备:</strong> {{ currentDevice.id }}</p>
        <p><strong>IP地址:</strong> {{ currentDevice.ip }}</p>
        <p><strong>当前版本:</strong> {{ currentDevice.firmware }}</p>
      </div>

      <div class="file-upload-section">
        <el-alert
            title="请选择升级文件 (.bin, .hex, .json 等格式)"
            type="info"
            :closable="false"
            style="margin-bottom: 15px;"
        />

        <el-upload
            class="upload-demo"
            drag
            action=""
            :auto-upload="false"
            :on-change="handleUpgradeFile"
            :file-list="fileList"
            :limit="1"
            accept=".bin,.hex,.json,.zip,.rar,.7z"
        >
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          <div class="el-upload__text">
            将升级文件拖到此处，或<em>点击选择</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              支持 bin、hex、json 等格式文件，且不超过 100MB
            </div>
          </template>
        </el-upload>

        <div v-if="selectedFile" class="file-info">
          <p><strong>已选择文件:</strong> {{ selectedFile.name }}</p>
          <p><strong>文件大小:</strong> {{ formatFileSize(selectedFile.size) }}</p>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="upgradeDialogVisible = false" :disabled="uploading">
        取消
      </el-button>
      <el-button
          type="primary"
          @click="submitUpgrade"
          :loading="uploading"
          :disabled="!selectedFile"
      >
        {{ uploading ? '升级中...' : '开始升级' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'

const router = useRouter()

// 升级相关状态
const upgradeDialogVisible = ref(false)
const currentDevice = ref<any>(null)
const selectedFile = ref<File | null>(null)
const fileList = ref<any[]>([])
const uploading = ref(false)

// 打开升级对话框
const openUpgradeDialog = (device: any = null) => {
  currentDevice.value = device
  selectedFile.value = null
  fileList.value = []
  upgradeDialogVisible.value = true
}

// 处理文件选择
const handleUpgradeFile = (file: any) => {
  selectedFile.value = file.raw
  fileList.value = [file]
}

// 对话框关闭前的处理
const handleDialogClose = (done: () => void) => {
  if (uploading.value) {
    ElMessage.warning('升级进行中，请稍候...')
    return
  }
  done()
}

// 提交升级
  const submitUpgrade = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择升级文件')
    return
  }

  if (!currentDevice.value) {
    ElMessage.warning('未选择目标设备')
    return
  }

  // 确认升级
  try {
    await ElMessageBox.confirm(
        `确定要对设备 ${currentDevice.value.id} (${currentDevice.value.ip}) 进行升级吗？`,
        '确认升级',
        {
          confirmButtonText: '确定升级',
          cancelButtonText: '取消',
          type: 'warning',
        }
    )
  } catch {
    return // 用户取消
  }

  uploading.value = true

  try {
    // 1. 读取文件内容
    const arrayBuffer = await readFileAsArrayBuffer(selectedFile.value)

    // 2. 保存文件到服务器
    const saveResult = await window.electronAPI.saveFile(
        selectedFile.value.name,
        arrayBuffer
    )

    if (!saveResult.success) {
      throw new Error(`文件保存失败: ${saveResult.error}`)
    }

    // 3. 发送升级命令到设备（包含完整的下载地址）
    const upgradeResult = await window.electronAPI.sendUpgradeCommand(
        currentDevice.value.ip,
        selectedFile.value.name,
        {
          port: 8080, // 文件服务器端口，可以根据实际情况调整
          fileSize: selectedFile.value.size
        }
    )

    if (!upgradeResult.success) {
      throw new Error(`升级命令发送失败: ${upgradeResult.error}`)
    }

    ElMessage.success({
      message: `升级命令已发送！设备可以从以下地址下载文件：${upgradeResult.downloadUrl}`,
      duration: 8000, // 显示时间更长
      showClose: true
    })

    console.log('📤 升级文件下载地址:', upgradeResult.downloadUrl)

    // 关闭对话框
    upgradeDialogVisible.value = false

    // 重置状态
    selectedFile.value = null
    fileList.value = []

  } catch (error: any) {
    console.error('升级失败:', error)
    ElMessage.error(`升级失败: ${error.message}`)
  } finally {
    uploading.value = false
  }
}



// 读取文件为 ArrayBuffer
const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 以下是你原有的代码保持不变
const searchText = ref('')
const devices = ref<any[]>([])
const filteredDevices = ref<any[]>([])

const normalize = (str: string) =>
    str.toLowerCase().replace(/\s+/g, '').replace(/[^\x00-\x7F]/g, '')

const searchDevices = () => {
  const keyword = normalize(searchText.value)
  if (!keyword) {
    filteredDevices.value = devices.value
  } else {
    filteredDevices.value = devices.value.filter(d =>
        normalize(d.id).includes(keyword) || normalize(d.ip).includes(keyword)
    )
  }
}

// 跳转配置页
const goToConfig = (device: any) => {
  console.log("跳转配置页面", JSON.stringify(device))
  router.push({
    name: 'DtuConfig',
    query: { device: JSON.stringify(device) }
  })
}

// 监听 Electron UDP 发现设备
onMounted(() => {
  window.electronAPI.onDeviceDiscovered((list: any[]) => {
    devices.value = list
    filteredDevices.value = list
  })
})

// 转换秒为 "X天 Y小时 Z分钟 W秒" 格式
const formatRuntime = (seconds: number) => {
  const days = Math.floor(seconds / (24 * 3600))
  const hours = Math.floor((seconds % (24 * 3600)) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const sec = seconds % 60

  return `${days}天 ${hours}小时 ${minutes}分钟 ${sec}秒`
}
</script>

<style scoped>
/* 原有样式保持不变 */
.dtu-list-container {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 20px;
  color: #303133;
}

.device-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  margin-bottom: 20px;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.search-input {
  width: 280px;
}

.el-table-wrapper {
  flex-grow: 1;
  overflow-y: auto;
  max-height: calc(100vh - 220px);
}

.el-table {
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  max-height: 100%;
  overflow: hidden;
}

.el-table th.el-table__cell {
  background-color: #f2f6fc !important;
  font-weight: 600;
  color: #303133;
  height: 45px;
}

.el-table .el-table__row {
  height: 48px;
}

.el-table tbody tr:hover > td {
  background: #f9fbff !important;
}

.el-button--primary.is-link,
.el-button--primary {
  border-radius: 8px;
}

.el-button--primary {
  background-color: #409eff;
  border-color: #409eff;
}

.el-button--primary:hover {
  background-color: #66b1ff;
  border-color: #66b1ff;
}

/* 升级对话框样式 */
.upgrade-content {
  padding: 10px 0;
}

.device-info {
  background: #f0f9ff;
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 20px;
  border-left: 4px solid #409eff;
}

.device-info p {
  margin: 5px 0;
  color: #333;
}

.file-upload-section {
  margin-top: 20px;
}

.file-info {
  margin-top: 15px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.file-info p {
  margin: 5px 0;
  color: #495057;
}

:deep(.el-upload-dragger) {
  width: 100%;
}
</style>