<template>
  <div class="modbus-container">

    <!-- 上半部分：基础配置 -->
    <el-card shadow="hover" class="modbus-card">
      <el-form :model="modbusConfig" label-width="140px">
        <el-form-item label="启用 Modbus">
          <el-switch v-model="modbusConfig.enabled" active-text="启用" inactive-text="禁用" @change="handleEnableChange"/>
        </el-form-item>

        <template v-if="modbusConfig.enabled">

          <el-form-item label="协议类型">
            <el-select v-model="modbusConfig.protocol">
              <el-option label="RTU" value="rtu"/>
            </el-select>
          </el-form-item>

          <el-form-item label="输出数据源">
            <el-select v-model="modbusConfig.outputSource" multiple>
              <el-option v-for="i in 6" :label="'自定义' + i" :value="'custom' + i" :key="i"/>
            </el-select>
          </el-form-item>

          <el-form-item label="输入数据源">
            <el-select v-model="modbusConfig.inputSource" multiple>
              <el-option label="串口1" value="serial1"/>
              <el-option label="串口2" value="serial2"/>
              <el-option v-for="i in 6" :label="'自定义' + i" :value="'custom' + i" :key="i"/>
            </el-select>
          </el-form-item>

          <el-form-item label="指令间隔(毫秒)">
            <el-input-number v-model="modbusConfig.interval" :min="10"/>
          </el-form-item>

        </template>

      </el-form>
    </el-card>

    <!-- 下半部分 -->
    <el-card shadow="hover" class="modbus-card" style="margin-top:20px;">

      <div class="command-header">
        <h4>轮询指令</h4>
        <el-button type="primary" @click="addCommand">添加指令</el-button>
      </div>

      <el-table :data="modbusConfig.commands"
                row-key="id"
                style="width:100%;"
                :expand-row-keys="expandedRows">

        <!-- 展开映射 -->
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expand-wrapper" @click.stop>

              <div class="mapping-header">
                <h4>寄存器映射</h4>
                <el-button size="small" type="primary" @click="addMapping(row)">添加映射</el-button>
              </div>

              <el-table :data="row.mappings" style="margin-top:10px;">

                <el-table-column label="键值">
                  <template #default="{ row: m }">
                    <el-input v-model="m.key" @click.stop />
                  </template>
                </el-table-column>

                <el-table-column label="寄存器地址">
                  <template #default="{ row: m }">
                    <el-input-number v-model="m.address" :min="0" @click.stop />
                  </template>
                </el-table-column>

                <el-table-column label="长度(字节)">
                  <template #default="{ row: m }">
                    <el-input-number v-model="m.length" :min="1" :max="8" @click.stop />
                  </template>
                </el-table-column>

                <el-table-column label="顺序">
                  <template #default="{ row: m }">
                    <el-select v-model="m.order" @click.stop>
                      <el-option label="ABCD" value="ABCD"/>
                      <el-option label="CDAB" value="CDAB"/>
                      <el-option label="BADC" value="BADC"/>
                      <el-option label="DCBA" value="DCBA"/>
                    </el-select>
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

        <el-table-column label="采集周期(秒)" width="140">
          <template #default="{ row }">
            <el-input-number v-model="row.cycle" :min="1" @click.stop />
          </template>
        </el-table-column>

        <el-table-column label="单独传" width="120">
          <template #default="{ row }">
            <el-switch v-model="row.independent" @click.stop />
          </template>
        </el-table-column>

        <el-table-column label="从机地址" width="160">
          <template #default="{ row }">
            <el-input v-model="row.slaveAddress" type="number" min="1" max="247" @input.stop />
          </template>
        </el-table-column>

        <el-table-column label="功能码" width="120">
          <template #default="{ row }">
            <el-select v-model="row.functionCode" @click.stop>
              <el-option label="01" value="01"/>
              <el-option label="02" value="02"/>
              <el-option label="03" value="03"/>
              <el-option label="04" value="04"/>
            </el-select>
          </template>
        </el-table-column>

        <el-table-column label="起始寄存器" width="140">
          <template #default="{ row }">
            <el-input v-model="row.startRegister" type="number" min="0" @input.stop />
          </template>
        </el-table-column>

        <el-table-column label="寄存器数量" width="140">
          <template #default="{ row }">
            <el-input v-model="row.registerCount" type="number" min="1" @input.stop />
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
import { reactive, ref } from 'vue';
import { nanoid } from 'nanoid';

const expandedRows = ref<string[]>([]);

const modbusConfig = reactive({
  enabled: true,
  protocol: 'rtu',
  outputSource: [],
  inputSource: [],
  interval: 1000,
  commands: []
});

// 添加命令
function addCommand() {
  modbusConfig.commands.push({
    id: nanoid(),
    cycle: 1,
    independent: false,
    slaveAddress: 1,
    functionCode: '03',
    startRegister: 0,
    registerCount: 1,
    mappings: []
  });
}

// 删除命令
function removeCommand(i: number) {
  modbusConfig.commands.splice(i, 1);
}

// 复制命令
function copyCommand(i: number) {
  const cmd = modbusConfig.commands[i];
  modbusConfig.commands.splice(i + 1, 0, {
    ...cmd,
    id: nanoid(),
    mappings: cmd.mappings.map(m => ({ ...m }))
  });
}

// 添加映射
function addMapping(cmd: any) {
  cmd.mappings.push({
    key: '',
    address: 0,
    length: 1,
    order: 'ABCD'
  });
}

// 删除映射
function removeMapping(cmd: any, index: number) {
  cmd.mappings.splice(index, 1);
}

// 复制映射
function copyMapping(cmd: any, index: number) {
  const m = cmd.mappings[index];
  cmd.mappings.splice(index + 1, 0, { ...m });
}

// 启用与禁用
function handleEnableChange(val: boolean) {
  if (!val) {
    modbusConfig.commands = [];
    modbusConfig.inputSource = [];
    modbusConfig.outputSource = [];
    modbusConfig.interval = 0;
  }
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

.el-input,
.el-select {
  font-size: 14px;
}

.el-table-column .el-input,
.el-table-column .el-select {
  min-width: 120px;
}
</style>
