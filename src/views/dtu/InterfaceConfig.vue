<template>
  <div class="interface-config">
    <el-card class="config-card" shadow="hover">
      <h3 class="section-title">
        接口配置
      </h3>

      <el-form label-width="120px" :model="modelValue" class="config-form">
        <el-form-item label="串口模式">
          <el-select v-model="modelValue.mode" placeholder="请选择串口模式">
            <el-option label="RS485" value="rs485" />
            <el-option label="RS232" value="rs232" />
            <el-option label="TTL" value="ttl" />
          </el-select>
        </el-form-item>

        <el-form-item label="波特率">
          <el-select v-model="modelValue.baudRate" placeholder="请选择波特率">
            <el-option label="9600" value="9600" />
            <el-option label="19200" value="19200" />
            <el-option label="38400" value="38400" />
            <el-option label="57600" value="57600" />
            <el-option label="115200" value="115200" />
          </el-select>
        </el-form-item>

        <el-form-item label="数据位">
          <el-select v-model="modelValue.dataBits">
            <el-option label="7 位" value="7" />
            <el-option label="8 位" value="8" />
          </el-select>
        </el-form-item>

        <el-form-item label="停止位">
          <el-select v-model="modelValue.stopBits">
            <el-option label="1 位" value="1" />
            <el-option label="2 位" value="2" />
          </el-select>
        </el-form-item>

        <el-form-item label="校验方式">
          <el-select v-model="modelValue.parity">
            <el-option label="无校验" value="none" />
            <el-option label="奇校验" value="odd" />
            <el-option label="偶校验" value="even" />
          </el-select>
        </el-form-item>

        <el-form-item label="使能接口">
          <el-switch v-model="modelValue.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
defineProps({
  modelValue: {
    type: Object,
    required: true
  }
})
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
  transition: box-shadow 0.2s;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
}

.config-form {
  max-width: 500px;
}
</style>
