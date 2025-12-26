// main.ts - 完整版
import { app, BrowserWindow, shell, ipcMain, Menu, globalShortcut } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'path'
import os from 'os'
import fs from 'fs'

// 导入服务模块
import fileServer from './fileServer'
import MQTTServer from './mqtt-server'
import { UDPServer } from './udp-server'
import { SimpleDHCPServer } from './simple-dhcp-server'


const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 应用路径配置
process.env.APP_ROOT = path.join(__dirname, '../..')
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT, 'public')
    : RENDERER_DIST

// Windows 7 GPU 加速禁用
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Windows 10+ 通知图标
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

// 单实例锁
if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

// 全局变量
let win: BrowserWindow | null = null
let mqttServer: MQTTServer | null = null
let udpServer: UDPServer | null = null
let dhcpServer: SimpleDHCPServer | null = null

const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// ----------------- 创建主窗口 -----------------
function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'DTU 上位机配置',
        icon: process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, 'favicon.ico') : undefined,
        webPreferences: {
            preload,
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    // 加载页面
    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
        win.webContents.openDevTools()
    } else {
        win.loadFile(indexHtml)
    }

    win.maximize()

    // 处理外部链接
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:')) shell.openExternal(url)
        return { action: 'deny' }
    })

    // 页面加载完成
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', new Date().toLocaleString())
    })

    // 创建中文菜单
    createApplicationMenu()
}

// ----------------- 创建应用菜单 -----------------
function createApplicationMenu() {
    const menuTemplate: Menu.MenuItemConstructorOptions[] = [
        {
            label: '服务器',
            submenu: [
                {
                    label: '重启UDP服务',
                    click: async () => {
                        if (udpServer) {
                            await udpServer.stop()
                            const result = await udpServer.start()
                            if (result.success) {
                                win?.webContents.send('server-message', 'UDP服务已重启')
                            }
                        }
                    },
                },
                {
                    label: '重启MQTT服务',
                    click: async () => {
                        if (mqttServer) {
                            await mqttServer.stop()
                            const result = await mqttServer.start()
                            if (result.success) {
                                win?.webContents.send('server-message', 'MQTT服务已重启')
                            }
                        }
                    },
                },
            ],
        },
        {
            label: '工具',
            submenu: [
                { label: '刷新设备列表', click: () => win?.webContents.send('menu-action', 'refresh-devices') },
                { label: '扫描网络设备', click: () => win?.webContents.send('menu-action', 'scan-network') },
                { label: '开发工具', role: 'toggleDevTools' },
            ],
        },
    ]

    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
}

// ----------------- 启动所有服务 -----------------
async function startAllServices() {
    console.log('🚀 正在启动所有服务...')

    //启动DHCP服务器
    await startDHCPServer()

    // 1. 启动文件服务器
    const filePort = await startFileServer(8080)
    if (!filePort) {
        console.warn('⚠️ 文件服务器启动失败，某些功能可能受限')
    }

    // 2. 启动UDP服务
    await startUDPServer()

    // 3. 启动MQTT服务
    await startMQTTServer()

    console.log('✅ 所有服务已启动完成')
}

// 启动DHCP服务器
async function startDHCPServer(): Promise<boolean> {
    try {
        dhcpServer = new SimpleDHCPServer()

        const started = await dhcpServer.start()
        if (started) {
            console.log('✅ DHCP服务器已启动')

            // 监听DHCP事件
            dhcpServer.on('device-registered', ({ mac, ip }) => {
                console.log(`📱 DHCP设备注册: ${mac} -> ${ip}`)
                win?.webContents.send('dhcp-device-registered', { mac, ip })
            })

            return true
        } else {
            console.warn('⚠️ DHCP服务器启动失败，设备可能需要手动配置IP')
            return false
        }
    } catch (error) {
        console.error('❌ 启动DHCP服务器时异常:', error)
        return false
    }
}

// 停止DHCP服务器
async function stopDHCPServer(): Promise<void> {
    if (dhcpServer) {
        dhcpServer.stop()
        dhcpServer = null
        console.log('✅ DHCP服务器已停止')
    }
}

