<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { Setting, QuestionFilled } from '@element-plus/icons-vue'
import { useRefreshInterval } from '../composables/useRefreshInterval'

const { electronAPI } = window as any

// 本地设置项
const settings = ref({
  logRetentionDays: 30,
})

// 刷新间隔（通过 composable 共享给 DeviceList 等页面）
const { interval: autoRefreshInterval } = useRefreshInterval()

// HTTP 升级设置
const httpUpgradeEnabled = ref(true)
const httpUpgradePassword = ref('')

// 启动时从后端加载 HTTP 升级配置
onMounted(async () => {
  try {
    if (electronAPI?.getHttpUpgradeConfig) {
      const config = await electronAPI.getHttpUpgradeConfig()
      httpUpgradeEnabled.value = config.enabled
      httpUpgradePassword.value = config.password
    }
  } catch { /* 后端尚未就绪时保持默认值 */ }
})

// 监听 HTTP 升级设置变化，同步到后端
watch([httpUpgradeEnabled, httpUpgradePassword], ([enabled, password]) => {
  try {
    electronAPI?.setHttpUpgradeConfig?.(enabled, password)
  } catch { /* ignore */ }
}, { immediate: false })

const logRetentionOptions = [
  { label: '7天', value: 7 },
  { label: '15天', value: 15 },
  { label: '30天', value: 30 },
  { label: '60天', value: 60 },
  { label: '90天', value: 90 },
]

const refreshIntervalOptions = [
  { label: '1秒', value: 1000 },
  { label: '3秒', value: 3000 },
  { label: '5秒', value: 5000 },
  { label: '10秒', value: 10000 },
]
</script>

<template>
  <div class="local-settings">
    <h2 class="page-title">本地设置</h2>

    <div class="settings-grid">
      <!-- 日志设置 -->
      <el-card class="settings-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>日志设置</span>
          </div>
        </template>
        <div class="settings-list">
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">日志保留天数</span>
              <span class="setting-desc">超过保留期限的日志将自动清理</span>
            </div>
            <el-select v-model="settings.logRetentionDays" size="small" style="width: 120px">
              <el-option v-for="opt in logRetentionOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </div>
        </div>
      </el-card>

      <!-- 刷新设置 -->
      <el-card class="settings-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>数据刷新</span>
          </div>
        </template>
        <div class="settings-list">
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">自动刷新间隔</span>
              <span class="setting-desc">设备列表等页面的数据刷新频率</span>
            </div>
            <el-select v-model="autoRefreshInterval" size="small" style="width: 120px">
              <el-option v-for="opt in refreshIntervalOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
          </div>
        </div>
      </el-card>

      <!-- HTTP 升级设置 -->
      <el-card class="settings-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <el-icon><Setting /></el-icon>
            <span>HTTP 升级</span>
            <el-tooltip
              placement="top"
              effect="dark"
              raw-content
            >
              <template #content>
                <div style="max-width: 300px; line-height: 1.6;">
                  通过 HTTP API 触发设备固件升级。<br/>
                  接口地址：<b>POST /api/upgrade</b><br/>
                  请求参数：<br/>
                  &nbsp;&nbsp;<b>deviceId</b> — 设备号<br/>
                  &nbsp;&nbsp;<b>firmwarePath</b> — 固件文件路径<br/>
                  设置密码后，外部调用需在请求 Body 中附带 <b>password</b> 字段。
                </div>
              </template>
              <el-icon class="help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </template>
        <div class="settings-list">
          <div class="setting-item">
            <div class="setting-info">
              <span class="setting-label">启用 HTTP 升级</span>
              <span class="setting-desc">开启后可通过 HTTP API 触发设备 OTA 升级</span>
            </div>
            <el-switch v-model="httpUpgradeEnabled" />
          </div>
          <div class="setting-item" :class="{ 'setting-disabled': !httpUpgradeEnabled }">
            <div class="setting-info">
              <span class="setting-label">访问密码</span>
              <span class="setting-desc">留空则不校验密码；设置后外部调用需提供密码</span>
            </div>
            <el-input
              v-model="httpUpgradePassword"
              type="password"
              show-password
              placeholder="留空 = 无密码"
              size="small"
              style="width: 180px"
              class="pwd-input"
              :disabled="!httpUpgradeEnabled"
            />
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.local-settings {
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

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}

.settings-card {
  border-radius: 8px;
}

.settings-card :deep(.el-card__body) {
  padding: 0;
}

.settings-card :deep(.el-card__header) {
  padding: 14px 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.card-header .el-icon {
  font-size: 18px;
  color: var(--el-color-primary, #409eff);
}

/* 帮助图标 */
.help-icon {
  margin-left: auto;
  font-size: 16px;
  color: #909399;
  cursor: help;
  transition: color 0.3s ease;
}

.help-icon:hover {
  color: var(--el-color-primary, #409eff);
}

.settings-list {
  padding: 0;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid #ebeef5;
  transition: opacity 0.3s ease;
}

.setting-item:last-child {
  border-bottom: none;
}

/* 禁用态 */
.setting-disabled {
  opacity: 0.45;
  pointer-events: none;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  margin-right: 16px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.setting-desc {
  font-size: 12px;
  color: #909399;
}

/* 密码输入框醒目边框 */
.pwd-input :deep(.el-input__wrapper) {
  border-width: 2px;
  box-shadow: 0 0 0 2px var(--el-color-primary, #409eff);
}

.pwd-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 2px var(--el-color-primary-light-3, #66b1ff);
}

.pwd-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px var(--el-color-primary, #409eff);
}

html.dark .pwd-input :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 2px var(--el-color-primary, #60a5fa);
}

html.dark .pwd-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 2px var(--el-color-primary-light-3, #93c5fd);
}

/* ============ 暗夜模式 ============ */
html.dark .page-title {
  color: #e5e7eb;
}

html.dark .card-header {
  color: #e5e7eb;
}

html.dark .help-icon {
  color: #6b7280;
}

html.dark .help-icon:hover {
  color: var(--el-color-primary, #60a5fa);
}

html.dark .setting-item {
  border-bottom-color: #333;
}

html.dark .setting-label {
  color: #e5e7eb;
}

html.dark .setting-desc {
  color: #9ca3af;
}
</style>
