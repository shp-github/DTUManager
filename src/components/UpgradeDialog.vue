<template>
  <el-dialog
      v-model="visible"
      :title="isBatch ? '批量升级' : '设备升级'"
      width="500px"
      :before-close="handleDialogClose"
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
  background: rgba(59,130,246,0.08);
  border: 1px solid rgba(59,130,246,0.15);
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 20px;
  border-left: 4px solid #3b82f6;
}
.upgrade-device-info p { margin: 6px 0; color: #cbd5e1; }

.file-info {
  margin-top: 15px;
  padding: 12px 16px;
  background: rgba(16,185,129,0.08);
  border: 1px solid rgba(16,185,129,0.15);
  border-radius: 12px;
}
.file-info p { margin: 5px 0; color: #cbd5e1; }

/* 对话框样式 */
:deep(.el-dialog) {
  background: rgba(17,24,39,0.95) !important;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.08) !important;
  border-radius: 20px !important;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6) !important;
}
:deep(.el-dialog__header) {
  border-bottom: 1px solid rgba(255,255,255,0.06);
  padding: 20px 24px 16px;
}
:deep(.el-dialog__title) {
  color: #e0e0e0 !important;
  font-weight: 700;
}
:deep(.el-dialog__body) {
  color: #cbd5e1;
  padding: 20px 24px;
}
:deep(.el-dialog__footer) {
  padding: 16px 24px 20px;
  overflow: visible;
}
</style>
