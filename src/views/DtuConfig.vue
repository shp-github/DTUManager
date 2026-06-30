<template>
  <div class="dtu-config-container">
    <!-- 固定头部 -->
    <div class="header-wrapper">
      <div class="header">
        <h2 class="title">DTU 配置 - {{ device?.name }} ————{{ device?.id }}</h2>
        <div class="actions">

          <button class="lumina-btn" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            返回
          </button>

          <div class="steps">
            <button class="lumina-btn" @click="connectMqtt">
              通知连接
            </button>
            <div class="arrow">→</div>

            <button class="lumina-btn" @click="loadDeviceConfig">
              读取配置
            </button>
            <div class="arrow">→</div>

            <button class="lumina-btn lumina-btn--success" @click="saveConfig">
              <el-icon><DocumentAdd /></el-icon>
              保存
            </button>
            <div class="arrow">→</div>

            <button class="lumina-btn lumina-btn--warning" @click="reboot">
              重启设备
            </button>
          </div>

          <button class="lumina-btn lumina-btn--info" @click="showConfigDialog = true">
            <el-icon><View /></el-icon>
            查看配置
          </button>

        </div>

      </div>

      <div>
        <el-tabs v-model="activeTab" class="tabs-underline" type="card">
          <el-tab-pane label="基本信息" name="basic">
          </el-tab-pane>
          <el-tab-pane label="接口" name="interface">
          </el-tab-pane>
          <el-tab-pane label="网络通道" name="networkChannels">
          </el-tab-pane>
          <el-tab-pane label="Modbus" name="modbus">
          </el-tab-pane>
          <el-tab-pane label="场景配置" name="scene">
          </el-tab-pane>
        </el-tabs>
      </div>

    </div>

    <div class="tab-content-wrapper">
        <BasicConfig v-show="activeTab==='basic'" v-model="allConfig.basic" :device="device" />
        <InterfaceConfig v-show="activeTab==='interface'" v-model="allConfig.interface" />
        <NetworkChannelConfig v-show="activeTab==='networkChannels'" v-model="allConfig.networkChannels" :device="device" />
        <ModbusConfig v-show="activeTab==='modbus'" v-model="allConfig.modbus" />
        <SceneConfig v-show="activeTab==='scene'" v-model="allConfig.scene" />
    </div>

    <!-- 配置查看弹窗 -->
    <el-dialog v-model="showConfigDialog" title="设备配置数据" width="780px" :close-on-click-modal="false" @open="onDialogOpen">
      <div class="config-json-wrapper">
        <div class="ace-editor-container" ref="aceEditorRef"></div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <button class="lumina-btn" @click="copyConfig">
            <el-icon><DocumentCopy /></el-icon>
            复制
          </button>
          <button class="lumina-btn" @click="exportConfig">
            <el-icon><Download /></el-icon>
            导出
          </button>
          <button class="lumina-btn" @click="importConfig">
            <el-icon><Upload /></el-icon>
            导入
          </button>
          <button class="lumina-btn lumina-btn--success" @click="applyConfigEdit">
            <el-icon><DocumentAdd /></el-icon>
            应用
          </button>
          <button class="lumina-btn" @click="showConfigDialog = false">关闭</button>
        </div>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onBeforeUnmount, h, defineComponent } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElSelect, ElOption } from 'element-plus'
import { ArrowLeft, DocumentAdd, View, DocumentCopy, Download, Upload } from '@element-plus/icons-vue'
import ace from 'ace-builds'
import 'ace-builds/src-noconflict/mode-json'
import 'ace-builds/src-noconflict/theme-twilight'
import 'ace-builds/src-noconflict/ext-language_tools'

import BasicConfig from './dtu/BasicConfig.vue'
import NetworkChannelConfig from './dtu/NetworkChannelConfig.vue'
import InterfaceConfig from './dtu/InterfaceConfig.vue'
import ModbusConfig from './dtu/ModbusConfig.vue'
import SceneConfig from './dtu/SceneConfig.vue'

// 接收 device 参数
const props = defineProps<{ device: any }>()
const device = ref(props.device)

const router = useRouter()
const activeTab = ref('basic')

// 配置弹窗
const showConfigDialog = ref(false)

// Ace Editor
const aceEditorRef = ref<HTMLDivElement | null>(null)
let aceEditor: ace.Ace.Editor | null = null

