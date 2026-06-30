的<template>
  <div class="modbus-container">

    <!-- 上半部分：基础配置 -->
    <el-card shadow="hover" class="modbus-card">
      <el-form :model="modbusConfig" label-width="140px">
        <el-form-item label="启用 Modbus">
          <el-switch @change="setModbusConfig()" v-model="modbusConfig.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>

        <template v-if="modbusConfig.enabled">

          <el-form-item label="协议类型">
            <el-select v-model="modbusConfig.protocol">
              <el-option label="RTU" value="rtu"/>
            </el-select>
          </el-form-item>

          <el-form-item label="输入数据源">
            <el-select v-model="modbusConfig.inputSource" >
              <el-option label="串口1" value="serial1"/>
            </el-select>
          </el-form-item>

          <el-form-item label="输出数据源">
            <el-select v-model="modbusConfig.outputSource" multiple>
              <el-option  label="默认" :value="0" :key="0"/>
              <el-option  label="通道1" :value="1" :key="1"/>
              <el-option  label="通道2" :value="2" :key="2"/>
              <el-option  label="通道3" :value="3" :key="3"/>
            </el-select>
          </el-form-item>

          <el-form-item label="指令间隔(毫秒)">
            <el-input-number v-model="modbusConfig.interval" :min="10"/>
          </el-form-item>

        </template>

      </el-form>
    </el-card>

    <!-- 下半部分：轮询模板 -->
    <el-card shadow="hover" class="modbus-card" style="margin-top:20px;">
      <div class="section-header">
        <h4>轮询模板</h4>
        <el-button type="primary" @click="addTemplate">添加模板</el-button>
      </div>

      <div v-if="!templates.length" class="empty-hint">
        暂无模板，点击"添加模板"开始配置
      </div>

      <div v-for="(tmpl, tIndex) in templates" :key="tIndex" class="template-section">
        <!-- 模板头部 -->
        <div class="template-header">
          <span class="template-title">模板 {{ tIndex + 1 }}</span>
          <el-button size="small" type="danger" @click="removeTemplate(tIndex)">删除模板</el-button>
        </div>

        <!-- 从站地址行 -->
        <div class="addrs-row">
          <span class="addrs-label">从站地址：</span>
          <el-button @click="addAddr(tmpl)">添加</el-button>
          <el-input-number
            v-model="newAddr"
            :min="1" :max="247"
            style="width: 140px;"
          />
          <el-tag
            v-for="(addr, aIdx) in tmpl.addrs"
            :key="aIdx"
            closable
            class="addr-tag"
            @close="removeAddr(tmpl, aIdx)"
          >
            {{ addr }}
          </el-tag>
        </div>

        <!-- 指令列表 -->
        <div class="command-subheader">
          <span>指令列表</span>
          <el-button size="small" type="primary" @click="addTemplateCommand(tmpl)">添加指令</el-button>
        </div>

        <el-table
          :data="tmpl.commands"
          :row-key="(row: any) => row[5]"
          :expand-row-keys="expandedRowKeys"
          @expand-change="onExpandChange"
          style="width:100%;"
        >
          <!-- 展开映射 -->
          <el-table-column type="expand" width="50">
            <template #default="{ row }">
              <div class="expand-wrapper" @click.stop>
                <div class="mapping-header">
                  <el-button size="small" type="primary" @click="addMapping(row)">添加映射</el-button>
                </div>

                <el-table :data="row[4]" style="width:100%; margin-top:10px;">
                  <el-table-column label="寄存器偏移" min-width="100">
                    <template #default="{ row: m }">
                      <el-input-number v-model="m[1]" :min="0" @click.stop />
                    </template>
                  </el-table-column>

                  <el-table-column label="长度(字节)" min-width="100">
                    <template #default="{ row: m }">
                      <el-input-number v-model="m[2]" :min="1" :max="8" @click.stop />
                    </template>
                  </el-table-column>

                  <el-table-column label="字节序" min-width="155">
                    <template #default="{ row: m }">
                      <el-select v-model="m[3]" @click.stop>
                        <el-option label="ABCD (大端)" :value="0"/>
                        <el-option label="CDAB (小端)" :value="1"/>
                        <el-option label="BADC" :value="2"/>
                        <el-option label="DCBA" :value="3"/>
                      </el-select>
                    </template>
                  </el-table-column>

                  <el-table-column label="键值" min-width="120">
                    <template #default="{ row: m }">
                      <el-input v-model="m[0]" @click.stop placeholder="自动生成" />
                    </template>
                  </el-table-column>

                  <el-table-column label="操作" min-width="155">
                    <template #default="{ $index }">
                      <el-button size="small" type="success" @click="copyMapping(row, $index)">复制</el-button>
                      <el-button size="small" type="danger" @click="removeMapping(row, $index)">删除</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </template>
          </el-table-column>

          <!-- 普通列 -->
          <el-table-column type="index" label="#" min-width="55" align="center"/>

          <el-table-column label="功能码" min-width="100">
            <template #default="{ row }">
              <el-select v-model="row[0]" @click.stop>
                <el-option label="01" value="01"/>
                <el-option label="02" value="02"/>
                <el-option label="03" value="03"/>
                <el-option label="04" value="04"/>
              </el-select>
            </template>
          </el-table-column>

          <el-table-column label="起始寄存器" min-width="130">
            <template #default="{ row }">
              <el-input-number v-model="row[1]" :min="0" @click.stop />
            </template>
          </el-table-column>

          <el-table-column label="寄存器数量" min-width="130">
            <template #default="{ row }">
              <el-input-number v-model="row[2]" :min="1" @click.stop />
            </template>
          </el-table-column>

          <el-table-column label="写功能码" min-width="100">
            <template #default="{ row }">
              <el-select v-model="row[3]" @click.stop>
                <el-option label="只读" value=""/>
                <el-option label="05H" value="05"/>
                <el-option label="06H" value="06"/>
                <el-option label="10H" value="10"/>
              </el-select>
            </template>
          </el-table-column>

          <el-table-column label="操作" min-width="170">
            <template #default="{ $index }">
              <el-button size="small" type="warning" @click="copyTemplateCommand(tmpl, $index)">复制</el-button>
              <el-button size="small" type="danger" @click="removeTemplateCommand(tmpl, $index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'