// ----------------- 启动文件服务器 -----------------
async function startFileServer(defaultPort: number): Promise<number | null> {
    try {
        // 尝试默认端口
        const result = await fileServer.start(defaultPort)
        if (result.success) {
            console.log(`✅ 文件服务器已启动，端口: ${defaultPort}`)
            return defaultPort
        }

        // 尝试其他端口
        for (let port = defaultPort + 1; port <= defaultPort + 10; port++) {
            const retryResult = await fileServer.start(port)
            if (retryResult.success) {
                console.log(`✅ 文件服务器已启动，端口: ${port}`)
                return port
            }
        }

        console.error('❌ 文件服务器启动失败')
        return null
    } catch (error) {
        console.error('❌ 文件服务器启动异常:', error)
        return null
    }
}

// ----------------- 启动UDP服务 -----------------
async function startUDPServer() {
    try {
        udpServer = new UDPServer({
            discoveryPort: 4210,
            configPort: 4211,
            deviceTimeout: 11000, // 11秒超时
        })

        if (win) {
            udpServer.setWindow(win)
        }

        const result = await udpServer.start()
        if (result.success) {
            console.log('✅ UDP服务已启动')

            // 监听UDP服务事件
            udpServer.on('device-discovered', (device) => {
                console.log(`📱 发现新设备: ${device.name} (${device.ip})`)
                win?.webContents.send('device-discovered', device)
            })

            udpServer.on('device-offline', (deviceId) => {
                console.log(`📱 设备离线: ${deviceId}`)
                win?.webContents.send('device-offline', deviceId)
            })

            udpServer.on('error', (err) => {
                console.error('❌ UDP服务错误:', err)
                win?.webContents.send('server-error', { service: 'UDP', error: err.message })
            })
        } else {
            console.error('❌ UDP服务启动失败:', result.error)
        }
    } catch (error) {
        console.error('❌ 启动UDP服务时异常:', error)
    }
}

// ----------------- 启动MQTT服务 -----------------
async function startMQTTServer() {
    try {
        mqttServer = new MQTTServer({ tcpPort: 1883 })
        const result = await mqttServer.start()

        if (result.success) {
            console.log('✅ MQTT服务器启动成功')

            // 监听MQTT事件
            mqttServer.on('clientConnected', (clientInfo) => {
                console.log(`📱 MQTT设备连接: ${clientInfo.id}`)
                win?.webContents.send('mqtt-client-connected', clientInfo)
            })

            mqttServer.on('clientDisconnected', (clientInfo) => {
                console.log(`📱 MQTT设备断开: ${clientInfo.id}`)
                win?.webContents.send('mqtt-client-disconnected', clientInfo)
            })

            mqttServer.on('messagePublished', (message) => {
                if (message.client) {
                    win?.webContents.send('mqtt-message-published', message)
                    win?.webContents.send('device-config-message', message)
                }
            })

            mqttServer.on('error', (err) => {
                console.error('❌ MQTT服务错误:', err)
                win?.webContents.send('server-error', { service: 'MQTT', error: err.message })
            })
        } else {
            console.error('❌ MQTT服务器启动失败:', result.error)
        }
    } catch (error) {
        console.error('❌ 创建MQTT服务器时出错:', error)
    }
}

// ----------------- 停止所有服务 -----------------
async function stopAllServices() {
    console.log('🛑 正在停止所有服务...')

    // 停止文件服务器
    try {
        fileServer.stop()
        console.log('✅ 文件服务器已停止')
    } catch (error) {
        console.error('❌ 停止文件服务器时出错:', error)
    }

    // 停止UDP服务
    if (udpServer) {
        try {
            await udpServer.stop()
            console.log('✅ UDP服务已停止')
        } catch (error) {
            console.error('❌ 停止UDP服务时出错:', error)
        }
    }

    // 停止MQTT服务
    if (mqttServer) {
        try {
            await mqttServer.stop()
            console.log('✅ MQTT服务已停止')
        } catch (error) {
            console.error('❌ 停止MQTT服务时出错:', error)
        }
    }

    if (dhcpServer) {
        try {
            await stopDHCPServer()
            console.log('✅ DHCP服务已停止')
        } catch (error) {
            console.error('❌ 停止DHCP服务时出错:', error)
        }
    }

    console.log('✅ 所有服务已停止')
}

