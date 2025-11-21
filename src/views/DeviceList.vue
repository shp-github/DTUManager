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
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
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

// 示例选中值
const selectedNetwork = ref<'tcp' | 'mqtt'>('tcp')
</script>

<style scoped>
/* 样式保持原来 */
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
</style>
