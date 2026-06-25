<template>
  <div class="dtu-list-container">

    <!-- 搜索 -->
    <div class="device-search">
      <el-input
          v-model="searchText"
          placeholder="输入设备号/设备名称/IP搜索"
          clearable
          class="search-input"
      />

      <el-radio-group v-model="networkTypeFilter" size="default">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="ETH">ETH</el-radio-button>
        <el-radio-button value="WiFi">WiFi</el-radio-button>
      </el-radio-group>

      <button class="lumina-btn" @click="searchDevices">搜索</button>
      <button class="lumina-btn" :disabled="multipleSelection.length === 0" @click="batchUpgrade">
        批量升级({{multipleSelection.length}})
      </button>
    </div>

    <div class="device-count">
      当前设备数量：{{ filteredDevices.length }}
    </div>

    <!-- 设备表格 -->
    <el-table
        :data="filteredDevices"
        style="width:100%"
        stripe
        border
        :row-style="{ height: '56px' }"
        @selection-change="handleSelectionChange"
        :fit="true"
        :show-header="true"
    >
    <el-table-column type="selection" width="55" />
    <el-table-column prop="name" label="设备名称" width="200" resizable />
    <el-table-column prop="id" label="设备号" width="140" resizable />
    <el-table-column prop="ip" label="IP 地址" width="140" resizable />
    <el-table-column prop="firmware" label="固件版本" width="100" resizable />
    <el-table-column label="网络类型" width="100" align="center">
      <template #default="{ row }">
        <el-tooltip :content="row.networkType || '未知'" placement="top" effect="dark">
          <img
            v-if="getNetworkIcon(row.networkType)"
            :src="getNetworkIcon(row.networkType)"
            class="network-img"
            :alt="row.networkType"
          />
          <span v-else>{{ row.networkType || '-' }}</span>
        </el-tooltip>
      </template>
    </el-table-column>
    <el-table-column label="信号" width="140" resizable>
      <template #default="{ row }">
        <template v-if="row.RSSI !== null && row.RSSI !== undefined">
          <el-tooltip :content="getSignalTooltip(row.RSSI)" placement="top" effect="dark" raw-content>
            <div class="signal-cell">
              <img
                v-if="getWifiIcon(row.RSSI)"
                :src="getWifiIcon(row.RSSI)"
                class="wifi-img"
                alt="signal"
              />
              <span class="signal-value" :style="{ color: getSignalColor(row.RSSI) }">{{ row.RSSI }} dBm</span>
            </div>
          </el-tooltip>
        </template>
        <span v-else class="signal-na">N/A</span>
      </template>
    </el-table-column>
    <el-table-column prop="mac" label="MAC地址" width="180" resizable />
    <el-table-column label="运行时间" width="200" resizable>
      <template #default="{ row }">
        {{ formatRuntime(row.runtime) }}
      </template>
    </el-table-column>
    <el-table-column prop="heart_interval" label="心跳(s)" width="80" resizable />
    <el-table-column label="操作" width="220" align="center">
      <template #default="{ row }">
        <div class="action-buttons">
          <button class="lumina-btn lumina-btn--sm" @click="goToConfig(row)">
            设备管理
          </button>
          <button class="lumina-btn lumina-btn--warning lumina-btn--sm" @click="openUpgradeDialog(row,false)">
            升级
          </button>
          <button class="lumina-btn lumina-btn--success lumina-btn--sm" @click="openTerminalDialog(row)">
            终端
          </button>
        </div>
      </template>
    </el-table-column>
  </el-table>
  </div>

  <!-- 升级对话框 -->
  <UpgradeDialog
      v-if="upgradeDialogVisible"
      v-model="upgradeDialogVisible"
      :current-device="currentDevice"
      :is-batch="isBatch"
      :multiple-selection="multipleSelection"
      @terminal-open="openTerminalDialog"
  />

  <!-- 终端对话框 -->
  <TerminalDialog
      v-if="terminalDialogVisible"
      v-model="terminalDialogVisible"
      :current-device="currentDevice"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import UpgradeDialog from '../components/UpgradeDialog.vue'