// ---------- 类型定义 ----------
interface Template {
  addrs: number[]
  commands: any[][]  // [funcCode, startReg, regCount, writeFuncCode, mappings, uid]
}

// ---------- 全局计数器 & 防抖 & 展开状态 ----------
let uidCounter = 0
let emitTimer: ReturnType<typeof setTimeout> | null = null
const expandedRowKeys = ref<number[]>([])

function onExpandChange(_row: any, expandedRows: any[]) {
  // 同步期间忽略表格重渲染触发的 expand-change，防止 row-key 变化导致意外收缩
  if (syncing) return
  expandedRowKeys.value = expandedRows.map((r: any) => r[5])
}

const setModbusConfig = () => {
  if (modbusConfig.value.enabled) {
    if (!modbusConfig.value.protocol) modbusConfig.value.protocol = 'rtu'
    if (!modbusConfig.value.inputSource) modbusConfig.value.inputSource = 'serial1'
    if (!modbusConfig.value.outputSource || modbusConfig.value.outputSource.length === 0) modbusConfig.value.outputSource = [0]
    if (!modbusConfig.value.interval) modbusConfig.value.interval = 50
  }
}

// ---------- Props / Emits ----------
const props = defineProps<{
  modelValue?: any
}>()
const emit = defineEmits(['update:modelValue'])

// ---------- 默认值工厂 ----------
const defaultConfig = () => ({
  enabled: true,
  protocol: 'rtu',
  inputSource: 'serial1',
  outputSource: [1],
  interval: 1000,
  templates: [] as Template[]
})

// ---------- 响应式状态 ----------
const internalConfig = reactive(defaultConfig())

// 防止同步回写时的循环 emit
let syncing = false

