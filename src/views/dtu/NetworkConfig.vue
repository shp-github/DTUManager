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
      <!-- 启用开关 -->
      <el-form-item label="启用通道">
        <el-switch
            v-model="currentChannel.enabled"
            active-text="启用"
            inactive-text="禁用"
            @change="handleEnableChange"
        />
      </el-form-item>

      <template v-if="currentChannel.enabled">
        <!-- 数据源选择 -->
        <el-form-item label="数据源">
          <el-select v-model="currentChannel.source" placeholder="选择数据源">
            <el-option label="串口1" value="serial1" />
            <el-option label="串口2" value="serial2" />
            <el-option
                v-for="i in 6"
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

        <!-- IP -->
        <el-form-item label="IP 地址">
          <el-input v-model="currentChannel.ip" />
        </el-form-item>

        <!-- 端口 -->
        <el-form-item label="端口">
          <el-input v-model="currentChannel.port" type="number" />
        </el-form-item>

        <!-- 心跳时间 -->
        <el-form-item label="心跳时间(秒)">
          <el-input-number v-model="currentChannel.heartbeatTime" :min="1" />
        </el-form-item>

        <!-- MQTT 账号密码 -->
        <template v-if="currentChannel.protocol === 'mqtt'">
          <el-form-item label="账号">
            <el-input v-model="currentChannel.username" />
          </el-form-item>

          <el-form-item label="密码">
            <el-input v-model="currentChannel.password" type="password" />
          </el-form-item>

          <!-- MQTT 特有字段 -->
          <el-form-item label="ClientID">
            <el-input v-model="currentChannel.clientID" />
          </el-form-item>

          <el-form-item label="QOS">
            <el-select v-model="currentChannel.QOS">
              <el-option label="0" value="0" />
              <el-option label="1" value="1" />
              <el-option label="2" value="2" />
            </el-select>
          </el-form-item>

          <el-form-item label="PubRetain">
            <el-switch
                v-model="currentChannel.PubRetain"
                active-text="保留"
                inactive-text="不保留"
            />
          </el-form-item>

          <el-form-item label="遗嘱消息">
            <el-input v-model="currentChannel.lastWillMessage" />
          </el-form-item>
        </template>

        <!-- 注册包 -->
        <el-form-item label="注册包">
          <el-input v-model="currentChannel.registerPackage" />
        </el-form-item>

        <!-- 心跳包 -->
        <el-form-item label="心跳包">
          <el-input v-model="currentChannel.heartbeatPackage" />
        </el-form-item>

        <!-- MQTT 订阅/发布主题 -->
        <template v-if="currentChannel.protocol === 'mqtt'">
          <el-form-item label="订阅主题">
            <el-input v-model="currentChannel.subscribeTopic" />
          </el-form-item>

          <el-form-item label="发布主题">
            <el-input v-model="currentChannel.publishTopic" />
          </el-form-item>
        </template>
      </template>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from "vue";

const deviceCode = "deviceCode"; // 可从父组件传入

interface Channel {
  enabled: boolean;
  source: string; // 数据源
  protocol: "tcp" | "mqtt";
  ip: string;
  port: number;
  heartbeatTime: number;
  username: string;
  password: string;
  registerPackage: string;
  heartbeatPackage: string;
  subscribeTopic: string;
  publishTopic: string;
  clientID: string;
  QOS: "0" | "1" | "2";
  PubRetain: boolean;
  lastWillMessage: string;
}

/** 六个固定通道 */
const channels = reactive<Channel[]>(
    Array.from({ length: 6 }, (_, i) => ({
      enabled: true,
      source: i < 2 ? `serial${i + 1}` : i < 2 + 6 ? `custom${i - 1}` : "console",
      protocol: i === 1 ? "mqtt" : "tcp",
      ip: "121.36.223.224",
      port: i === 1 ? 1883 : 50001,
      heartbeatTime: 30,
      username: i === 1 ? "device" : "",
      password: i === 1 ? "11223344" : "",
      registerPackage: deviceCode,
      heartbeatPackage: deviceCode,
      subscribeTopic: i === 1 ? `/server/coo/${deviceCode}` : "",
      publishTopic: i === 1 ? `/dev/coo/${deviceCode}` : "",
      clientID: i === 1 ? "deviceClient" : "",
      QOS: "0",
      PubRetain: false,
      lastWillMessage: ""
    }))
);

const activeChannelIndex = ref(0);
const currentChannel = computed(() => channels[activeChannelIndex.value]);

const handleProtocolChange = () => {
  const ch = currentChannel.value;
  if (!ch.enabled) return;

  if (ch.protocol === "tcp") {
    ch.port = 50001;
    ch.username = "";
    ch.password = "";
    ch.subscribeTopic = "";
    ch.publishTopic = "";
    ch.clientID = "";
    ch.QOS = "0";
    ch.PubRetain = false;
    ch.lastWillMessage = "";
  }

  if (ch.protocol === "mqtt") {
    ch.port = 1883;
    ch.username = "device";
    ch.password = "11223344";
    ch.subscribeTopic = `/server/coo/${deviceCode}`;
    ch.publishTopic = `/dev/coo/${deviceCode}`;
    ch.clientID = "deviceClient";
    ch.QOS = "0";
    ch.PubRetain = false;
    ch.lastWillMessage = "";
  }
};

const handleEnableChange = (enabled: boolean) => {
  const ch = currentChannel.value;
  if (!enabled) {
    // 禁用时清空信息
    ch.source = "";
    ch.protocol = "tcp";
    ch.ip = "";
    ch.port = 0;
    ch.heartbeatTime = 0;
    ch.username = "";
    ch.password = "";
    ch.registerPackage = "";
    ch.heartbeatPackage = "";
    ch.subscribeTopic = "";
    ch.publishTopic = "";
    ch.clientID = "";
    ch.QOS = "0";
    ch.PubRetain = false;
    ch.lastWillMessage = "";
  } else {
    // 启用时恢复默认
    ch.ip = "121.36.223.224";
    ch.heartbeatTime = 30;
    ch.registerPackage = deviceCode;
    ch.heartbeatPackage = deviceCode;
    if (ch.protocol === "mqtt") {
      ch.port = 1883;
      ch.username = "device";
      ch.password = "11223344";
      ch.subscribeTopic = `/server/coo/${deviceCode}`;
      ch.publishTopic = `/dev/coo/${deviceCode}`;
      ch.clientID = "deviceClient";
      ch.QOS = "0";
      ch.PubRetain = false;
      ch.lastWillMessage = "";
    } else {
      ch.port = 50001;
      ch.username = "";
      ch.password = "";
      ch.subscribeTopic = "";
      ch.publishTopic = "";
      ch.clientID = "";
      ch.QOS = "0";
      ch.PubRetain = false;
      ch.lastWillMessage = "";
    }
  }
};
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
