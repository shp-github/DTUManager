<template>
  <div class="dtu-list-container">

    <span style="
        display: inline-block;
        margin-bottom: 10px;
        font-family: 'Microsoft YaHei', 'SimHei', '黑体', Arial, sans-serif;
        font-size: 16px;
        color: #ff0000;
        font-weight: bold;
    ">
      注意：没有dhcp服务或者路由器的，需要手动启用dhcp服务
    </span>

    <!-- 搜索 -->
    <div class="device-search">
      <el-input
          v-model="searchText"
          placeholder="输入设备号/设备名称/IP搜索"
          clearable
          class="search-input"
      />

      <!-- 网络类型下拉选择 -->
      <el-select
          class="search-input"
          v-model="networkTypeFilter"
          placeholder="全部类型"
          clearable
      >
        <el-option label="全部类型" value="" />
        <el-option label="ETH (有线)" value="ETH" />
        <el-option label="WiFi (无线)" value="WiFi" />
      </el-select>

      <el-button type="primary"  @click="searchDevices">
        搜索
      </el-button>

      <!-- 批量操作按钮 -->
      <el-button
          type="primary"
          :disabled="multipleSelection.length === 0"
          @click="batchUpgrade"
      >
        批量升级({{multipleSelection.length}})
      </el-button>

    </div>

    <p style="font-size: 18px; font-weight: 700; color: #333;">
      当前设备数量：{{ filteredDevices.length }}
    </p>
    <!-- 设备表格 -->
    <el-table
        :data="filteredDevices"
        style="width:100%; min-width: 1500px;"
        stripe
        border
        :row-style="{ height: '48px' }"
        @selection-change="handleSelectionChange"
        :fit="true"
        :show-header="true"
    >
    <el-table-column type="selection" width="55" />
    <el-table-column prop="name" label="设备名称" width="160" resizable />
    <el-table-column prop="id" label="设备号" width="140" resizable />
    <el-table-column prop="ip" label="IP 地址" width="140" resizable />
    <el-table-column prop="firmware" label="固件版本" width="100" resizable />
    <el-table-column prop="networkType" label="网络类型" width="90" resizable />
    <el-table-column prop="RSSI" label="信号" width="80" resizable />
    <el-table-column prop="mac" label="MAC地址" width="180" resizable />
    <el-table-column label="运行时间" width="200" resizable>
      <template #default="{ row }">
        {{ formatRuntime(row.runtime) }}
      </template>
    </el-table-column>
    <el-table-column prop="heart_interval" label="心跳(s)" width="80" resizable />

    <!-- 操作列放到最后并固定 -->
    <el-table-column
        label="操作"
        width="220"
        fixed="right"
        align="center"
    >
      <template #default="{ row }">
        <div class="action-buttons">
          <el-button type="primary" size="small" @click="goToConfig(row)">
            设备管理
          </el-button>
          <el-button
              type="warning"
              size="small"
              @click="openUpgradeDialog(row,false)">
            升级
          </el-button>
          <el-button
              type="success"
              size="small"
              @click="openTerminalDialog(row)">
            终端
          </el-button>
        </div>
      </template>
    </el-table-column>
  </el-table>

  </div>

  <!-- 升级对话框 -->
  <el-dialog
      v-model="upgradeDialogVisible"
      :title="isBatch==false?'设备升级':'批量升级'"
      width="500px"
      :before-close="handleDialogClose"
  >
    <div class="upgrade-content">
      <div v-if="currentDevice && !isBatch" class="device-info">
        <p><strong>目标设备:</strong> {{ currentDevice.id }}</p>
        <p><strong>IP地址:</strong> {{ currentDevice.ip }}</p>
        <p><strong>当前版本:</strong> {{ currentDevice.firmware }}</p>
      </div>

      <div class="file-upload-section">
        <el-alert
            title="请选择升级文件 (.bin)"
            type="info"
            :closable="false"
            style="margin-bottom: 15px;"
        />

        <el-upload
            class="upload-demo"
            drag
            action=""
            :auto-upload="false"
            :on-change="handleUpgradeFile"
            :file-list="fileList"
            :limit="1"
            accept=".bin"
        >
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          <div class="el-upload__text">
            将升级文件拖到此处，或<em>点击选择</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              支持 bin格式文件，且不超过 2MB
            </div>
          </template>
        </el-upload>

        <div v-if="selectedFile" class="file-info">
          <p><strong>已选择文件:</strong> {{ selectedFile.name }}</p>
          <p><strong>文件大小:</strong> {{ formatFileSize(selectedFile.size) }}</p>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="upgradeDialogVisible = false" :disabled="uploading">
        取消
      </el-button>
      <el-button
          type="primary"
          @click="submitUpgrade"
          :loading="uploading"
          :disabled="!selectedFile"
      >
        {{ uploading ? '升级中...' : '开始升级' }}
      </el-button>
    </template>
  </el-dialog>

  <!-- 新增终端对话框 -->
  <el-dialog
      v-model="terminalDialogVisible"
      title="设备终端"
      width="800px"
      :fullscreen="isTerminalFullscreen"
      :before-close="handleTerminalDialogClose"
  >
    <div class="terminal-dialog-content">
      <!-- 终端控制栏 -->
      <div class="terminal-controls">
        <div class="device-info">
          <span><strong>设备ID:</strong> {{ currentDevice?.id }}</span>
          <span><strong>IP:</strong> {{ currentDevice?.ip }}</span>
        </div>
        <div class="control-buttons">
          <el-button
              type="primary"
              size="small"
              @click="toggleTerminalConnection"
              :loading="terminalConnecting"
          >
            {{ isTerminalConnected ? '断开连接' : '连接终端' }}
          </el-button>
          <el-button size="small" @click="clearTerminal">清空终端</el-button>
          <el-button
              size="small"
              @click="toggleTerminalFullscreen"
          >
            {{ isTerminalFullscreen ? '退出全屏' : '全屏' }}
          </el-button>
          <el-tag :type="isTerminalConnected ? 'success' : 'info'">
            {{ isTerminalConnected ? '已连接' : '未连接' }}
          </el-tag>
        </div>
      </div>

      <!-- 终端输出区域 -->
      <div class="terminal-output" ref="terminalOutput">
        <div
            v-for="(log, index) in terminalLogs"
            :key="index"
            :class="['log-entry', log.type]"
        >
          <span class="timestamp">[{{ log.timestamp }}]</span>
          <span class="topic" v-if="log.topic">TOPIC: {{ log.topic }}</span>
          <span class="message">{{ log.message }}</span>
        </div>
      </div>

      <!-- 终端输入区域 -->
      <div class="terminal-input">
        <el-input
            v-model="terminalInput"
            placeholder="输入要发送的消息"
            :disabled="!isTerminalConnected"
            @keyup.enter="sendTerminalMessage"
        >
          <template #append>
            <el-button
                :disabled="!isTerminalConnected || !terminalInput"
                @click="sendTerminalMessage"
            >
              发送
            </el-button>
          </template>
        </el-input>

        <div class="quick-commands">
          <el-button
              size="small"
              v-for="cmd in quickCommands"
              :key="cmd.name"
              @click="executeQuickCommand(cmd)"
              :disabled="!isTerminalConnected"
          >
            {{ cmd.name }}
          </el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import {ref, onMounted, nextTick, h, defineComponent} from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, ElSelect, ElOption } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'

