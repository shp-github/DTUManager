<template>
  <el-dialog
      v-model="visible"
      :title="isBatch ? '批量升级' : '设备升级'"
      width="500px"
      :teleported="false"
      :before-close="handleDialogClose"
      class="upgrade-dialog"
  >
    <div class="upgrade-content">
      <div v-if="currentDevice && !isBatch" class="upgrade-device-info">
        <p><strong>目标设备:</strong> {{ currentDevice.id }}</p>
        <p><strong>IP地址:</strong> {{ currentDevice.ip }}</p>
        <p><strong>当前版本:</strong> {{ currentDevice.firmware }}</p>
      </div>

      <div class="file-upload-section">
        <el-alert
            title="请选择升级文件 (.bin)"
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
            accept=".bin"
        >
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          <div class="el-upload__text">
            将升级文件拖到此处，或<em>点击选择</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              支持 bin格式文件，且不超过 2MB
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
      <button class="lumina-btn lumina-btn--ghost" @click="handleCancel" :disabled="uploading">
        取消
      </button>
      <button
          class="lumina-btn"
          @click="submitUpgrade"
          :disabled="!selectedFile || uploading"
      >
        <span v-if="uploading" class="lumina-spinner"></span>
        {{ uploading ? '升级中...' : '开始升级' }}
      </button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { ensureIPSelected } from '../composables/useIPSelector'
import { formatFileSize } from '../composables/useSignal'