// ---------- 父 → 子同步 ----------
watch(() => props.modelValue, (val) => {
  if (!val) return
  syncing = true

  // ★ 关键：保存现有 command UID，防止同步时 row-key 变化导致表格收缩
  const uidBackup = new Map<string, number>()
  if (internalConfig.templates) {
    for (const [ti, tmpl] of internalConfig.templates.entries()) {
      if (tmpl.commands) {
        for (const [ci, cmd] of tmpl.commands.entries()) {
          if (cmd[5] !== undefined) {
            uidBackup.set(`${ti}-${ci}`, cmd[5])
          }
        }
      }
    }
  }

  const defaultKeys = Object.keys(defaultConfig())
  for (const key of defaultKeys) {
    if (val[key] !== undefined) {
      ;(internalConfig as any)[key] = JSON.parse(JSON.stringify(val[key]))
    }
  }

  // ★ 恢复 UID：按模板/指令位置匹配，保证 row-key 稳定
  if (internalConfig.templates) {
    for (const [ti, tmpl] of internalConfig.templates.entries()) {
      if (tmpl.commands) {
        for (const [ci, cmd] of tmpl.commands.entries()) {
          const key = `${ti}-${ci}`
          if (uidBackup.has(key)) {
            cmd[5] = uidBackup.get(key)!
          }
        }
      }
    }
  }

  // 为没有 UID 的 command 补充 UID（仅对新增的指令生效）
  ensureCommandUIDs()
  nextTick(() => { syncing = false })
}, { immediate: true, deep: true })

// ---------- 子 → 父同步（防抖） ----------
watch(internalConfig, () => {
  if (syncing) return
  if (emitTimer) clearTimeout(emitTimer)
  emitTimer = setTimeout(() => {
    const out = JSON.parse(JSON.stringify(internalConfig))
    // 剥离所有 command 的 UID（第6个元素），输出符合文档的 5 元组格式
    if (out.templates) {
      for (const tmpl of out.templates) {
        if (tmpl.commands) {
          for (const cmd of tmpl.commands) {
            cmd.length = 5  // 保留 [funcCode, startReg, regCount, writeFuncCode, mappings]
          }
        }
      }
    }
    emit('update:modelValue', out)
  }, 150)
}, { deep: true })

// ---------- 计算属性 ----------
const modbusConfig = computed(() => internalConfig)
const templates = computed(() => internalConfig.templates || [])

// ---------- UID 补充 ----------
function ensureCommandUIDs() {
  if (!internalConfig.templates) return
  for (const tmpl of internalConfig.templates) {
    if (!tmpl.commands) tmpl.commands = []
    for (const cmd of tmpl.commands) {
      if (cmd.length < 6 || cmd[5] === undefined) {
        cmd[5] = ++uidCounter
      }
    }
    if (!tmpl.addrs) tmpl.addrs = []
  }
}

// ---------- 模板操作 ----------
function addTemplate() {
  if (!internalConfig.templates) internalConfig.templates = []
  internalConfig.templates.push({
    addrs: [],
    commands: []
  })
}

function removeTemplate(tIndex: number) {
  internalConfig.templates!.splice(tIndex, 1)
}

// ---------- 从站地址操作 ----------
const newAddr = ref(1)

function addAddr(tmpl: Template) {
  if (!tmpl.addrs) tmpl.addrs = []
  const v = newAddr.value
  if (!tmpl.addrs.includes(v)) {
    tmpl.addrs.push(v)
    tmpl.addrs.sort((a, b) => a - b)
  }
  newAddr.value = Math.min(v + 1, 247)
}

function removeAddr(tmpl: Template, aIdx: number) {
  tmpl.addrs.splice(aIdx, 1)
}

// ---------- 模板内指令操作 ----------
function addTemplateCommand(tmpl: Template) {
  if (!tmpl.commands) tmpl.commands = []
  tmpl.commands.push([
    '03',   // 功能码
    0,      // 起始寄存器
    1,      // 寄存器数量
    '',     // 写功能码（空=无）
    [],     // 映射列表
    ++uidCounter
  ])
}

function removeTemplateCommand(tmpl: Template, cmdIndex: number) {
  tmpl.commands.splice(cmdIndex, 1)
}