const router = useRouter()

// 设备列表相关状态
const searchText = ref('')
const networkTypeFilter = ref('')
const filteredDevices = ref<any[]>([])

// 升级相关状态
const isBatch = ref(false)
const upgradeDialogVisible = ref(false)
const currentDevice = ref<any>(null)
const selectedFile = ref<File | null>(null)
const fileList = ref<any[]>([])
const uploading = ref(false)

// 终端相关状态
const terminalDialogVisible = ref(false)
const isTerminalFullscreen = ref(false)
const isTerminalConnected = ref(false)
const terminalConnecting = ref(false)
const terminalLogs = ref<any[]>([])
const terminalInput = ref('')
const terminalOutput = ref<HTMLElement>()

// 快速命令
const quickCommands = ref([
  { name: '获取配置', topic: `/server/cmd/`, action: 'get_config'},
  { name: '重启设备(MQTT)', topic: `/server/cmd/`, message: '{"type":"reboot"}' },
  { name: '重启设备(UDP)', topic: ``, message: '',action: 'reboot' },
  { name: '获取设备号', topic: `/server/cmd/`, message: '{"type":"get_client_id"}' },
  { name: '清空终端', topic: '', message: '', action: 'clear' },
  { name: '通知设备连接', topic: '', message: '', action: 'connect' }
])


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

