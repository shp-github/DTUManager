<template>
  <div class="interface-config">
    <el-card class="config-card" shadow="hover">
      <h3 class="section-title">接口配置</h3>

      <div v-for="(port, index) in uarts" :key="index" class="port-item">
        <el-form label-width="120px" :model="port" class="config-form">
          <el-form-item label="名称">
            <el-input :disabled="index==1" v-model="port.name" readonly />
          </el-form-item>

          <el-form-item label="启用接口">
            <el-switch :disabled="index==1" v-model="port.enabled" active-text="启用" inactive-text="禁用" />
          </el-form-item>

          <el-form-item label="波特率">
            <el-select :disabled="index==1" v-model.number="port.baud" placeholder="请选择波特率">
              <el-option  v-for="b in baudList" :key="b" :label="String(b)" :value="b" />
            </el-select>
          </el-form-item>

          <el-form-item label="数据位">
            <el-select :disabled="index==1" v-model.number="port.dataBits">
              <el-option label="7 位" :value="7" />
              <el-option label="8 位" :value="8" />
            </el-select>
          </el-form-item>

          <el-form-item label="停止位">
            <el-select :disabled="index==1" v-model.number="port.stopBits">
              <el-option :value="1" label="1 位" />
              <el-option :value="2" label="2 位" />
            </el-select>
          </el-form-item>

          <el-form-item label="校验方式">
            <el-select :disabled="index==1" v-model="port.parityStr">
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
import { reactive, watch } from 'vue'

/**
 * 只做串口基础配置
 * 不包含 protocol / role
 */

// props & emits
const props = defineProps<{ modelValue?: any }>()
const emit = defineEmits(['update:modelValue'])

// 波特率候选
const baudList = [9600, 19200, 38400, 57600, 115200]

// 默认配置（子组件内部使用）
function defaultPort(name: string) {
  return {
    name,
    enabled: name === 'UART1',
    baud: 9600,
    dataBits: 8,
    stopBits: 1,
    parityStr: 'none'   // UI 内部用字符串
  }
}

// parity 字符串 <-> 数字 映射（MCU 0/1/2）
const parityStrToNum = (s: string) =>
    s === 'odd' ? 1 : s === 'even' ? 2 : 0

const parityNumToStr = (n: number) =>
    n === 1 ? 'odd' : n === 2 ? 'even' : 'none'

// 把父传参数规范化
function normalizeFromParent(parentPort: any) {
  if (!parentPort) return {}

  const parityStr =
      typeof parentPort.parity === 'number'
          ? parityNumToStr(parentPort.parity)
          : (parentPort.parity ?? 'none')

  return {
    enabled: parentPort.enabled,
    baud: parentPort.baud,
    dataBits: parentPort.dataBits,
    stopBits: parentPort.stopBits,
    parityStr
  }
}

// 内部 react 数据
const uarts = reactive([
  Object.assign({}, defaultPort('UART1'), normalizeFromParent(props.modelValue?.uart1)),
  Object.assign({}, defaultPort('UART2'), normalizeFromParent(props.modelValue?.uart2))
])

// 父传入变化 → 同步
watch(
    () => props.modelValue,
    (nv) => {
      if (!nv) return
      if (nv.uart1) Object.assign(uarts[0], normalizeFromParent(nv.uart1))
      if (nv.uart2) Object.assign(uarts[1], normalizeFromParent(nv.uart2))
    },
    { deep: true }
)

// 内部变化 → 回传父
watch(
    uarts,
    (newVal) => {
      console.log('调整配置值',JSON.stringify(newVal))
      const out = {
        "flag":"interface",
        uart1: {
          name: newVal[0].name,
          enabled: newVal[0].enabled,
          baud: newVal[0].baud,
          dataBits: newVal[0].dataBits,
          stopBits: newVal[0].stopBits,
          parity: parityStrToNum(newVal[0].parityStr),
        },
        uart2: {
          name: newVal[1].name,
          enabled: newVal[1].enabled,
          baud: newVal[1].baud,
          dataBits: newVal[1].dataBits,
          stopBits: newVal[1].stopBits,
          parity: parityStrToNum(newVal[1].parityStr),
        }
      }
      emit('update:modelValue', out)
      console.log('修改配置值',JSON.stringify(out))

    },
    { deep: true }
)
</script>

<style scoped>
.interface-config { display:flex; flex-direction:column; gap:20px; }
.config-card { padding:20px; border-radius:10px; }
.section-title { font-size:20px; font-weight:600; margin-bottom:16px; }
.port-item { margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:10px; }
</style>
