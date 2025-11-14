<template>
  <div class="modbus-container">
    <!-- 上半部分：基础配置 -->
    <el-card shadow="hover" class="modbus-card">
      <el-form :model="modbusConfig" label-width="140px">
        <el-form-item label="启用 Modbus">
          <el-switch
              v-model="modbusConfig.enabled"
              active-text="启用"
              inactive-text="禁用"
              @change="handleEnableChange"
          />
        </el-form-item>

        <template v-if="modbusConfig.enabled">
          <el-form-item label="协议类型">
            <el-select v-model="modbusConfig.protocol">
              <el-option label="RTU" value="rtu" />
            </el-select>
          </el-form-item>

          <el-form-item label="输出数据源">
            <el-select
                v-model="modbusConfig.outputSource"
                multiple
                placeholder="选择输出数据源"
            >
              <el-option
                  v-for="i in 6"
                  :key="'custom' + i"
                  :label="'自定义' + i"
                  :value="'custom' + i"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="输入数据源">
            <el-select
                v-model="modbusConfig.inputSource"
                multiple
                placeholder="选择输入数据源"
            >
              <el-option label="串口1" value="serial1" />
              <el-option label="串口2" value="serial2" />
              <el-option
                  v-for="i in 6"
                  :key="'custom_in' + i"
                  :label="'自定义' + i"
                  :value="'custom' + i"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="指令间隔(毫秒)">
            <el-input-number v-model="modbusConfig.interval" :min="10" />
          </el-form-item>
        </template>
      </el-form>
    </el-card>

    <!-- 下半部分：轮询指令 -->
    <el-card shadow="hover" class="modbus-card" style="margin-top:20px;">
      <div class="command-header">
        <h4>轮询指令</h4>
        <el-button type="primary" icon="el-icon-plus" @click="showCommandDialog()"
        >添加指令</el-button
        >
      </div>

      <el-table
          v-if="modbusConfig.commands.length"
          :data="modbusConfig.commands"
          style="width: 100%"
      >
        <el-table-column prop="name" label="名称" width="120" />
        <el-table-column prop="cycle" label="采集周期(秒)" width="120" />
        <el-table-column prop="independent" label="单独传" width="100">
          <template #default="{ row }">{{ row.independent ? '是' : '否' }}</template>
        </el-table-column>
        <el-table-column prop="slaveAddress" label="从机地址" width="100" />
        <el-table-column prop="functionCode" label="功能码" width="100" />
        <el-table-column prop="startRegister" label="起始寄存器" width="120" />
        <el-table-column
            prop="registerCount"
            label="寄存器数量"
            width="120"
        />
        <el-table-column label="操作">
          <template #default="{ row, $index }">
            <el-button size="mini" type="primary" @click="showCommandDialog(row)"
            >编辑</el-button
            >
            <el-button size="mini" type="warning" @click="copyCommand($index)"
            >复制</el-button
            >
            <el-button size="mini" type="danger" @click="removeCommand($index)"
            >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 弹窗 -->
    <el-dialog
        title="指令"
        :visible.sync="dialogVisible"
        width="500px"
        :append-to-body="true"
        :modal="true"
        :z-index="3000"
    >
      <el-form :model="commandForm" label-width="120px">
        <el-form-item label="名称">
          <el-input v-model="commandForm.name" />
        </el-form-item>
        <el-form-item label="采集周期(秒)">
          <el-input-number v-model="commandForm.cycle" :min="1" />
        </el-form-item>
        <el-form-item label="单独传">
          <el-switch
              v-model="commandForm.independent"
              active-text="是"
              inactive-text="否"
          />
        </el-form-item>
        <el-form-item label="从机地址">
          <el-input-number v-model="commandForm.slaveAddress" :min="1" :max="247" />
        </el-form-item>
        <el-form-item label="功能码">
          <el-select v-model="commandForm.functionCode">
            <el-option label="01" value="01" />
            <el-option label="02" value="02" />
            <el-option label="03" value="03" />
            <el-option label="04" value="04" />
          </el-select>
        </el-form-item>
        <el-form-item label="起始寄存器">
          <el-input-number v-model="commandForm.startRegister" :min="0" />
        </el-form-item>
        <el-form-item label="寄存器数量">
          <el-input-number v-model="commandForm.registerCount" :min="1" />
        </el-form-item>
      </el-form>

      <span slot="footer" class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCommandForm">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { nanoid } from 'nanoid';

interface Command {
  id: string;
  name: string;
  cycle: number;
  independent: boolean;
  slaveAddress: number;
  functionCode: string;
  startRegister: number;
  registerCount: number;
}

const modbusConfig = reactive({
  enabled: true,
  protocol: 'rtu',
  outputSource: [] as string[],
  inputSource: [] as string[],
  interval: 1000,
  commands: [] as Command[]
});

const dialogVisible = ref(false);
const commandForm = reactive<Command>({
  id: '',
  name: '',
  cycle: 1,
  independent: false,
  slaveAddress: 1,
  functionCode: '03',
  startRegister: 0,
  registerCount: 1
});

function showCommandDialog(cmd?: Command) {
  if (cmd) {
    Object.assign(commandForm, cmd);
  } else {
    Object.assign(commandForm, {
      id: '',
      name: '',
      cycle: 1,
      independent: false,
      slaveAddress: 1,
      functionCode: '03',
      startRegister: 0,
      registerCount: 1
    });
  }
  dialogVisible.value = true;
}

function saveCommandForm() {
  if (!commandForm.name) return;
  if (!commandForm.id) {
    commandForm.id = nanoid();
    modbusConfig.commands.push({ ...commandForm });
  } else {
    const idx = modbusConfig.commands.findIndex(c => c.id === commandForm.id);
    if (idx !== -1) modbusConfig.commands[idx] = { ...commandForm };
  }
  dialogVisible.value = false;
}

function removeCommand(index: number) {
  modbusConfig.commands.splice(index, 1);
}

function copyCommand(index: number) {
  const cmd = modbusConfig.commands[index];
  modbusConfig.commands.splice(index + 1, 0, { ...cmd, id: nanoid() });
}

function handleEnableChange(enabled: boolean) {
  if (!enabled) {
    modbusConfig.commands = [];
    modbusConfig.inputSource = [];
    modbusConfig.outputSource = [];
    modbusConfig.interval = 0;
  } else {
    modbusConfig.interval = 1000;
  }
}
</script>

<style scoped>
.modbus-container {
  max-width: 1000px;
}
.modbus-card {
  padding: 20px;
  margin-bottom: 20px;
}
.command-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
</style>