// 选中的设备
const multipleSelection = ref<any[]>([])

// 选中行变化
function handleSelectionChange(val: any[]) {
  multipleSelection.value = val
}

// 批量升级操作
function batchUpgrade() {
  console.log('批量升级设备:', multipleSelection.value)
  // 这里调用你的批量升级接口或逻辑

  openUpgradeDialog(null,true);

  //清空选择框，让设备列表刷新
  //multipleSelection.value = []

}


const setList= (list:any[]) => {

    let newList = [];
    for (let i = 0; i < list.length; i++) {
      let obj = list[i];

      let pd = true;

      //过滤关键字
      if((searchText.value!=null && searchText.value!='')) {
        if((obj.name.indexOf(searchText.value)==-1
            && obj.id.indexOf(searchText.value)==-1
            && obj.ip.indexOf(searchText.value)==-1)){
          pd = false;
        }
      }

      //过滤网络类型
      if((networkTypeFilter.value!=null && networkTypeFilter.value!='')){
        if(obj.networkType.indexOf(networkTypeFilter.value)==-1){
          pd = false;
        }
      }

      if(pd){
        newList.push(obj);
      }

    }
    filteredDevices.value = newList
}


// 搜索设备
const searchDevices = () => {
  setList(filteredDevices.value)
}

// 跳转配置页
const goToConfig = (device: any) => {
  console.log("跳转配置页面", JSON.stringify(device))
  router.push({
    name: 'DtuConfig',
    query: { device: JSON.stringify(device) }
  })
}

// 打开升级对话框
const openUpgradeDialog = (device: any = null,batch:boolean ) => {
  currentDevice.value = device
  selectedFile.value = null
  fileList.value = []
  upgradeDialogVisible.value = true
  isBatch.value = batch
}

// 处理文件选择
const handleUpgradeFile = (file: any) => {
  const maxSize = 2 * 1024 * 1024 // 2MB
  if (file.size > maxSize) {
    ElMessage.error('文件大小超过 2MB 限制，请选择更小的文件')
    selectedFile.value = null
    fileList.value = []
    return false
  }
  selectedFile.value = file.raw
  fileList.value = [file]
}

// 对话框关闭前的处理
const handleDialogClose = (done: () => void) => {
  if (uploading.value) {
    ElMessage.warning('升级进行中，请稍候...')
    return
  }
  done()
}

