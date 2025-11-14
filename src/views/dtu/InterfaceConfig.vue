<template>
  <div class="interface-config">
    <el-card class="config-card" shadow="hover">
      <h3 class="section-title">接口配置</h3>

      <div v-for="(port, index) in ports" :key="index" class="port-item">
        <el-form label-width="120px" :model="port" class="config-form">
          <el-form-item label="名称">
            <el-input v-model="port.name" readonly />
          </el-form-item>

          <el-form-item label="启用接口">
            <el-switch v-model="port.enabled" active-text="启用" inactive-text="禁用" />
          </el-form-item>

          <el-form-item label="串口模式">
            <el-select v-model="port.mode" placeholder="请选择串口模式">
              <el-option label="RS485" value="rs485" />
              <el-option label="RS232" value="rs232" />
              <el-option label="TTL" value="ttl" />
            </el-select>
          </el-form-item>

          <el-form-item label="波特率">
            <el-select v-model="port.baudRate" placeholder="请选择波特率">
              <el-option label="9600" value="9600" />
              <el-option label="19200" value="19200" />
              <el-option label="38400" value="38400" />
              <el-option label="57600" value="57600" />
              <el-option label="115200" value="115200" />
            </el-select>
          </el-form-item>

          <el-form-item label="数据位">
            <el-select v-model="port.dataBits">
              <el-option label="7 位" value="7" />
              <el-option label="8 位" value="8" />
            </el-select>
          </el-form-item>

          <el-form-item label="停止位">
            <el-select v-model="port.stopBits">
              <el-option label="1 位" value="1" />
              <el-option label="2 位" value="2" />
            </el-select>
          </el-form-item>

          <el-form-item label="校验方式">
            <el-select v-model="port.parity">
              <el-option label="无校验" value="none" />
              <el-option label="奇校验" value="odd" />
              <el-option label="偶校验" value="even" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, toRefs } from 'vue'

interface Port {
  name: string
  enabled: boolean
  mode: string
  baudRate: number
  dataBits: number
  stopBits: number
  parity: string
}

// 接收 v-model 数据
const props = defineProps<{ modelValue: Port[] }>()
const emit = defineEmits(['update:modelValue'])

// 初始化 ports，如果 modelValue 没有值，则默认生成两条串口，且默认启用状态为禁用
const ports = reactive<Port[]>(props.modelValue.length ? props.modelValue : [
  { name: '串口1', enabled: false, mode: 'rs485', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
  { name: '串口2', enabled: false, mode: 'rs485', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' }
]);

console.log('初始化串口配置:', ports); // 打印初始的 ports 数据
console.log('接收到的初始化串口配置:', props.modelValue); // 打印接收到的 props 数据

// 监听 ports 变化，回传给父组件
watch(
    ports,
    (newVal) => {
      console.log('串口配置已更新:', newVal); // 打印新的 ports 数据
      emit('update:modelValue', newVal);
    },
    { deep: true }
);

// 开关状态变化时打印
const handleSwitchChange = (port: Port) => {
  console.log(`串口 "${port.name}" 的启用状态已更改为: ${port.enabled ? '启用' : '禁用'}`);
}

// 波特率变化时打印
const handleBaudRateChange = (port: Port) => {
  console.log(`串口 "${port.name}" 的波特率已更改为: ${port.baudRate}`);
}

// 提交数据时打印
const handleSubmit = () => {
  console.log('提交的串口配置数据:', ports);
}
</script>

<style scoped>
.interface-config {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.config-card {
  padding: 20px;
  border-radius: 10px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

.port-item {
  margin-bottom: 20px;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}
</style>
