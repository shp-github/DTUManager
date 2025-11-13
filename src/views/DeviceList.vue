<template>
  <div class="dtu-list-container">
    <h2 class="title">DTU 列表</h2>

    <!-- 搜索 -->
    <div class="device-search">
      <el-input
          v-model="searchText"
          placeholder="搜索设备 ID 或 IP"
          clearable
          class="search-input"
      />
      <el-button type="primary" icon="el-icon-search" @click="searchDevices">搜索</el-button>
    </div>

    <!-- 设备表格 -->
    <el-table
        :data="filteredDevices"
        style="width: 100%; margin-top: 10px"
        stripe
        border
    >
      <el-table-column prop="id" label="设备 ID" width="180" />
      <el-table-column prop="ip" label="IP 地址" width="160" />
      <el-table-column prop="firmware" label="固件版本" width="120" />
      <el-table-column prop="heart_interval" label="心跳间隔(s)" width="140" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button
              type="primary"
              size="small"
              @click="goToConfig(row)"
          >配置</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// 模拟设备数据
const devices = ref([
  { id: 'DTU001', ip: '192.168.1.10', firmware: 'v1.0', heart_interval: 20 },
  { id: 'DTU002', ip: '192.168.1.11', firmware: 'v1.1', heart_interval: 15 },
  { id: 'DTU003', ip: '192.168.1.12', firmware: 'v1.0', heart_interval: 30 },
])

const searchText = ref('')

// 搜索过滤
const filteredDevices = computed(() => {
  if (!searchText.value) return devices.value
  return devices.value.filter(d => d.id.includes(searchText.value) || d.ip.includes(searchText.value))
})

const searchDevices = () => {
  console.log('搜索:', searchText.value)
}

// 跳转到配置页
const goToConfig = (device: any) => {
  router.push({ name: 'DtuConfig', params: { deviceId: device.id } })
}
</script>

<style scoped>
.dtu-list-container {
  padding: 20px;
  background-color: #ffffff;
}

.title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 15px;
}

.device-search {
  display: flex;
  margin-bottom: 10px;
}

.search-input {
  width: 250px;
  margin-right: 10px;
}
</style>