// 提交升级
const submitUpgrade = async () => {
  if (!selectedFile.value) {
    ElMessage.warning('请先选择升级文件')
    return
  }

  if (!isBatch.value && !currentDevice.value) {
    ElMessage.warning('未选择目标设备')
    return
  }

  // 确认升级
  try {

    let message = isBatch.value ? `确认要批量升级${multipleSelection.value.length}个设备吗？` :`确定要对设备 ${currentDevice.value.id} (${currentDevice.value.ip}) 进行升级吗？`  ;

    await ElMessageBox.confirm(
        message,
        '确认升级',
        {
          confirmButtonText: '确定升级',
          cancelButtonText: '取消',
          type: 'warning',
        }
    )
  } catch {
    return // 用户取消
  }

  uploading.value = true

  try {
    // 0. 确保已选择网卡IP
    const ipReady = await ensureIPSelected()
    if (!ipReady) {
      uploading.value = false
      return
    }

    // 1. 读取文件内容
    const arrayBuffer = await readFileAsArrayBuffer(selectedFile.value)

    // 2. 保存文件到服务器
    const saveResult = await window.electronAPI.saveFile(
        selectedFile.value.name,
        arrayBuffer
    )

    if (!saveResult.success) {
      throw new Error(`文件保存失败: ${saveResult.error}`)
    }


    if(!isBatch.value){
      // 3. 发送升级命令到设备（包含完整的下载地址）
      const upgradeResult = await window.electronAPI.sendUpgradeCommand(
          currentDevice.value.ip,
          selectedFile.value.name,
          {
            port: 8080, // 文件服务器端口，可以根据实际情况调整
            fileSize: selectedFile.value.size
          }
      )

      if (!upgradeResult.success) {
        throw new Error(`升级命令发送失败: ${upgradeResult.error}`)
      }

      ElMessage.success({
        message: `升级命令已发送！设备可以从以下地址下载文件：${upgradeResult.downloadUrl}`,
        duration: 8000, // 显示时间更长
        showClose: true
      })

      console.log('📤 升级文件下载地址:', upgradeResult.downloadUrl)

      //打开终端串口
      openTerminalDialog(currentDevice.value)

      //使用mqtt推送升级
      const topic = `/server/cmd/${currentDevice.value.id}`
      const message = JSON.stringify({
        type: 'ota',
        downloadUrl: upgradeResult.downloadUrl
      });
      window.electronAPI.mqttPublish(topic,message,{ qos: 1 } );
    }
    //批量推送设备升级
    else{

      // 遍历每台设备进行升级
      for (const device of multipleSelection.value) {
        try {
          const upgradeResult = await window.electronAPI.sendUpgradeCommand(
              device.ip,
              selectedFile.value.name,
              {
                port: 8080,
                fileSize: selectedFile.value.size
              }
          )

          if (!upgradeResult.success) {
            throw new Error(upgradeResult.error)
          }

          // 使用 MQTT 推送升级命令
          const topic = `/server/cmd/${device.id}`
          const message = JSON.stringify({type: 'ota',downloadUrl: upgradeResult.downloadUrl})
          await window.electronAPI.mqttPublish(topic, message,  { qos: 1 })

          ElMessage.success({
            message: `设备 ${device.id} 升级命令已发送`,
            duration: 5000
          })

        } catch (err: any) {
          console.error(`设备 ${device.id} 升级失败:`, err)
          ElMessage.error(`设备 ${device.id} 升级失败: ${err.message}`)
        }
      }
      multipleSelection.value = []
    }

    // 关闭对话框
    upgradeDialogVisible.value = false

    // 重置状态
    selectedFile.value = null
    fileList.value = []


  } catch (error: any) {
    console.error('升级失败:', error)
    ElMessage.error(`升级失败: ${error.message}`)
  } finally {
    uploading.value = false
  }
}

