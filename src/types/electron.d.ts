// src/types/electron.d.ts
export {}

// 设备类型定义
interface DeviceInfo {
    id: string
    mac: string
    ip: string
    networkType: string
    RSSI: number | null
    runtime: number
    firmware: string
    heart_interval: string
    lastSeen: string
}

// 文件操作返回类型
interface FileOperationResult {
    success: boolean
    path?: string
    error?: string
}

interface FileListResult {
    success: boolean
    files?: string[]
    error?: string
}

// 配置操作返回类型
interface ConfigOperationResult {
    success: boolean
    error?: string
    data?: any
}

declare global {
    interface Window {
        electronAPI: {
            // 设备发现和配置
            onDeviceDiscovered: (callback: (devices: DeviceInfo[]) => void) => void
            getDevices: () => Promise<DeviceInfo[]>
            sendConfig: (payload: { ip: string; config: any }) => Promise<ConfigOperationResult>
            saveConfig: (config: any) => Promise<ConfigOperationResult>
            loadConfig: () => Promise<ConfigOperationResult>
            readDeviceConfig: (device: DeviceInfo) => Promise<ConfigOperationResult>

            // 文件操作
            saveFile: (fileName: string, fileData: ArrayBuffer) => Promise<FileOperationResult>
            getFileList: () => Promise<FileListResult>

            // 设备升级
            sendUpgradeCommand: (
                deviceIp: string,
                fileName: string,
                serverInfo: { port: number; fileSize?: number }
            ) => Promise<{
                success: boolean;
                downloadUrl?: string;
                serverIp?: string;
                error?: string
            }>


            // 窗口管理
            openChildWindow: (page: string) => Promise<void>
            openWin: (arg: any) => Promise<void>

            // 通用通信方法
            on: (channel: string, listener: (...args: any[]) => void) => void
            off: (channel: string, listener?: (...args: any[]) => void) => void
            send: (channel: string, ...args: any[]) => void
            invoke: <T = any>(channel: string, ...args: any[]) => Promise<T>

            // 事件监听
            onMenuAction: (callback: (action: 'new' | 'save' | 'about') => void) => void
            onMainProcessMessage: (callback: (message: string) => void) => void

            // UDP 设备发现事件
            onUdpDeviceDiscovered: (callback: (devices: DeviceInfo[]) => void) => void
        }
    }
}