const props = defineProps<{
  modelValue: boolean
  currentDevice: any | null
  isBatch: boolean
  multipleSelection: any[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'terminal-open', device: any): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

// --- state ---
const selectedFile = ref<File | null>(null)
const fileList = ref<any[]>([])
const uploading = ref(false)

// --- file handling ---
const handleUpgradeFile = (file: any) => {
  const maxSize = 2 * 1024 * 1024 // 2MB
  if (file.size > maxSize) {
    ElMessage.error('文件大小超过 2MB 限制，请选择更小的文件')
    selectedFile.value = null
    fileList.value = []
    return false
  }
  selectedFile.value = file.raw
  fileList.value = [file]
}

const handleDialogClose = (done: () => void) => {
  if (uploading.value) {
    ElMessage.warning('升级进行中，请稍候...')
    return
  }
  done()
}

const handleCancel = () => {
  visible.value = false
}

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// --- submit ---
const submitUpgrade = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择升级文件')
    return
  }

  if (!props.isBatch && !props.currentDevice) {
    ElMessage.warning('未选择目标设备')
    return
  }

  // 确认升级
  try {
    let message = props.isBatch
      ? `确认要批量升级${props.multipleSelection.length}个设备吗？`
      : `确定要对设备 ${props.currentDevice.id} (${props.currentDevice.ip}) 进行升级吗？`

    await ElMessageBox.confirm(message, '确认升级', {
      confirmButtonText: '确定升级',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }

  uploading.value = true

  try {
    // 0. 确保已选择网卡IP
    const ipReady = await ensureIPSelected()
    if (!ipReady) {
      uploading.value = false
      return
    }

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

    if (!props.isBatch) {
      // 3. 发送升级命令到设备
      const upgradeResult = await window.electronAPI.sendUpgradeCommand(
          props.currentDevice.ip,
          selectedFile.value.name,
          { port: 8080, fileSize: selectedFile.value.size }
      )

      if (!upgradeResult.success) {
        throw new Error(`升级命令发送失败: ${upgradeResult.error}`)
      }

      ElMessage.success({
        message: `升级命令已发送！设备可以从以下地址下载文件：${upgradeResult.downloadUrl}`,
        duration: 8000,
        showClose: true
      })

      console.log('📤 升级文件下载地址:', upgradeResult.downloadUrl)

      // 使用mqtt推送升级
      const topic = `/server/cmd/${props.currentDevice.id}`
      const message = JSON.stringify({
        type: 'ota',
        downloadUrl: upgradeResult.downloadUrl
      })
      window.electronAPI.mqttPublish(topic, message, { qos: 1 })

      // 关闭对话框 → 通知父级打开终端
      visible.value = false
      emit('terminal-open', props.currentDevice)
    } else {
      // 批量推送设备升级
      for (const device of props.multipleSelection) {
        try {
          const upgradeResult = await window.electronAPI.sendUpgradeCommand(
              device.ip,
              selectedFile.value.name,
              { port: 8080, fileSize: selectedFile.value.size }
          )

          if (!upgradeResult.success) {
            throw new Error(upgradeResult.error)
          }

          const topic = `/server/cmd/${device.id}`
          const message = JSON.stringify({ type: 'ota', downloadUrl: upgradeResult.downloadUrl })
          await window.electronAPI.mqttPublish(topic, message, { qos: 1 })

          ElMessage.success({
            message: `设备 ${device.id} 升级命令已发送`,
            duration: 5000
          })
        } catch (err: any) {
          console.error(`设备 ${device.id} 升级失败:`, err)
          ElMessage.error(`设备 ${device.id} 升级失败: ${err.message}`)
        }
      }
    }

    // 关闭对话框
    visible.value = false

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
</script>

<style scoped>
/* ===== 升级对话框 ===== */
.upgrade-content { padding: 10px 0; }

.upgrade-device-info {
  background: rgba(59,130,246,0.1);
  border: 1px solid rgba(59,130,246,0.2);
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 20px;
  border-left: 4px solid #3b82f6;
}

.file-info {
  margin-top: 15px;
  padding: 12px 16px;
  background: rgba(16,185,129,0.1);
  border: 1px solid rgba(16,185,129,0.2);
  border-radius: 12px;
}

/* 对话框 — 暗色终端风格（:teleported="false"，scoped :deep() 可穿透） */
:deep(.el-dialog) {
  background: #161b22 !important;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 20px !important;
  box-shadow: 0 24px 64px rgba(0,0,0,0.7) !important;
}
:deep(.el-dialog__header) {
  border-bottom: 1px solid rgba(255,255,255,0.08);
  padding: 20px 24px 16px;
  background: #161b22 !important;
  margin-right: 0;
}
:deep(.el-dialog__title) {
  color: #e0e0e0 !important;
  font-weight: 700;
  font-size: 16px;
}
:deep(.el-dialog__headerbtn .el-dialog__close) {
  color: #94a3b8 !important;
}
:deep(.el-dialog__headerbtn:hover .el-dialog__close) {
  color: #e0e0e0 !important;
}
:deep(.el-dialog__body) {
  color: #cbd5e1;
  padding: 20px 24px;
  background: #161b22 !important;
}
:deep(.el-dialog__footer) {
  background: #161b22 !important;
  padding: 16px 24px 20px;
  overflow: visible;
}

/* el-alert 暗色适配 */
:deep(.el-alert--info) {
  background: rgba(96,165,250,0.1) !important;
  border: 1px solid rgba(96,165,250,0.2) !important;
}
:deep(.el-alert__title) {
  color: #93c5fd !important;
}

/* el-upload 暗色适配 */
:deep(.el-upload-dragger) {
  background: rgba(255,255,255,0.03) !important;
  border: 1px dashed rgba(255,255,255,0.15) !important;
}
:deep(.el-upload-dragger:hover) {
  border-color: rgba(96,165,250,0.5) !important;
}
:deep(.el-upload__text) {
  color: #94a3b8 !important;
}
:deep(.el-upload__text em) {
  color: #60a5fa !important;
}
:deep(.el-upload__tip) {
  color: #64748b !important;
}

/* 弹窗内按钮 Lumina 发光样式 */
:deep(.el-dialog__footer .lumina-btn) {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  box-shadow: 0 2px 12px rgba(59,130,246,0.35), 0 0 30px rgba(59,130,246,0.1) !important;
  color: #fff !important;
}
:deep(.el-dialog__footer .lumina-btn:hover) {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  transform: translateY(-2px);
  z-index: 10;
  box-shadow: 0 6px 24px rgba(59,130,246,0.5), 0 0 50px rgba(59,130,246,0.2) !important;
}
:deep(.el-dialog__footer .lumina-btn--ghost) {
  background: transparent !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
  color: #a0aec0 !important;
  box-shadow: none !important;
}
:deep(.el-dialog__footer .lumina-btn--ghost:hover) {
  background: rgba(255,255,255,0.06) !important;
  border-color: rgba(255,255,255,0.25) !important;
  color: #e0e0e0 !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important;
}
</style>

<!-- 升级弹窗主题适配（全局样式，不受Teleport/scope影响） -->
<style>
/* ===== 暗夜模式：白色文字 + 深色对话框 ===== */
html.dark .upgrade-device-info p,
html.dark .upgrade-device-info strong,
html.dark .file-info p,
html.dark .file-info strong {
  color: #ffffff !important;
}
html.dark .upgrade-content .el-alert__title {
  color: #e0e0e0 !important;
}
html.dark .upgrade-content .el-upload__text {
  color: #cbd5e1 !important;
}
html.dark .upgrade-content .el-upload__text em {
  color: #60a5fa !important;
}
html.dark .upgrade-content .el-upload__tip {
  color: #94a3b8 !important;
}

/* ===== 蓝绿模式：黑色文字 + 亮色对话框 ===== */
html:not(.dark) .upgrade-dialog .el-dialog {
  background: #ffffff !important;
}
html:not(.dark) .upgrade-dialog .el-dialog__header {
  background: #ffffff !important;
  border-bottom: 1px solid #ebeef5 !important;
}
html:not(.dark) .upgrade-dialog .el-dialog__title {
  color: #303133 !important;
}
html:not(.dark) .upgrade-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #909399 !important;
}
html:not(.dark) .upgrade-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: #303133 !important;
}
html:not(.dark) .upgrade-dialog .el-dialog__body {
  background: #ffffff !important;
  color: #606266 !important;
}
html:not(.dark) .upgrade-dialog .el-dialog__footer {
  background: #ffffff !important;
}

html:not(.dark) .upgrade-device-info p,
html:not(.dark) .upgrade-device-info strong {
  color: #1f2937 !important;
}
html:not(.dark) .file-info p,
html:not(.dark) .file-info strong {
  color: #1f2937 !important;
}
html:not(.dark) .upgrade-content .el-alert__title {
  color: #303133 !important;
}
html:not(.dark) .upgrade-content .el-upload__text {
  color: #606266 !important;
}
html:not(.dark) .upgrade-content .el-upload__text em {
  color: var(--el-color-primary) !important;
}
html:not(.dark) .upgrade-content .el-upload__tip {
  color: #909399 !important;
}

/* 蓝绿模式：el-alert 信息框 */
html:not(.dark) .upgrade-content .el-alert--info {
  background: var(--el-color-primary-light-9) !important;
  border: 1px solid var(--el-color-primary-light-5) !important;
}

/* 蓝绿模式：el-upload 拖拽区 */
html:not(.dark) .upgrade-content .el-upload-dragger {
  background: #fafafa !important;
  border: 1px dashed #dcdfe6 !important;
}
html:not(.dark) .upgrade-content .el-upload-dragger:hover {
  border-color: var(--el-color-primary) !important;
}
</style>