// =================== IPC 处理器 ===================

// 获取设备列表
ipcMain.handle('getDevices', async () => {
    return udpServer ? udpServer.getDevices() : []
})

// 获取设备详情
ipcMain.handle('getDevice', async (_event, deviceId) => {
    return udpServer ? udpServer.getDevice(deviceId) : null
})

// 发送配置到单个设备
ipcMain.handle('sendConfig', async (_event, { ip, config }) => {
    if (!udpServer) {
        return { success: false, error: 'UDP服务未启动' }
    }
    return udpServer.sendConfig(ip, config)
})

// 批量保存配置到多个设备
ipcMain.handle('save-config', async (_event, payload) => {
    if (!udpServer) {
        return { success: false, error: 'UDP服务未启动' }
    }

    try {
        const entries = Object.entries(payload)
        const results = []

        for (const [deviceId, config] of entries) {
            const device = udpServer.getDevice(deviceId)
            if (device) {
                const result = await udpServer.sendConfig(device.ip, config as any)
                results.push({
                    deviceId,
                    success: result.success,
                    error: result.error,
                })
            } else {
                results.push({
                    deviceId,
                    success: false,
                    error: '设备不存在',
                })
            }
        }

        return {
            success: results.every((r) => r.success),
            results,
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[SAVE] Error:', message)
        return { success: false, error: message }
    }
})

// 读取设备配置
ipcMain.handle('read-device-config', async (_event, device) => {
    if (!udpServer) {
        throw new Error('UDP服务未启动')
    }

    if (!device || !device.ip) {
        throw new Error('无效的设备对象')
    }

    return udpServer.readDeviceConfig(device.ip)
})

// 打开子窗口
ipcMain.handle('open-win', (_, arg) => {
    const childWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload,
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    if (VITE_DEV_SERVER_URL) {
        childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
    } else {
        childWindow.loadFile(indexHtml, { hash: arg })
    }
})

// 文件操作
ipcMain.handle('save-file', async (_event, { fileName, fileData }: { fileName: string; fileData: ArrayBuffer }) => {
    try {
        const filesDir = path.join(process.cwd(), 'files')

        // 确保 files 目录存在
        if (!fs.existsSync(filesDir)) {
            fs.mkdirSync(filesDir, { recursive: true })
        }

        const filePath = path.join(filesDir, fileName)
        const buffer = Buffer.from(fileData)
        fs.writeFileSync(filePath, buffer)

        console.log(`✅ 文件已保存: ${filePath}`)
        return { success: true, path: filePath }
    } catch (error: any) {
        console.error('❌ 文件保存失败:', error)
        return { success: false, error: error.message }
    }
})

ipcMain.handle('get-file-list', async () => {
    try {
        const filesDir = path.join(process.cwd(), 'files')

        if (!fs.existsSync(filesDir)) {
            return { success: true, files: [] }
        }

        const files = fs.readdirSync(filesDir)
        return { success: true, files }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
})

// 设备升级
ipcMain.handle('send-upgrade-command', async (_event, { deviceIp, fileName, serverInfo }) => {
    if (!udpServer) {
        return { success: false, error: 'UDP服务未启动' }
    }

    return udpServer.sendUpgradeCommand(deviceIp, fileName, serverInfo)
})

// 连接MQTT
ipcMain.handle('connect-mqtt', async (_event, deviceIp) => {
    if (!udpServer) {
        return { success: false, error: 'UDP服务未启动' }
    }

    return udpServer.sendMqttConnectCommand(deviceIp)
})

// 设备重启
ipcMain.handle('device-reboot', async (_event, deviceIp) => {
    if (!udpServer) {
        return { success: false, error: 'UDP服务未启动' }
    }

    return udpServer.sendRebootCommand(deviceIp)
})

// MQTT相关
ipcMain.handle('mqtt-publish', async (_event, params) => {
    let topic, message, options

    if (params && typeof params === 'object') {
        topic = params.topic
        message = params.message
        options = params.options
    }

    if (!mqttServer) {
        console.error('❌ MQTT服务器未运行')
        return false
    }

    try {
        if (topic === null || topic === undefined) {
            console.error('❌ Topic 为 null 或 undefined')
            return false
        }

        const safeTopic = String(topic).trim()
        if (!safeTopic) {
            console.error('❌ Topic 为空字符串')
            return false
        }

        let safeMessage
        if (typeof message === 'string') {
            safeMessage = message
        } else if (typeof message === 'object') {
            safeMessage = JSON.stringify(message)
        } else {
            safeMessage = String(message)
        }

        return mqttServer.publish(safeTopic, safeMessage, options)
    } catch (error) {
        console.error('💥 MQTT发布异常:', error)
        return false
    }
})

ipcMain.handle('mqtt-get-status', async () => {
    if (mqttServer) {
        return mqttServer.getStatus()
    }
    return { isRunning: false }
})

ipcMain.handle('mqtt-get-clients', async () => {
    if (mqttServer) {
        return mqttServer.getConnectedClients()
    }
    return []
})

ipcMain.handle('mqtt-send-config', async (_event, { deviceId, config }) => {
    if (mqttServer) {
        const success = mqttServer.sendConfigToDevice(deviceId, config)
        return { success }
    }
    return { success: false, error: 'MQTT服务器未运行' }
})

ipcMain.handle('mqtt-request-config', async (_event, deviceId) => {
    if (mqttServer) {
        const success = mqttServer.requestDeviceConfig(deviceId)
        return { success }
    }
    return { success: false, error: 'MQTT服务器未运行' }
})

// 服务控制
ipcMain.handle('restart-udp-service', async () => {
    if (udpServer) {
        await udpServer.stop()
        const result = await udpServer.start()
        return result
    }
    return { success: false, error: 'UDP服务未初始化' }
})

ipcMain.handle('restart-mqtt-service', async () => {
    if (mqttServer) {
        await mqttServer.stop()
        const result = await mqttServer.start()
        return result
    }
    return { success: false, error: 'MQTT服务未初始化' }
})

ipcMain.handle('get-service-status', async () => {
    return {
        udp: udpServer ? 'running' : 'stopped',
        mqtt: mqttServer ? 'running' : 'stopped',
        fileServer: 'running', // 文件服务器通常一直运行
    }
})

// 获取本机IP地址
ipcMain.handle('get-local-ip', async () => {
    const interfaces = os.networkInterfaces()
    const addresses: string[] = []

    for (const interfaceName of Object.keys(interfaces)) {
        // 跳过虚拟接口
        if (interfaceName.includes('Virtual') || interfaceName.includes('vEthernet')) {
            continue
        }

        for (const netInterface of interfaces[interfaceName] || []) {
            if (netInterface.family === 'IPv4' && !netInterface.internal) {
                addresses.push(netInterface.address)
            }
        }
    }

    return addresses.length > 0 ? addresses[0] : '127.0.0.1'
})

// 网络扫描
ipcMain.handle('scan-network', async () => {
    // 这里可以添加网络扫描逻辑
    // 例如使用nmap或自定义扫描
    console.log('开始网络扫描...')
    return { scanning: true }
})


// 添加IPC处理器
ipcMain.handle('get-dhcp-leases', async () => {
    return dhcpServer ? dhcpServer.getLeases() : []
})

ipcMain.handle('get-dhcp-status', async () => {
    return {
        isRunning: dhcpServer !== null,
        leases: dhcpServer ? dhcpServer.getLeases().length : 0,
    }
})

ipcMain.handle('restart-dhcp-service', async () => {
    await stopDHCPServer()
    const success = await startDHCPServer()
    return { success }
})

// =================== 应用生命周期 ===================

app.whenReady().then(async () => {
    console.log('🎯 Electron 应用启动中...')

    // 创建主窗口
    createWindow()

    // 启动所有服务
    await startAllServices()

    // 注册快捷键
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        win?.webContents.openDevTools()
    })

    globalShortcut.register('F5', () => {
        win?.reload()
    })

    console.log('✅ 应用程序启动完成')
})

// 窗口全部关闭
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// 应用激活
app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
        await startAllServices()
    }
})

// 应用退出前
app.on('before-quit', async () => {
    await stopAllServices()
})

// 第二个实例
app.on('second-instance', () => {
    if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
    }
})

// 进程错误处理
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error)
})

process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason)
})