import TerminalDialog from '../components/TerminalDialog.vue'
import {
  getSignalColor,
  getSignalTooltip,
  getWifiIcon,
  getNetworkIcon,
  formatRuntime,
} from '../composables/useSignal'

const router = useRouter()

// ========== 设备列表 ==========
const searchText = ref('')
const networkTypeFilter = ref('')
const filteredDevices = ref<any[]>([])
const multipleSelection = ref<any[]>([])

function handleSelectionChange(val: any[]) {
  multipleSelection.value = val
}

const setList = (list: any[]) => {
  let newList: any[] = []
  for (let i = 0; i < list.length; i++) {
    let obj = list[i]
    let pd = true

    // 过滤关键字
    if (searchText.value && searchText.value !== '') {
      if (obj.name.indexOf(searchText.value) === -1
          && obj.id.indexOf(searchText.value) === -1
          && obj.ip.indexOf(searchText.value) === -1) {
        pd = false
      }
    }

    // 过滤网络类型
    if (networkTypeFilter.value && networkTypeFilter.value !== '') {
      if (obj.networkType.indexOf(networkTypeFilter.value) === -1) {
        pd = false
      }
    }

    if (pd) newList.push(obj)
  }
  filteredDevices.value = newList
}

function searchDevices() {
  setList(filteredDevices.value)
}

function goToConfig(device: any) {
  console.log('跳转配置页面', JSON.stringify(device))
  router.push({
    name: 'DtuConfig',
    query: { device: JSON.stringify(device) }
  })
}

// ========== 升级 / 终端 ==========
const upgradeDialogVisible = ref(false)
const terminalDialogVisible = ref(false)
const currentDevice = ref<any>(null)
const isBatch = ref(false)

function openUpgradeDialog(device: any = null, batch: boolean) {
  currentDevice.value = device
  isBatch.value = batch
  upgradeDialogVisible.value = true
}

function batchUpgrade() {
  console.log('批量升级设备:', multipleSelection.value)
  openUpgradeDialog(null, true)
}

function openTerminalDialog(device: any) {
  currentDevice.value = device
  terminalDialogVisible.value = true
}

// 批量升级后清空选择
watch(upgradeDialogVisible, (newVal, oldVal) => {
  if (oldVal && !newVal && isBatch.value) {
    multipleSelection.value = []
    isBatch.value = false
  }
})

// ========== 生命周期 ==========
onMounted(() => {
  window.electronAPI.onDeviceDiscovered((list: any[]) => {
    if (!multipleSelection.value || !multipleSelection.value.length || multipleSelection.value.length === 0) {
      setList([...list])
    }
  })
})
</script>

<style scoped>
/* ============================================
   Lumina UI 风格 — 设备列表页
   ============================================ */

.dtu-list-container {
  padding: 24px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  position: relative;
  background: linear-gradient(160deg, #0a0f1a 0%, #111827 40%, #0d1520 100%);
}

.dtu-list-container::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background:
    radial-gradient(ellipse at 20% 50%, rgba(64,158,255,0.06) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 60% 80%, rgba(6,182,212,0.04) 0%, transparent 50%);
  pointer-events: none;
  z-index: 0;
}