const initAceEditor = () => {
  if (!aceEditorRef.value || aceEditor) return
  aceEditor = ace.edit(aceEditorRef.value, {
    mode: 'ace/mode/json',
    theme: 'ace/theme/twilight',
    fontSize: 14,
    showPrintMargin: false,
    showGutter: true,
    highlightActiveLine: true,
    tabSize: 2,
    useSoftTabs: true,
    wrap: true,
    minLines: 25,
    maxLines: 40,
  })
  aceEditor.setValue(JSON.stringify(allConfig, null, 2), -1)
  aceEditor.clearSelection()
}

// 弹窗打开时同步最新配置到编辑器
const onDialogOpen = () => {
  nextTick(() => {
    if (!aceEditor) {
      initAceEditor()
    } else {
      aceEditor.setValue(JSON.stringify(allConfig, null, 2), -1)
      aceEditor.clearSelection()
      aceEditor.resize()
    }
  })
}

// 获取编辑器当前内容
const getEditorValue = (): string => {
  return aceEditor ? aceEditor.getValue() : ''
}

// 配置对象
const allConfig = reactive({
  basic: {
  },
  interface: {
    "uart1":{},
    "uart2":{},
  },
  networkChannels: [],
  modbus: {},
  scene: {},
  network:{},
})

// 选择网卡IP（多个IP时弹框让用户选择，只有一个则自动使用）
const ensureIPSelected = async (): Promise<boolean> => {
  try {
    const ips: string[] = await window.electronAPI.getAvailableIPs()
    if (!ips || ips.length === 0) {
      ElMessage.error('未检测到可用的网络接口')
      return false
    }
    // 只有一个IP，直接使用
    if (ips.length === 1) {
      await window.electronAPI.setSelectedIP(ips[0])
      return true
    }
    // 多个IP，弹框让用户选择
    const selectedIP = ref(ips[0])
    const SelectIPComponent = defineComponent({
      setup() {
        return () => h('div', { style: 'padding: 10px 0' }, [
          h('p', { style: 'margin-bottom: 10px; color: #606266' }, '检测到多个网络接口，请选择要使用的IP地址：'),
          h(ElSelect, {
            modelValue: selectedIP.value,
            'onUpdate:modelValue': (val: string) => { selectedIP.value = val },
            placeholder: '请选择网卡IP',
            style: 'width: 100%'
          }, () => ips.map(ip => h(ElOption, { key: ip, label: ip, value: ip })))
        ])
      }
    })
    await ElMessageBox({
      title: '选择网卡',
      message: h(SelectIPComponent),
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      showCancelButton: true,
    })
    await window.electronAPI.setSelectedIP(selectedIP.value)
    return true
  } catch {
    return false // 用户取消
  }
}

// 通知设备连接mqtt
const connectMqtt = async () => {
  if (!device.value) return
  try {
    // 确保已选择网卡IP
    const ipReady = await ensureIPSelected()
    if (!ipReady) return

    console.log('通知设备连接mqtt:', device.value.ip)
    const config = await window.electronAPI.connectMqtt(device.value.ip)
    console.log('让设备连接mqtt:\n', JSON.stringify(config, null, 2))

    // 等待1秒
    await new Promise(resolve => setTimeout(resolve, 1000))
    //读取设备配置
    loadDeviceConfig();

  } catch (err) {
    console.error('[ERROR] 通知设备连接mqtt:', err)
    //ElMessage.error('[ERROR] 通知设备连接mqtt' + err)
  }
}

// 读取设备配置（简洁版本）
const EXPECTED_MODULES = ['basic', 'interface', 'network', 'channels', 'modbus']
let receivedModules = new Set<string>()
let checkTimer: ReturnType<typeof setTimeout> | null = null
let loadingMsg: any = null
let isReading = false
let isSaveFlow = false
let readingCompleted = false
let readingId = 0

const loadDeviceConfig = async () => {
  if (!device.value?.id) return

  try {
    const thisReadingId = ++readingId
    readingCompleted = false
    isReading = true
    receivedModules = new Set()
    if (checkTimer) clearTimeout(checkTimer)

    const topic = `/server/cmd/${device.value.id}`
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    for (const [index, module] of EXPECTED_MODULES.entries()) {
      const message = JSON.stringify({type: 'get_config', flag: module})
      const success = window.electronAPI.mqttPublish(topic, message, { qos: 1 })
      console.log(success ? `✓ 发送${module}配置读取命令 (${index+1}/${EXPECTED_MODULES.length})` : `✗ ${module}配置读取命令发送失败`)
      if (index < EXPECTED_MODULES.length - 1) await delay(200)
    }

    console.log('✅ 所有配置读取命令发送完成')
    loadingMsg = ElMessage.info(isSaveFlow ? '写入配置中...' : '读取配置中...')

    // 4 秒后检查结果
    checkTimer = setTimeout(() => {
      if (!isReading || readingCompleted || readingId !== thisReadingId) return
      readingCompleted = true
      isReading = false
      isSaveFlow = false
      loadingMsg?.close()
      const count = receivedModules.size
      if (count === 0) {
        ElMessage.warning('请稍后')
      } else if (count < EXPECTED_MODULES.length) {
        ElMessage.warning('请重试')
      }
    }, 4000)

  } catch (err: any) {
    isReading = false
    console.error('❌ 读取设备配置失败:', err)
    ElMessage.error('读取失败: ' + (err.message || err))
  }
}


