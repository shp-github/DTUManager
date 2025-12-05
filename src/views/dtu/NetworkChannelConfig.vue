<template>
  <div class="network-config-container">
    <!-- 顶部通道选择 -->
    <div class="header">
      <el-button-group>
        <el-button
            v-for="(channel, index) in channels"
            :key="index"
            :class="{ 'is-active': activeChannelIndex === index }"
            @click="activeChannelIndex = index"
        >
          通道 {{ index + 1 }}
        </el-button>
      </el-button-group>
    </div>

    <!-- 当前通道配置表单 -->
    <el-form
        v-if="currentChannel"
        :model="currentChannel"
        label-width="120px"
        class="network-form"
    >
      <!-- 启用通道 -->
      <el-form-item label="启用通道">
        <el-switch
            v-model="currentChannel.enabled"
            active-text="启用"
            inactive-text="禁用"
            @change="handleEnableChange"
        />
      </el-form-item>

      <template v-if="currentChannel.enabled">
        <!-- 数据源 -->
        <el-form-item label="数据源">
          <el-select v-model="currentChannel.source" placeholder="选择数据源">
            <el-option label="串口1" value="serial1" />
            <!--<el-option label="串口2" value="serial2" />-->
            <el-option
                v-for="i in 3"
                :key="'custom' + i"
                :label="'自定义' + i"
                :value="'custom' + i"
            />
            <el-option label="控制台" value="console" />
          </el-select>
        </el-form-item>

        <!-- 协议 -->
        <el-form-item label="协议">
          <el-select
              v-model="currentChannel.protocol"
              @change="handleProtocolChange"
          >
            <el-option label="TCP" value="tcp" />
            <el-option label="MQTT" value="mqtt" />
          </el-select>
        </el-form-item>

        <!-- IP / 端口 / 心跳 -->
        <el-form-item label="IP 地址">
          <el-input v-model="currentChannel.target" />
        </el-form-item>
        <el-form-item label="端口">
          <el-input v-model.number="currentChannel.port" type="number" />
        </el-form-item>
        <el-form-item label="心跳时间(秒)">
          <el-input-number v-model.number="currentChannel.heartbeatTime" :min="1" />
        </el-form-item>

        <!-- MQTT 特有 -->
        <template v-if="currentChannel.protocol === 'mqtt'">
          <el-form-item label="账号"><el-input v-model="currentChannel.username" /></el-form-item>
          <el-form-item label="密码">
            <el-input
                v-model="currentChannel.password"
                type="password"
                show-password
                placeholder="请输入密码"
            />
          </el-form-item>
          <el-form-item label="ClientID"><el-input v-model="currentChannel.clientID" /></el-form-item>
          <el-form-item label="QOS">
            <el-select v-model.number="currentChannel.QOS">
              <el-option :label="0" :value="0" />
              <el-option :label="1" :value="1" />
              <el-option :label="2" :value="2" />
            </el-select>
          </el-form-item>
          <el-form-item label="PubRetain">
            <el-switch
                v-model="currentChannel.PubRetain"
                active-text="保留"
                inactive-text="不保留"
            />
          </el-form-item>

          <el-form-item label="订阅主题"><el-input v-model="currentChannel.subscribeTopic" /></el-form-item>
          <el-form-item label="发布主题"><el-input v-model="currentChannel.publishTopic" /></el-form-item>
          <el-form-item label="遗嘱消息"><el-input v-model="currentChannel.lastWillMessage" /></el-form-item>
        </template>

        <!-- 注册包 / 心跳包 -->
        <el-form-item label="注册包"><el-input v-model="currentChannel.registerPackage" /></el-form-item>
        <el-form-item label="心跳包"><el-input v-model="currentChannel.heartbeatPackage" /></el-form-item>
      </template>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, watch, nextTick } from "vue"

interface Device {
  id: string
}

interface Channel {
  enabled: boolean;
  source: string;
  protocol: "tcp" | "mqtt";
  target: string;  // 改为 target 与后端一致
  port: number;
  heartbeatTime: number;
  username: string;
  password: string;
  registerPackage: string;
  heartbeatPackage: string;
  subscribeTopic: string;
  publishTopic: string;
  clientID: string;
  QOS: number;  // 改为 number 类型
  PubRetain: boolean;
  lastWillMessage: string;
}

// ================== Props & Emits ==================
const props = defineProps<{
  modelValue?: Channel[],
  device?: Device | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Channel[]): void
}>()

// ================== 状态定义 ==================
const activeChannelIndex = ref(0);

// 深拷贝函数
const deepClone = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as T;

  const cloned = {} as T;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

