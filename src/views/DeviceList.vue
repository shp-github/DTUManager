<template>
  <div class="dtu-list-container">
    <h2 class="title">DTU 列表</h2>

    <!-- 搜索 -->
    <div class="device-search">
      <el-input
          v-model="searchText"
          placeholder="输入设备ID或IP搜索"
          clearable
          class="search-input"
      />
      <el-button type="primary" icon="el-icon-search" @click="searchDevices">
        搜索
      </el-button>
    </div>

    <!-- 设备表格 -->
    <el-table :data="filteredDevices" style="width:100%" stripe border>
      <el-table-column prop="id" label="设备 ID" width="180" />
      <el-table-column prop="ip" label="IP 地址" width="160" />
      <el-table-column prop="firmware" label="固件版本" width="120" />
      <el-table-column prop="heart_interval" label="心跳(s)" width="140" />
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="goToConfig(row)">
            配置
          </el-button>
        </template>
      </el-table-column>
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
  router.push({
    name: 'DtuConfig',
    query: { device: JSON.stringify(device) } // 序列化对象
  })
}

// 监听 Electron UDP 发现设备
onMounted(() => {
  window.electronAPI.onDeviceDiscovered((list: any[]) => {
    devices.value = list
    filteredDevices.value = list
  })
})
</script>

<style scoped>
.dtu-list-container { padding: 20px; background: #fff; }
.title { font-size: 22px; font-weight: 700; margin-bottom: 15px; }
.device-search { display: flex; margin-bottom: 10px; }
.search-input { width: 250px; margin-right: 10px; }
</style>
