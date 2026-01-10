<template>
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
              <!--<el-option label="串口2" value="serial2"/>-->
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

    <!-- 下半部分：轮询指令 -->
    <el-card shadow="hover" class="modbus-card" style="margin-top:20px;">
      <div class="command-header">
        <h4>轮询指令</h4>
        <el-button type="primary" @click="addCommand">添加指令</el-button>
      </div>

      <el-table :data="modbusConfig.commands"
                row-key="$index"
                style="width:100%;"
                :expand-row-keys="expandedRows">

        <!-- 展开映射 -->
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand-wrapper" @click.stop>
              <div class="mapping-header">
                <el-button size="small" type="primary" @click="addMapping(row)">添加映射</el-button>
              </div>

              <el-table :data="row.arr" style="margin-top:10px;">
                <el-table-column label="寄存器地址">
                  <template #default="{ row: m }">
                    <el-input-number v-model="m.a" :min="0" @click.stop />
                  </template>
                </el-table-column>

                <el-table-column label="长度(字节)">
                  <template #default="{ row: m }">
                    <el-input-number v-model="m.l" :min="1" :max="8" @click.stop />
                  </template>
                </el-table-column>

                <el-table-column label="顺序">
                  <template #default="{ row: m }">
                    <el-select v-model="m.o" @click.stop>
                      <el-option label="ABCD" value="ABCD"/>
                      <el-option label="CDAB" value="CDAB"/>
                      <el-option label="BADC" value="BADC"/>
                      <el-option label="DCBA" value="DCBA"/>
                    </el-select>
                  </template>
                </el-table-column>

                <el-table-column label="键值">
                  <template #default="{ row: m }">
                    <el-input v-model="m.k" @click.stop />
                  </template>
                </el-table-column>

                <el-table-column label="操作" width="160">
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
        <el-table-column type="index" label="#" width="40"/>

        <el-table-column label="从机地址" width="160">
          <template #default="{ row }">
            <el-input-number
                v-model.number="row.a"
                :min="1"
                :max="247"
                @input.stop
            />
          </template>
        </el-table-column>
        <el-table-column label="功能码" width="120">
          <template #default="{ row }">
            <el-select v-model="row.f" @click.stop>
              <el-option label="01" value="01"/>
              <el-option label="02" value="02"/>
              <el-option label="03" value="03"/>
              <el-option label="04" value="04"/>
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="起始寄存器" width="140">
          <template #default="{ row }">
            <el-input v-model="row.r" type="number" min="0" @input.stop />
          </template>
        </el-table-column>
        <el-table-column label="寄存器数量" width="140">
          <template #default="{ row }">
            <el-input v-model="row.s" type="number" min="1" @input.stop />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ $index }">
            <el-button size="small" type="warning" @click="copyCommand($index)">复制</el-button>
            <el-button size="small" type="danger" @click="removeCommand($index)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'

const setModbusConfig = () =>{
  //启用设置默认值
  if(modbusConfig.value.enabled){
    modbusConfig.value.protocol = "rtu"
    modbusConfig.value.inputSource = "serial1"
    modbusConfig.value.outputSource = [0]
    modbusConfig.value.interval = 50
  }
}


const props = defineProps<{
  modelValue?: any
}>()
const emit = defineEmits(['update:modelValue'])

const expandedRows = ref<number[]>([])

// 默认值工厂
const defaultConfig = () => ({
  enabled: true,
  protocol: 'rtu',
  inputSource: ['serial1'],
  outputSource: [1],
  interval: 1000,
  commands: []
})

// 内部 reactive 状态
const internalConfig = reactive(defaultConfig())

// computed v-model
const modbusConfig = computed({
  get() {
    return props.modelValue ?? internalConfig
  },
  set(val) {
    emit('update:modelValue', JSON.parse(JSON.stringify(val)))
  }
})

// 父组件更新时，合并到内部状态
watch(() => props.modelValue, (val) => {
  if (val) Object.assign(internalConfig, val)
})

// ------------------- 命令/映射操作 -------------------

// 添加命令
function addCommand() {

  if (!modbusConfig.value.commands) {
    modbusConfig.value.commands = []
  }
  modbusConfig.value.commands.push({
    a: 1,
    f: '03',
    r: 0,
    s: 1,
    arr: []
  })
}

// 删除命令
function removeCommand(i: number) {
  modbusConfig.value.commands.splice(i, 1)
}

// 复制命令
function copyCommand(i: number) {
  // 1. 获取原始命令
  const originalCmd = modbusConfig.value.commands[i];
  // 2. 创建一个深拷贝，避免直接修改原始对象
  const newCmd = JSON.parse(JSON.stringify(originalCmd));
  // 3. 在新对象上修改属性
  newCmd.a = originalCmd.a + 1; // 更合理的累加方式，是原始值的+1，而不是索引+2
  // 4. 将新对象插入数组
  modbusConfig.value.commands.splice(i + 1, 0, newCmd);
}

// 添加映射
function addMapping(cmd: any) {
  console.log('添加映射：',JSON.stringify(cmd))
  cmd.arr.push({
    a: 0,
    k: '',
    l: 1,
    o: 'ABCD'
  })
}

// 删除映射
function removeMapping(cmd: any, index: number) {
  cmd.arr.splice(index, 1)
}

// 复制映射
function copyMapping(cmd: any, index: number) {
  const m = cmd.arr[index]
  cmd.arr.splice(index + 1, 0, { ...m })
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

.el-table {
  width: 100%;
  table-layout: fixed;
}

.el-table-column {
  padding: 0 10px;
  min-width: 120px;
}

.el-input,
.el-input-number,
.el-select {
  font-size: 14px;
  width: 100%;
}

.el-table-column[label="单独传"] {
  width: 120px;
}

.el-table-column[label="从机地址"] .el-input,
.el-table-column[label="功能码"] .el-select,
.el-table-column[label="起始寄存器"] .el-input,
.el-table-column[label="寄存器数量"] .el-input {
  width: 160px;
}

.el-card:last-child {
  max-height: 500px;
  overflow-y: auto;
}

.el-button {
  padding: 5px 10px;
  font-size: 13px;
}

/* 调整表格的列标题间距 */
.el-table-column label {
  font-size: 13px;
}
</style>