// MQTT 消息处理
const handleMqttMessage = (event: any, data: any) => {

  const { topic, payload, client } = data

  // 判断是否当前设备的消息
  if (topic !== `/dev/cmd/${device.value.id}`) return


  let msg
  try {
    msg = typeof payload === 'string' ? JSON.parse(payload) : payload
  } catch (e) {
    console.error("JSON解析失败:", e)
    return
  }

    console.log(JSON.stringify(msg, null, 2))
    console.log("接收设备端配置:", msg)

    // flag 用于区分模块
    const flag = msg.flag
    if (!flag) {
      console.warn("无 flag 字段，忽略")
      return
    }

    // 根据 flag 写入对应配置模块
    switch (flag) {

      case "basic":
        allConfig.basic = msg
        console.log("更新 basic 配置成功:", allConfig.basic)
        break

      case "interface":
        allConfig.interface = {
          uart1: msg.uart1 || {},
          uart2: msg.uart2 || {}
        }
        break

      case "network":
        allConfig.network = {
          ...allConfig.network,
          ...msg
        }
        break

      case "channels":
        allConfig.networkChannels = msg.channels || []
        break

      case "modbus": {
        const raw = msg.data || msg
        const { flag: _f, type: _t, ...modbusData } = raw
        allConfig.modbus = modbusData
        console.log("更新 modbus 配置成功:", allConfig.modbus)
        break
      }

      case "scene": {
        const raw = msg.data || msg
        const { flag: _f, type: _t, ...sceneData } = raw
        allConfig.scene = sceneData
        console.log("更新 scene 配置成功:", allConfig.scene)
        break
      }

      default:
        console.warn("未知 flag:", flag)
        return
    }

    // 仅在读取周期内追踪模块（readingCompleted 保证只触发一次）
    if (isReading && !readingCompleted) {
      receivedModules.add(flag)
      console.log(`已收到: ${receivedModules.size}/${EXPECTED_MODULES.length} 个模块`)

      // 全部模块收到 → 关闭 loading 和定时器，提示成功
      if (receivedModules.size >= EXPECTED_MODULES.length) {
        readingCompleted = true
        isReading = false
        if (checkTimer) { clearTimeout(checkTimer); checkTimer = null }
        loadingMsg?.close()
        if (isSaveFlow) {
          isSaveFlow = false
          ElMessage.success('写入成功')
        } else {
          ElMessage.success('读取成功')
        }
      }
    }

}


// 每秒更新运行时间
let runtimeTimer: number
onMounted(() => {

  // 先清理旧的 MQTT 监听器（防止热重载累积），再注册新的
  window.electronAPI.removeMqttListeners()
  window.electronAPI.deviceConfigMessage(handleMqttMessage)

  // 每秒更新运行时间
  runtimeTimer = window.setInterval(() => {
    if (device.value && device.value.runtime !== undefined) {
      device.value.runtime += 1
    }
  }, 1000)

  // 监听菜单操作
  window.electronAPI.on('menu-action', (action: string) => {
    if (action === 'save') saveConfig()
  })

  // 通知设备连接mqtt
  connectMqtt();
})

onBeforeUnmount(() => {
  clearInterval(runtimeTimer)
  window.electronAPI.off('menu-action', () => {})
  window.electronAPI.removeMqttListeners()
  if (aceEditor) {
    aceEditor.destroy()
    aceEditor = null
  }
})


const reboot = () => {
  console.log('通知设备重启:', device.value.ip)
  window.electronAPI.deviceReboot(device.value.ip)
  ElMessage.success('已通知设备重启')
}


// 返回
const goBack = () => router.push({ name: 'DeviceList' })