function copyTemplateCommand(tmpl: Template, cmdIndex: number) {
  const src = tmpl.commands[cmdIndex]
  const copy = [src[0], src[1], src[2], src[3], JSON.parse(JSON.stringify(src[4])), ++uidCounter]
  tmpl.commands.splice(cmdIndex + 1, 0, copy)
}

// ---------- 映射操作 ----------
function addMapping(cmd: any) {
  if (!cmd[4]) cmd[4] = []
  if (!checkMappingCapacity(cmd, 2)) return
  cmd[4].push(['', 0, 2, 0])
}

function removeMapping(cmd: any, index: number) {
  cmd[4].splice(index, 1)
}

function copyMapping(cmd: any, index: number) {
  const m = cmd[4][index]
  if (!checkMappingCapacity(cmd, m[2] || 0)) return
  cmd[4].splice(index + 1, 0, [m[0], m[1], m[2], m[3]])
}

// ---------- 校验 ----------
/** 校验映射总字节数不超过寄存器容量（寄存器数量 × 2） */
function checkMappingCapacity(cmd: any, newBytes: number): boolean {
  const regCount = cmd[2] || 0
  const totalBytes = regCount * 2
  const mappings: any[] = cmd[4] || []
  const currentBytes = mappings.reduce((sum: number, m: any) => sum + (m[2] || 0), 0)
  if (currentBytes + newBytes > totalBytes) {
    ElMessage.warning(`映射总字节数(${currentBytes + newBytes})超过寄存器容量(${totalBytes}字节，${regCount}个寄存器)`)
    return false
  }
  return true
}
</script>

<style scoped>
.modbus-container {
  max-width: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.modbus-card {
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
}

/* ========== 模板区域 ========== */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.section-header h4 {
  margin: 0;
  font-size: 16px;
}

.empty-hint {
  text-align: center;
  color: #909399;
  padding: 40px 0;
  font-size: 14px;
}

.template-section {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}
.template-title {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}

/* 从站地址行 */
.addrs-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.addrs-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
}
.addr-tag {
  margin-right: 0;
}

/* 指令子标题 */
.command-subheader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.command-subheader span {
  font-size: 14px;
  color: #606266;
}

.command-header,
.mapping-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.expand-wrapper {
  padding: 10px 20px;
}

.el-input,
.el-input-number,
.el-select {
  font-size: 14px;
  width: 100%;
}

.el-card:last-child {
  max-height: 500px;
  overflow-y: auto;
}

.el-button {
  padding: 5px 10px;
  font-size: 13px;
}

/* 输入框/下拉框增强 */
.modbus-card :deep(.el-input__wrapper) {
  border: 1px solid #c0c4cc;
  box-shadow: 0 0 0 1px rgba(59,130,246,0.15);
  background: #fafbfc;
}
.modbus-card :deep(.el-input__wrapper:hover) {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59,130,246,0.2);
}
.modbus-card :deep(.el-input__wrapper.is-focus) {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.2), 0 0 12px rgba(59,130,246,0.1);
}
.modbus-card :deep(.el-input__inner) {
  font-size: 15px;
  font-weight: 500;
}
</style>

<!-- 暗夜模式适配 -->
<style>
html.dark .modbus-card .el-input__wrapper {
  background: #2a2a2a !important;
  border-color: #444;
  box-shadow: 0 0 0 1px rgba(88,166,255,0.1);
}
html.dark .modbus-card .el-input__wrapper:hover {
  border-color: #58a6ff;
  box-shadow: 0 0 0 2px rgba(88,166,255,0.2);
}
html.dark .modbus-card .el-input__wrapper.is-focus {
  border-color: #58a6ff;
  box-shadow: 0 0 0 3px rgba(88,166,255,0.2), 0 0 12px rgba(88,166,255,0.1);
}
html.dark .modbus-card .el-input__inner {
  color: #e0e0e0;
}

/* 暗夜模式模板区域 */
html.dark .template-section {
  border-color: #444;
}
html.dark .template-title {
  color: #e0e0e0;
}
html.dark .addrs-label {
  color: #a0aec0;
}
html.dark .command-subheader span {
  color: #a0aec0;
}
html.dark .empty-hint {
  color: #666;
}
</style>