/* ===== 搜索栏 ===== */
.device-search {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px;
  background: rgba(17,24,39,0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  box-shadow:
    0 4px 24px rgba(0,0,0,0.4),
    inset 0 1px 0 rgba(255,255,255,0.04);
  margin-bottom: 20px;
  flex-shrink: 0;
  overflow: visible;
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}
.device-search:focus-within {
  border-color: rgba(96,165,250,0.4);
  box-shadow:
    0 4px 32px rgba(0,0,0,0.5),
    0 0 30px rgba(96,165,250,0.08),
    inset 0 1px 0 rgba(255,255,255,0.04);
}
.search-input { width: 280px; }

:deep(.device-search .el-input__wrapper) {
  background: rgba(255,255,255,0.05) !important;
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  transition: all 0.25s ease;
}
:deep(.device-search .el-input__wrapper:hover) {
  border-color: rgba(96,165,250,0.4) !important;
  box-shadow: 0 0 12px rgba(96,165,250,0.1) !important;
}
:deep(.device-search .el-input__wrapper.is-focus) {
  border-color: rgba(96,165,250,0.6) !important;
  box-shadow: 0 0 16px rgba(96,165,250,0.15) !important;
}
:deep(.device-search .el-input__inner) {
  color: #e0e0e0 !important;
}
:deep(.device-search .el-input__inner::placeholder) {
  color: rgba(255,255,255,0.3) !important;
}

:deep(.device-search .el-radio-button__inner) {
  background: rgba(255,255,255,0.05) !important;
  border-color: rgba(255,255,255,0.1) !important;
  color: #a0aec0 !important;
  transition: all 0.25s ease;
}
:deep(.device-search .el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: rgba(96,165,250,0.2) !important;
  border-color: rgba(96,165,250,0.5) !important;
  color: #93c5fd !important;
  box-shadow: 0 0 12px rgba(96,165,250,0.2) !important;
}

/* ===== Lumina 发光按钮（全局定义在 desktop.css） ===== */

/* 设备数量 */
.device-count {
  position: relative;
  z-index: 2;
  font-size: 16px;
  font-weight: 700;
  color: #93c5fd;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.device-count::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 10px rgba(34,197,94,0.6);
  animation: pulse-dot 2s ease-in-out infinite;
}
@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 6px rgba(34,197,94,0.4); }
  50% { box-shadow: 0 0 16px rgba(34,197,94,0.8); }
}

/* ===== 表格 ===== */
:deep(.el-table) {
  position: relative;
  z-index: 2;
  flex: 1;
  min-height: 0;
  border-radius: 16px !important;
  background: rgba(17,24,39,0.7) !important;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow:
    0 8px 32px rgba(0,0,0,0.5),
    inset 0 1px 0 rgba(255,255,255,0.03);
  overflow: hidden;
}

:deep(.el-table__inner-wrapper) {
  height: 100%;
  display: flex;
  flex-direction: column;
}
:deep(.el-table__body-wrapper) {
  flex: 1;
  overflow-y: auto !important;
}

:deep(.el-table th.el-table__cell) {
  background: rgba(255,255,255,0.04) !important;
  font-weight: 600;
  color: #93c5fd !important;
  height: 50px;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255,255,255,0.08) !important;
  font-size: 13px;
  text-transform: uppercase;
}

:deep(.el-table td.el-table__cell) {
  background: transparent !important;
  color: #cbd5e1 !important;
  border-bottom: 1px solid rgba(255,255,255,0.04) !important;
  overflow: visible !important;
}

:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: rgba(255,255,255,0.02) !important;
}

:deep(.el-table__body tr:hover > td) {
  background: rgba(96,165,250,0.08) !important;
  box-shadow: inset 3px 0 0 #60a5fa;
  transition: all 0.2s ease;
}

:deep(.el-table__body tr.current-row > td) {
  background: rgba(96,165,250,0.12) !important;
}

:deep(.el-checkbox__inner) {
  border-color: rgba(255,255,255,0.25) !important;
  background: rgba(255,255,255,0.05) !important;
}
:deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background: #3b82f6 !important;
  border-color: #3b82f6 !important;
  box-shadow: 0 0 8px rgba(59,130,246,0.4);
}

:deep(.el-table__header-wrapper th) { text-align: center !important; }
:deep(.el-table__body-wrapper td) { text-align: center; }
:deep(.el-table__header-wrapper th:nth-child(2)),
:deep(.el-table__body-wrapper td:nth-child(2)) { text-align: left !important; }

.el-table .el-table__row { height: 56px; }

/* 信号 */
.signal-cell { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.wifi-img { width: 18px; height: 18px; flex-shrink: 0; }
.network-img { width: 22px; height: 22px; flex-shrink: 0; }
.signal-value { font-weight: 600; font-size: 13px; white-space: nowrap; }
.signal-na { color: #64748b; font-size: 13px; }

/* 操作按钮组 */
.action-buttons { display: flex; gap: 6px; justify-content: center; padding: 4px 0; }
</style>