// 复制配置JSON
const copyConfig = async () => {
  try {
    await navigator.clipboard.writeText(getEditorValue())
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

// 应用编辑后的JSON到配置
const applyConfigEdit = () => {
  try {
    const parsed = JSON.parse(getEditorValue())
    // 合并解析后的数据到 allConfig，保留已有键
    for (const key of Object.keys(allConfig)) {
      if (parsed[key] !== undefined) {
        ;(allConfig as any)[key] = parsed[key]
      }
    }
    ElMessage.success('配置已应用')
  } catch (e: any) {
    ElMessage.error('JSON 格式错误: ' + e.message)
  }
}

// 导出配置到本地 JSON 文件
const exportConfig = async () => {
  try {
    const jsonStr = JSON.stringify(allConfig, null, 2)
    const deviceName = device.value?.name || ''
    const deviceId = device.value?.id || ''
    const result = await window.electronAPI.exportConfigFile(jsonStr, deviceName, deviceId)
    if (result.success) {
      ElMessage.success('配置已导出')
    }
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e.message || e))
  }
}

// 从本地 JSON 文件导入配置
const importConfig = async () => {
  try {
    const result = await window.electronAPI.importConfigFile()
    if (!result.success || !result.data) return
    const parsed = JSON.parse(result.data)
    // 合并解析后的数据到 allConfig
    for (const key of Object.keys(allConfig)) {
      if (parsed[key] !== undefined) {
        ;(allConfig as any)[key] = parsed[key]
      }
    }
    ElMessage.success('配置已导入')
  } catch (e: any) {
    ElMessage.error('导入失败: ' + (e.message || e))
  }
}

// 保存配置
const saveConfig = async () => {
  if (!device.value) return
  try {
    const topic = `/server/cmd/${device.value.id}`
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // 定义配置消息数组
    const configMessages = [
      // Basic 配置
      {
        topic,
        message: JSON.stringify({
          type: 'set_config',
          flag: 'basic',
          ...allConfig.basic
        })
      },
      // Interface 配置
      {
        topic,
        message: JSON.stringify({
          type: 'set_config',
          flag: 'interface',
          uart1: allConfig.interface.uart1 || {},
          uart2: allConfig.interface.uart2 || {}
        })
      },
      // Channels 配置
      {
        topic,
        message: JSON.stringify({
          type: 'set_config',
          flag: 'channels',
          channels: allConfig.networkChannels || []
        })
      },
      // Modbus 配置
      {
        topic,
        message: JSON.stringify({
          type: 'set_config',
          flag: 'modbus',
          data: allConfig.modbus || {}
        })
      },
    ]

    // 依次发送每个配置，跟踪成功数
    let sendOk = 0
    for (let msg of configMessages) {
      const success = window.electronAPI.mqttPublish(msg.topic, msg.message, { qos: 2 })
      if (success) {
        sendOk++
        console.log(`发送配置: -> ${msg.topic} ${msg.message}`)
      } else {
        console.error(`发送配置失败: ${msg.topic}`)
      }
      await sleep(200)
    }

    // 三态结果判断
    if (sendOk === 0) {
      ElMessage.warning('请稍后')
      return
    }
    if (sendOk < configMessages.length) {
      ElMessage.warning('请重试')
      return
    }

    // 全部发送成功 → 标记为写入流程，回读验证
    isSaveFlow = true
    loadDeviceConfig()

  } catch (err: any) {
    ElMessage.error('保存异常: ' + (err.message || err))
  }
}

</script>

<style scoped>
.dtu-config-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
}

.header-wrapper {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #f2f2f2;
}

.title {
  font-size: 24px;
  font-weight: 700;
  color: #333;
  margin: 0;
}

.actions {
  display: flex;
  gap: 14px;
  align-items: center;
  /* Lumina按钮hover上浮空间 */
  overflow: visible;
  padding: 4px 0;
}

/* lumina-btn含图标时保持flex对齐 */
.actions .lumina-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* 固定 Tab Header */
.tabs-underline ::v-deep(.el-tabs__header) {
  flex-shrink: 0;
  background: #fff;
  border-bottom: 2px solid #e0e0e0;
  padding: 0 10px;
  margin: 0;
}

.tabs-underline ::v-deep(.el-tabs__item) {
  border: none !important;
  margin: 0 10px 0 0;
  padding: 14px 22px;
  font-weight: 600;
  font-size: 18px;
  color: #606266;
  position: relative;
  transition: color 0.2s;
}

.tabs-underline ::v-deep(.el-tabs__item.is-active) {
  color: #409EFF;
}

.tabs-underline ::v-deep(.el-tabs__item.is-active)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background-color: #409EFF;
  border-radius: 2px 2px 0 0;
}

