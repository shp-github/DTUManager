<template>
  <div class="scene-config-container">
    <h2 class="title">场景配置</h2>

    <!-- 添加场景按钮 -->
    <el-button type="primary" @click="addScene">添加场景</el-button>

    <!-- 场景卡片 -->
    <div v-for="(scene, index) in scenes" :key="scene.id" class="scene-card">
      <div class="scene-header">
        <h3>场景 {{ index + 1 }}</h3>

        <!-- 删除场景 -->
        <span class="delete-btn small center-delete" @click="removeScene(index)">
            <el-icon><Delete /></el-icon> 删除场景
        </span>

      </div>

      <el-form :model="scene" label-width="140px">

        <!-- 条件区域 -->
        <div class="condition-box">
          <h4 class="area-title">触发条件</h4>

          <div
              v-for="(condition, cIndex) in scene.conditions"
              :key="cIndex"
              class="condition-item"
          >
            <el-form-item label="传感器">
              <el-select v-model="condition.sensor" class="condition-select">
                <el-option
                    v-for="sensor in sensors"
                    :key="sensor.id"
                    :label="sensor.name"
                    :value="sensor.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="判断条件">
              <el-select v-model="condition.condition" class="condition-select">
                <el-option label="大于" value="greaterThan" />
                <el-option label="小于" value="lessThan" />
                <el-option label="等于" value="equalTo" />
              </el-select>
            </el-form-item>

            <el-form-item label="数值">
              <el-input-number v-model="condition.value" :min="0" :max="999" />
            </el-form-item>

            <!-- 删除条件 -->
            <span class="delete-btn small center-delete" @click="removeCondition(scene, cIndex)">
              <el-icon><Delete /></el-icon> 删除条件
            </span>

          </div>

          <!-- 条件关系 -->
          <el-form-item label="条件关系">
            <el-radio-group v-model="scene.logicOperator" class="condition-radio">
              <el-radio-button label="AND">并且</el-radio-button>
              <el-radio-button label="OR">或者</el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-button type="success" size="small" @click="addCondition(scene)">
            添加条件
          </el-button>
        </div>

        <!-- 定时规则（新增功能） -->
        <div class="timer-box">
          <h4 class="area-title">定时规则</h4>

          <div
              class="timer-item"
              v-for="(t, tIndex) in scene.timers"
              :key="tIndex"
          >
            <el-form-item label="开始时间">
              <el-time-picker
                  v-model="t.start"
                  placeholder="选择时间"
                  format="HH:mm"
              />
            </el-form-item>

            <el-form-item label="结束时间">
              <el-time-picker
                  v-model="t.end"
                  placeholder="可选"
                  format="HH:mm"
              />
            </el-form-item>

            <!-- 自定义星期，多选输入框 -->
            <el-form-item
                label="自定义星期"
                class="custom-week-form"
            >
              <el-select v-model="t.weekdays" multiple placeholder="请选择星期" style="width: 260px">
                <el-option label="一" value="1" />
                <el-option label="二" value="2" />
                <el-option label="三" value="3" />
                <el-option label="四" value="4" />
                <el-option label="五" value="5" />
                <el-option label="六" value="6" />
                <el-option label="日" value="0" />
              </el-select>
            </el-form-item>

            <span class="delete-btn small center-delete" @click="removeTimer(scene, tIndex)">
              <el-icon><Delete /></el-icon> 删除定时
            </span>

          </div>

          <el-button type="success" size="small" @click="addTimer(scene)">
            添加定时规则
          </el-button>
        </div>

        <!-- 执行动作 -->
        <div class="switch-box">
          <h4 class="area-title">执行动作</h4>

          <el-button type="primary" size="small" @click="toggleSelectAll(scene)">
            {{ scene.selectedSwitches.length === scene.switches.length ? "取消全选" : "全选开关" }}
          </el-button>

          <div
              class="switch-row"
              v-for="(switchOption, sIndex) in scene.switches"
              :key="switchOption.id"
          >
            <el-checkbox-group v-model="scene.selectedSwitches">
              <el-checkbox :label="switchOption.id">
                <el-icon :size="28"><i :class="switchOption.icon"></i></el-icon>
                <span class="switch-label">{{ switchOption.name }}</span>
              </el-checkbox>
            </el-checkbox-group>

            <el-radio-group
                v-model="scene.switchStates[sIndex]"
                class="switch-radio"
            >
              <el-radio-button label="on">开启</el-radio-button>
              <el-radio-button label="off">关闭</el-radio-button>
            </el-radio-group>
          </div>
        </div>

      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { nanoid } from "nanoid";
import { Delete } from "@element-plus/icons-vue";

// 模拟传感器
const sensors = ref([
  { id: "sensor1", name: "传感器 1" },
  { id: "sensor2", name: "传感器 2" },
  { id: "sensor3", name: "传感器 3" },
]);

