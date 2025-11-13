<template>
  <div>
    <el-form label-width="120px">
      <el-form-item label="设备名称">
        <el-input v-model="modelValue.name" />
      </el-form-item>
      <el-form-item label="采集周期">
        <el-input-number v-model="modelValue.interval" :min="1" />
      </el-form-item>
    </el-form>
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