/* 滚动内容 */
.tab-content-wrapper {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content-wrapper ::v-deep(.el-tabs) {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tab-content-wrapper ::v-deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
}


.steps {
  display: flex;
  align-items: center;
  gap: 6px;
}

.arrow {
  font-weight: bold;
  font-size: 18px;
  color: #606266;
}

</style>

<!-- 暗夜模式适配 -->
<style>
html.dark .dtu-config-container {
  background: #121212;
}

html.dark .header-wrapper {
  background: #1e1e1e;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
}

html.dark .header {
  border-bottom-color: #333;
}

html.dark .title {
  color: #e0e0e0;
}

html.dark .arrow {
  color: #a0aec0;
}

html.dark .tabs-underline .el-tabs__header {
  background: #1e1e1e;
  border-bottom-color: #333;
}

html.dark .tabs-underline .el-tabs__item {
  color: #a0aec0;
}

html.dark .tabs-underline .el-tabs__item.is-active {
  color: #58a6ff;
}

html.dark .tabs-underline .el-tabs__item.is-active::after {
  background-color: #58a6ff;
}

/* 配置弹窗 footer 按钮间距 */
.dialog-footer {
  display: flex;
  gap: 14px;
  justify-content: flex-end;
}

/* 配置弹窗 JSON 编辑器样式 */
.config-json-wrapper {
  border-radius: 8px;
  overflow: hidden;
}

.ace-editor-container {
  height: 55vh;
  border: 1px solid #444;
  border-radius: 8px;
  overflow: hidden;
}

/* Ace Editor 暗夜主题已自带深色背景，无需额外适配 */

/* ===== 配置查看弹窗 — 强制暗色终端风格（不受亮/暗模式影响） ===== */
.dtu-config-container .el-dialog {
  background: #161b22 !important;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.1) !important;
  border-radius: 20px !important;
  box-shadow: 0 24px 64px rgba(0,0,0,0.7) !important;
}
.dtu-config-container .el-dialog__header {
  border-bottom: 1px solid rgba(255,255,255,0.08);
  padding: 20px 24px 16px;
  background: #161b22 !important;
  margin-right: 0;
}
.dtu-config-container .el-dialog__title {
  color: #e0e0e0 !important;
  font-weight: 700;
  font-size: 16px;
}
.dtu-config-container .el-dialog__headerbtn .el-dialog__close {
  color: #94a3b8 !important;
}
.dtu-config-container .el-dialog__headerbtn:hover .el-dialog__close {
  color: #e0e0e0 !important;
}
.dtu-config-container .el-dialog__body {
  color: #cbd5e1;
  padding: 20px 24px;
  background: #161b22 !important;
}
.dtu-config-container .el-dialog__footer {
  background: #161b22 !important;
  padding: 16px 24px 20px;
  overflow: visible;
}

/* 弹窗内按钮恢复原生 Lumina 发光样式（覆盖亮色模式的扁平化覆写） */
.dtu-config-container .el-dialog .lumina-btn {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  box-shadow: 0 2px 12px rgba(59,130,246,0.35), 0 0 30px rgba(59,130,246,0.1) !important;
  color: #fff !important;
}
.dtu-config-container .el-dialog .lumina-btn:hover {
  background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
  transform: translateY(-2px);
  z-index: 10;
  box-shadow: 0 6px 24px rgba(59,130,246,0.5), 0 0 50px rgba(59,130,246,0.2) !important;
}
.dtu-config-container .el-dialog .lumina-btn--success {
  background: linear-gradient(135deg, #10b981, #059669) !important;
  box-shadow: 0 2px 12px rgba(16,185,129,0.35), 0 0 30px rgba(16,185,129,0.1) !important;
}
.dtu-config-container .el-dialog .lumina-btn--success:hover {
  box-shadow: 0 6px 24px rgba(16,185,129,0.5), 0 0 50px rgba(16,185,129,0.2) !important;
}
.dtu-config-container .el-dialog .lumina-btn--warning {
  background: linear-gradient(135deg, #f59e0b, #d97706) !important;
  box-shadow: 0 2px 12px rgba(245,158,11,0.35), 0 0 30px rgba(245,158,11,0.1) !important;
}
.dtu-config-container .el-dialog .lumina-btn--ghost {
  background: transparent !important;
  border: 1px solid rgba(255,255,255,0.15) !important;
  color: #a0aec0 !important;
  box-shadow: none !important;
}
.dtu-config-container .el-dialog .lumina-btn--ghost:hover {
  background: rgba(255,255,255,0.06) !important;
  border-color: rgba(255,255,255,0.25) !important;
  color: #e0e0e0 !important;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.3) !important;
}

/* Ace Editor 容器边框与暗色协调 */
.dtu-config-container .ace-editor-container {
  border-color: rgba(255,255,255,0.1) !important;
}
</style>
