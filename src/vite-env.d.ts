/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  electronAPI: ElectronAPI
}

interface ElectronAPI {
  // 基础通信
  on: (channel: string, listener: (...args: any[]) => void) => void
  off: (channel: string, listener?: (...args: any[]) => void) => void
  send: (channel: string, ...args: any[]) => void
  invoke: (channel: string, ...args: any[]) => Promise<any>

  // 窗口控制
  windowMinimize: () => void
  windowMaximize: () => void
  windowClose: () => void
  windowIsMaximized: () => Promise<boolean>

  // 配置
  saveConfig: (config: any) => Promise<any>
  loadConfig: () => Promise<any>
  readDeviceConfig: (params: any) => Promise<any>
  openChildWindow: (page: string) => Promise<any>
  sendConfig: (payload: { ip: string; config: any }) => Promise<any>

  // 设备发现
  onDeviceDiscovered: (callback: (devices: any[]) => void) => void

  // 文件
  saveFile: (fileName: string, fileData: ArrayBuffer) => Promise<{ success: boolean; error?: string; downloadUrl?: string }>
  getFileList: () => Promise<any>

  // 配置导出/导入
  exportConfigFile: (jsonStr: string, deviceName?: string, deviceId?: string) => Promise<{ success: boolean; path?: string; error?: string }>
  importConfigFile: () => Promise<{ success: boolean; data?: string; error?: string }>

  // 升级
  sendUpgradeCommand: (deviceIp: string, fileName: string, serverInfo: { port: number; fileSize: number }) => Promise<{ success: boolean; error?: string; downloadUrl?: string }>

  // MQTT & 设备
  connectMqtt: (deviceIp: string) => Promise<any>
  deviceReboot: (deviceIp: string) => Promise<any>
  mqttPublish: (topic: string, message: string, options?: any) => Promise<boolean>
  mqttGetStatus: () => Promise<any>
  mqttSendConfig: (deviceId: string, config: any) => Promise<any>
  mqttRequestConfig: (deviceId: string) => Promise<any>

  // MQTT 事件
  onMqttClientConnected: (callback: (...args: any[]) => void) => void
  onMqttClientDisconnected: (callback: (...args: any[]) => void) => void
  onMqttMessagePublished: (callback: (...args: any[]) => void) => void
  deviceConfigMessage: (callback: (...args: any[]) => void) => void
  removeMqttListeners: () => void

  // UDP
  onUdpMessageReceived: (callback: (...args: any[]) => void) => void
  removeUdpListeners: () => void

  // 网卡IP选择
  getAvailableIPs: () => Promise<string[]>
  setSelectedIP: (ip: string) => Promise<any>

  // 系统
  getSystemInfo: () => Promise<any>

  // DHCP
  getNetworkInterfaces: () => Promise<any>
  getDHCPStatus: () => Promise<any>
  startDHCPServer: (config: any) => Promise<any>
  stopDHCPServer: () => Promise<any>
  reconfigureDHCP: (interfaceName: string, interfaceIP: string) => Promise<any>
  getDHCPLeases: () => Promise<any>
  getDHCPConfig: () => Promise<any>

  // 日志
  getLogDates: () => Promise<any>
  getLogDevices: (date: string) => Promise<any>
  getLogFiles: (date: string, deviceId: string) => Promise<any>
  readLogFile: (date: string, deviceId: string, protocol: string) => Promise<any>
}