function defaultChannel(i: number): Channel {
  return {
    enabled: i === 0,
    source: i === 0 ? "serial1" : "",
    protocol: i === 0 ? "mqtt" : "tcp",
    target: i === 0 && props.device ? "121.36.223.224" : "",
    port: i === 0 ? 1883 : 50001,
    heartbeatTime: i === 0 ? 30 : 0,
    username: i === 0 ? "device" : "",
    password: i === 0 ? "11223344" : "",
    registerPackage: i === 0 && props.device ? props.device.id : "",
    heartbeatPackage: i === 0 && props.device ? props.device.id : "",
    subscribeTopic: i === 0 && props.device ? `/server/coo/${props.device.id}` : "",
    publishTopic: i === 0 && props.device ? `/dev/coo/${props.device.id}` : "",
    clientID: i === 0 && props.device ? props.device.id : "",
    QOS: 0,  // 改为 number
    PubRetain: false,
    lastWillMessage: "",
  }
}

// 初始化 channels - 使用响应式包装
const channels = reactive<Channel[]>(
    props.modelValue?.length
        ? deepClone(props.modelValue)
        : Array.from({ length: 3 }, (_, i) => defaultChannel(i))
)

// 当前通道
const currentChannel = computed(() => channels[activeChannelIndex.value])

// 防抖更新
let updateTimeout: NodeJS.Timeout | null = null

// 触发更新到父组件
const triggerUpdate = () => {
  if (updateTimeout) {
    clearTimeout(updateTimeout)
  }
  updateTimeout = setTimeout(() => {
    emit("update:modelValue", deepClone(channels))
  }, 100)
}

// ================== 监听变化并同步到父组件 ==================
watch(
    channels,
    () => {
      triggerUpdate()
    },
    { deep: true, immediate: true }
)

// 监听当前通道的深度变化
watch(
    () => currentChannel.value,
    () => {
      triggerUpdate()
    },
    { deep: true }
)

// ================== 父 → 子同步 ==================
watch(
    () => props.modelValue,
    (val) => {
      if (!val) return

      // 使用 nextTick 确保 DOM 更新完成后再更新数据
      nextTick(() => {
        val.forEach((item, i) => {
          if (channels[i]) {
            Object.assign(channels[i], deepClone(item))
          }
        })
      })
    },
    { deep: true }
)

// ================== device 更新带动联动字段 ==================
watch(
    () => props.device,
    (device) => {
      if (!device) return

      channels.forEach((ch) => {
        if (ch.enabled) {
          ch.registerPackage = device.id
          ch.heartbeatPackage = device.id
          if (ch.protocol === "mqtt") {
            ch.subscribeTopic = `/server/coo/${device.id}`
            ch.publishTopic   = `/dev/coo/${device.id}`
            ch.clientID = device.id
          }
        }
      })

      triggerUpdate()
    },
    { immediate: true }
)

// ================== 事件处理 ==================
const handleProtocolChange = () => {
  const ch = currentChannel.value;
  if (!ch.enabled) return;

  if (ch.protocol === "tcp") {
    ch.target = "192.168.2.45";
    ch.port = 50001;
    ch.username = "";
    ch.password = "";
    ch.subscribeTopic = "";
    ch.publishTopic = "";
    ch.clientID = "";
    ch.QOS = 0;
    ch.PubRetain = false;
    ch.lastWillMessage = "";
  } else if (ch.protocol === "mqtt" && props.device) {
    ch.port = 1883;
    ch.username = "device";
    ch.password = "11223344";
    ch.subscribeTopic = `/server/coo/${props.device.id}`;
    ch.publishTopic   = `/dev/coo/${props.device.id}`;
    ch.clientID       = props.device.id;
    ch.registerPackage = props.device.id;
    ch.heartbeatPackage = props.device.id;
    ch.QOS = 0;
    ch.PubRetain = false;
    ch.lastWillMessage = "";
  }

  triggerUpdate()
}

const handleEnableChange = (enabled: boolean) => {
  const ch = currentChannel.value;
  if (!enabled) {
    Object.assign(ch, {
      enabled: false,
      source: "",
      protocol: "tcp",
      target: "",
      port: 0,
      heartbeatTime: 0,
      username: "",
      password: "",
      registerPackage: "",
      heartbeatPackage: "",
      subscribeTopic: "",
      publishTopic: "",
      clientID: "",
      QOS: 0,
      PubRetain: false,
      lastWillMessage: ""
    });
  } else {
    ch.enabled = true;
    ch.target = "121.36.223.224";  // 改为 target
    ch.heartbeatTime = 30;
    if (props.device) {
      ch.registerPackage = props.device.id
      ch.heartbeatPackage = props.device.id
    }
    handleProtocolChange();
  }

  triggerUpdate()
}

// 组件卸载时清理
import { onUnmounted } from 'vue'
onUnmounted(() => {
  if (updateTimeout) {
    clearTimeout(updateTimeout)
  }
})
</script>

<style scoped>
.header {
  margin-bottom: 20px;
}

.el-button.is-active {
  background-color: #409eff;
  color: white;
}

.network-form {
  max-width: 700px;
}
</style>