// 读取文件为 ArrayBuffer
const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 转换秒为 "X天 Y小时 Z分钟 W秒" 格式
const formatRuntime = (seconds: number) => {
  const days = Math.floor(seconds / (24 * 3600))
  const hours = Math.floor((seconds % (24 * 3600)) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const sec = seconds % 60

  return `${days}天 ${hours}小时 ${minutes}分钟 ${sec}秒`
}

// ================== 终端功能相关方法 ==================

// 打开终端对话框
const openTerminalDialog = (device: any) => {

  currentDevice.value = device
  terminalDialogVisible.value = true
  isTerminalConnected.value = false
  terminalLogs.value = []
  terminalInput.value = ''

  // 添加欢迎信息
  addTerminalLog('info', `终端已就绪，设备ID: ${device.id}`)
  addTerminalLog('info', '输入格式: "主题 消息内容" 或直接输入JSON消息')
  addTerminalLog('info', '支持的主题:')
  addTerminalLog('info', `  订阅: /dev/coo/${device.id}, /dev/ota/${device.id}, /dev/cmd/${device.id}`)
  addTerminalLog('info', `  发布: /server/coo/${device.id}`)

  //连接终端
  toggleTerminalConnection();

}

const connectMqtt = async (device: any) => {
  console.log('通知设备连接mqtt:', device.ip)
  // 确保已选择网卡IP
  const ipReady = await ensureIPSelected()
  if (!ipReady) return
  window.electronAPI.connectMqtt(device.ip)
  addTerminalLog('info', `通知设备连接mqtt，设备ID: ${device.id}`)
}

const reboot = (device: any) => {
  console.log('通知设备重启:', device.ip)
  window.electronAPI.deviceReboot(device.ip)
  addTerminalLog('info', `通知设备重启，设备ID: ${device.id}`)
}

// 切换终端连接状态
const toggleTerminalConnection = async () => {
  if (isTerminalConnected.value) {
    // 断开连接
    isTerminalConnected.value = false
    terminalConnecting.value = false
    addTerminalLog('info', '终端已断开连接')
    return
  }

  terminalConnecting.value = true
  try {
    // 模拟连接过程
    await new Promise(resolve => setTimeout(resolve, 500))

    // 订阅设备相关主题
    await subscribeToDeviceTopics()
    isTerminalConnected.value = true
    addTerminalLog('success', '终端已连接，开始监听设备消息')
  } catch (error) {
    addTerminalLog('error', `连接失败: ${error}`)
  } finally {
    terminalConnecting.value = false
  }
}

// 订阅设备主题
const subscribeToDeviceTopics = async () => {
  if (!currentDevice.value) return

  const deviceId = currentDevice.value.id
  const cooTopic = `/dev/coo/${deviceId}`
  const otaTopic = `/dev/ota/${deviceId}`
  const cmdTopic = `/dev/cmd/${deviceId}`

  addTerminalLog('info', `订阅主题: ${cooTopic}`)
  addTerminalLog('info', `订阅主题: ${otaTopic}`)
  addTerminalLog('info', `订阅主题: ${cmdTopic}`)

  // 这里可以通过 IPC 告诉主进程订阅这些主题
  // await window.electronAPI.mqttSubscribe([cooTopic, otaTopic])
}

// 发送终端消息
const sendTerminalMessage = async () => {

  if (!terminalInput.value.trim() || !currentDevice.value) return

  const input = terminalInput.value.trim()

  let topic = `/server/coo/${currentDevice.value.id}`
  let message = input

  try {
    // 尝试解析 JSON
    const parsedMessage = JSON.parse(message)
    message = JSON.stringify(parsedMessage)
  } catch {
    // 如果不是 JSON，保持原样
    message = JSON.stringify({ data: message })
  }

  // 通过 MQTT 发布消息
  const success = await window.electronAPI.mqttPublish(topic,message,{ qos: 1 })
  if (success) {
    addTerminalLog('send', `发送到 ${topic}: ${message}`)
    terminalInput.value = ''
  } else {
    addTerminalLog('error', '消息发送失败')
  }
}

// 执行快速命令
const executeQuickCommand = (cmd: any) => {

  // 发布快速命令
  const topic = cmd.topic ? cmd.topic + currentDevice.value.id : `/server/coo/${currentDevice.value.id}`
  console.log(`执行快速命令 ${topic} message:${JSON.stringify(cmd)}`)

  if (cmd.action === 'clear') {
    clearTerminal()
    return
  }

  if(cmd.action === 'reboot') {
    reboot(currentDevice.value);
    return
  }

  if(cmd.action === 'connect') {
    connectMqtt(currentDevice.value);
    return
  }

  if (cmd.action === 'get_config') {
    const modules = ['basic', 'interface', 'network', 'channels', 'modbus']
    const delay = 200;

    modules.forEach((module, index) => {
      setTimeout(() => {
        const message = JSON.stringify({
          type: 'get_config',
          flag: module
        });

        const success = window.electronAPI.mqttPublish(topic,message, { qos: 1 });
        if (success) {
          addTerminalLog('send', `快速命令: ${cmd.name} -> ${topic} ${message}`)
        }

      }, index * delay);

    });
    return;
  }

  if (!currentDevice.value) return

  console.log(`主题：${topic} 类型${typeof topic}`)

  const success  =  window.electronAPI.mqttPublish(topic,cmd.message,{ qos: 1 });

  if (success) {
    addTerminalLog('send', `快速命令: ${cmd.name} -> ${topic} ${cmd.message}`)
  }

}

// 添加终端日志
const addTerminalLog = (type: string, message: string, topic?: string) => {
  const log = {
    type,
    message,
    topic,
    timestamp: new Date().toLocaleTimeString()
  }

  terminalLogs.value.push(log)

  // 限制日志数量
  if (terminalLogs.value.length > 1000) {
    terminalLogs.value = terminalLogs.value.slice(-500)
  }

  // 自动滚动到底部
  nextTick(() => {
    if (terminalOutput.value) {
      terminalOutput.value.scrollTop = terminalOutput.value.scrollHeight
    }
  })
}

// 清空终端
const clearTerminal = () => {
  terminalLogs.value = []
}

// 切换终端全屏
const toggleTerminalFullscreen = () => {
  isTerminalFullscreen.value = !isTerminalFullscreen.value
}

// 终端对话框关闭前的处理
const handleTerminalDialogClose = (done: () => void) => {
  if (isTerminalConnected.value) {
    ElMessageBox.confirm('终端正在连接中，确定要关闭吗？', '确认关闭', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => {
      isTerminalConnected.value = false
      done()
    }).catch(() => {
      // 用户取消关闭
    })
  } else {
    done()
  }
}

// MQTT 消息处理
const handleMqttMessage = (event: any, data: any) => {
  if (!isTerminalConnected.value || !currentDevice.value) return

  const { topic, payload, client } = data

  // 只处理当前设备的消息
  if (topic.includes(currentDevice.value.id)) {
    addTerminalLog('receive', payload, topic)
  }
}

// 监听 Electron UDP 发现设备
onMounted(() => {
  // 监听设备发现（这个事件应该由主进程在扫描到设备时触发）
  window.electronAPI.onDeviceDiscovered((list: any[]) => {
    if(!multipleSelection.value || !multipleSelection.value.length ||multipleSelection.value.length==0){
        setList([...list])
    }
  })
  // 监听 MQTT 消息
  window.electronAPI.onMqttMessagePublished(handleMqttMessage)
})


</script>

<style scoped>
.dtu-list-container {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 20px;
  color: #303133;
}

.device-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  margin-bottom: 20px;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.search-input {
  width: 280px;
}

.el-table-wrapper {
  flex-grow: 1;
  overflow-y: auto;
  max-height: calc(100vh - 220px);
}

.el-table {
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  max-height: 100%;
  overflow: hidden;
}

.el-table th.el-table__cell {
  background-color: #f2f6fc !important;
  font-weight: 600;
  color: #303133;
  height: 45px;
}

.el-table .el-table__row {
  height: 48px;
}

.el-table tbody tr:hover > td {
  background: #f9fbff !important;
}

.el-button--primary.is-link,
.el-button--primary {
  border-radius: 8px;
}

.el-button--primary {
  background-color: #409eff;
  border-color: #409eff;
}

.el-button--primary:hover {
  background-color: #66b1ff;
  border-color: #66b1ff;
}

/* 升级对话框样式 */
.upgrade-content {
  padding: 10px 0;
}

.device-info {
  background: #f0f9ff;
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 20px;
  border-left: 4px solid #409eff;
}

.device-info p {
  margin: 5px 0;
  color: #333;
}

.file-upload-section {
  margin-top: 20px;
}

.file-info {
  margin-top: 15px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.file-info p {
  margin: 5px 0;
  color: #495057;
}

:deep(.el-upload-dragger) {
  width: 100%;
}

/* 终端对话框样式 */
.terminal-dialog-content {
  display: flex;
  flex-direction: column;
  height: 60vh;
}

.terminal-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 8px 0;
  border-bottom: 1px solid #e4e7ed;
}

.device-info {
  display: flex;
  gap: 16px;
  font-size: 14px;
}

.control-buttons {
  display: flex;
  gap: 8px;
  align-items: center;
}

.terminal-output {
  flex: 1;
  background: #1e1e1e;
  border-radius: 4px;
  padding: 12px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  color: #d4d4d4;
  overflow-y: auto;
  margin-bottom: 16px;
  min-height: 300px;
}

.log-entry {
  margin-bottom: 4px;
  line-height: 1.4;
  word-break: break-all;
}

.log-entry .timestamp {
  color: #6a9955;
  margin-right: 8px;
}

.log-entry .topic {
  color: #569cd6;
  margin-right: 8px;
  font-weight: bold;
}

.log-entry.info .message {
  color: #9cdcfe;
}

.log-entry.success .message {
  color: #4ec9b0;
}

.log-entry.error .message {
  color: #f44747;
}

.log-entry.send .message {
  color: #ce9178;
}

.log-entry.receive .message {
  color: #d7ba7d;
}

.terminal-input {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-commands {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.quick-commands .el-button {
  font-size: 12px;
  padding: 4px 8px;
}

/* 全屏模式下的样式调整 */
:deep(.el-dialog__wrapper) {
  z-index: 2000 !important;
}

:deep(.el-dialog--fullscreen) {
  .terminal-dialog-content {
    height: calc(100vh - 100px);
  }

  .terminal-output {
    min-height: 60vh;
  }
}



</style>