// 模拟开关
const switches = ref([
  { id: "switch1", name: "开关 1", icon: "el-icon-lightning" },
  { id: "switch2", name: "开关 2", icon: "el-icon-power-off" },
  { id: "switch3", name: "开关 3", icon: "el-icon-rank" },
]);

// 初始化场景
const scenes = ref([
  {
    id: nanoid(),
    conditions: [{ sensor: "", condition: "greaterThan", value: 0 }],
    logicOperator: "AND",
    timers: [],  // ← 新增
    selectedSwitches: [],
    switches: switches.value,
    switchStates: [],
  },
]);

// 添加场景
const addScene = () => {
  scenes.value.push({
    id: nanoid(),
    conditions: [{ sensor: "", condition: "greaterThan", value: 0 }],
    logicOperator: "AND",
    timers: [],      // ← 新增
    selectedSwitches: [],
    switches: switches.value,
    switchStates: [],
  });
};

// 删除场景
const removeScene = (i: number) => scenes.value.splice(i, 1);

// 条件
const addCondition = (scene: any) => {
  scene.conditions.push({ sensor: "", condition: "greaterThan", value: 0 });
};

const removeCondition = (scene: any, i: number) => {
  scene.conditions.splice(i, 1);
};

// 定时规则
const addTimer = (scene: any) => {
  scene.timers.push({
    start: "",
    end: "",
    repeat: "daily",
    weekdays: [],
  });
};

const removeTimer = (scene: any, i: number) => {
  scene.timers.splice(i, 1);
};

// 开关：全选 / 取消
const toggleSelectAll = (scene: any) => {
  if (scene.selectedSwitches.length === scene.switches.length) {
    scene.selectedSwitches = [];
  } else {
    scene.selectedSwitches = scene.switches.map((s: any) => s.id);
  }
};
</script>

<style scoped>

.scene-config-container {
  padding: 20px;
  font-family: "Microsoft YaHei", Arial, sans-serif;
}

.title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 15px;
}

/* 场景卡片 */
.scene-card {
  margin-top: 20px;
  padding: 20px;
  border-radius: 10px;
  background: #fafafa;
  border: 1px solid #ddd;
}

/* 场景标题和删除按钮 */
.scene-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.delete-btn {
  color: #ff4d4f;
  cursor: pointer;
  font-size: 16px;
  line-height: 16px;
  margin-bottom: 16px;
  display: inline-flex;
  align-items: center;
}

.delete-btn.el-icon {
  margin-right: 4px;
}

/* 区域标题 */
.area-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 10px;
}

/* 条件、定时、开关区域 */
.condition-box,
.timer-box,
.switch-box {
  border: 1px dashed #ccc;
  padding: 15px;
  border-radius: 8px;
  margin-top: 20px;
}

/* 条件、定时行 */
.condition-item,
.timer-item {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #e0e0e0;
}

/* 删除按钮垂直居中 */
.center-delete {
  display: flex;
  align-items: center;
  margin-left: 10px;
  color: #ff4d4f;
  cursor: pointer;
  white-space: nowrap;
}

.center-delete .el-icon {
  margin-right: 4px;
}

/* 条件选择下拉框 */
.condition-select {
  width: 200px !important;
  min-width: 200px !important;
}

.condition-select .el-input__inner {
  font-size: 14px;
  height: 34px;
}

/* 条件关系单选按钮横向排列 */
.condition-radio {
  white-space: nowrap;
}

/* 定时选择器 */
.el-time-picker {
  width: 120px;
}

/* 自定义周选择 */
.week-selector {
  display: flex;        /* 横向排列 */
  flex-wrap: wrap;      /* 超出宽度自动换行 */
  gap: 10px;            /* 复选框间距 */
  margin-left: 140px;   /* 保持和表单对齐，如果需要 */
}

.week-selector .el-checkbox {
  transform: scale(1.2);
  margin-bottom: 6px;  /* 换行后行间距 */
}


/* 开关行 */
.switch-row {
  display: flex;
  align-items: center;
  margin-top: 12px;
}

.switch-label {
  font-size: 14px;
  margin-left: 6px;
}

.switch-radio {
  margin-left: 25px;
}

/* 提高复选框大小 */
.el-checkbox {
  transform: scale(1.18);
  margin-right: 12px;
}

/* 按钮样式 */
.el-button {
  margin-top: 10px;
}

.el-button--primary,
.el-button--success {
  margin-right: 10px;
}

/* 保证按钮文字垂直居中 */
.el-button span {
  font-size: 14px;
}

/* 星期多选按钮一行显示 */
.week-checkbox-group {
  display: flex;       /* 横向排列 */
  flex-wrap: nowrap;   /* 不换行 */
  gap: 6px;            /* 按钮间距 */
  margin-left: 140px;  /* 保持与表单对齐 */
}


</style>
