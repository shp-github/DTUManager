import {app, BrowserWindow, globalShortcut, ipcMain, Menu, shell} from 'electron'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'path'
import os from 'os'
import fs from 'fs'

// 导入服务模块
import fileServer from './fileServer'
import SimpleDHCPServer, {DHCPServerConfig} from './simple-dhcp-server';
import {UDPServer} from './udp-server'
import MQTTServer from './mqtt-server'


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
        icon: 'public/1.png',
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

        // 窗口准备好后，通知渲染进程可以开始初始化DHCP选择器
        setTimeout(() => {
            win?.webContents.send('app-ready');
        }, 1000);

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

    // 设置IPC通信
    await setupDHCPIPC();

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



// ----------------- 启动DHCP服务 -----------------

// 启动DHCP服务器的函数
async function startDHCPServer(config: DHCPServerConfig): Promise<boolean> {
    console.log('🔄 正在启动DHCP服务器...');
    try {
        // 如果已经有服务器在运行，先停止
        if (dhcpServer?.getStatus().running) {
            console.log('ℹ️ 停止现有DHCP服务器');
            dhcpServer.stop();
        }
        // 创建新的DHCP服务器实例
        dhcpServer = new SimpleDHCPServer(config);
        // 设置事件监听器，转发给渲染进程
        setupDHCPEventListeners(dhcpServer);
        dhcpServer.start();
        return true;
    } catch (error) {
        console.error('❌ 启动DHCP服务器异常:', error);
        throw error;
    }
}


// 设置DHCP事件监听器
function setupDHCPEventListeners(server: SimpleDHCPServer) {
    if (!server) return;

    // 移除之前的监听器（如果有）
    server.removeAllListeners('started');
    server.removeAllListeners('stopped');
    server.removeAllListeners('status-changed');
    server.removeAllListeners('ip-assigned');
    server.removeAllListeners('device-registered');
    server.removeAllListeners('lease-updated');
    server.removeAllListeners('error');

    // 监听服务器启动事件
    server.on('started', (status: any) => {
        console.log('🎉 DHCP服务器已启动');
        win?.webContents.send('dhcp-server-started', status);
    });

    // 监听服务器停止事件
    server.on('stopped', () => {
        console.log('🛑 DHCP服务器已停止');
        win?.webContents.send('dhcp-server-stopped');
    });

    // 监听状态变化
    server.on('status-changed', (status: any) => {
        console.log(`监听状态变化 ${JSON.stringify(status)}`)
        console.log(`监听状态变化 ${typeof status}`)
        win?.webContents.send('dhcp-server-status', status);
    });

    // 监听IP分配事件
    server.on('ip-assigned', (data: any) => {
        console.log(`📡 IP分配: ${data.mac} -> ${data.ip}`);
        win?.webContents.send('dhcp-device-registered', data);
    });

    // 监听设备注册事件
    server.on('device-registered', (data: any) => {
        win?.webContents.send('dhcp-device-registered', data);
    });

    // 监听租约更新事件
    server.on('lease-updated', (data: any) => {
        win?.webContents.send('dhcp-lease-updated', data);
    });

    // 监听错误事件
    server.on('error', (error: Error) => {
        console.error('❌ DHCP服务器错误:', error);
        win?.webContents.send('dhcp-error', {
            message: error.message,
            stack: error.stack
        });
    });
}


// 设置IPC通信
let isIPCSetup = false;
async function setupDHCPIPC() {
    // 防止重复设置
    if (isIPCSetup) {
        console.log('🔁 IPC通信已经设置，跳过重复设置');
        return;
    }

    console.log('🔧 正在设置DHCP IPC通信...');

    // 获取网络接口列表
    ipcMain.handle('get-network-interfaces', async () => {
        try {
            return SimpleDHCPServer.getAvailableInterfaces();
        } catch (error) {
            console.error('❌ 获取网络接口失败:', error);
            return [];
        }
    });


    // 获取DHCP状态
    ipcMain.handle('get-dhcp-status', async () => {
        try {
            return dhcpServer?.getStatus() || null;
        } catch (error) {
            console.error('❌ 获取DHCP状态失败:', error);
            return null;
        }
    });


    // 启动DHCP服务器
    ipcMain.handle('start-dhcp-server', async (event, config: DHCPServerConfig) => {
        console.log('🚀 IPC: 启动DHCP服务器', config);

        try {
            // 验证配置
            if (!config.interfaceIP || !config.subnet) {
                return {
                    success: false,
                    status: null,
                    message: '缺少必要的配置参数'
                };
            }

            const success = await startDHCPServer(config);

            // 确保总是返回响应
            return {
                success,
                status: dhcpServer?.getStatus() || null,
                message: success ? 'DHCP服务器启动成功' : 'DHCP服务器启动失败'
            };
        } catch (error) {
            console.error('❌ IPC: 启动DHCP服务器异常:', error);

            // 确保异常情况下也返回响应
            return {
                success: false,
                status: dhcpServer?.getStatus() || null,
                message: error instanceof Error ? error.message : '未知错误'
            };
        }
    });


    // 停止DHCP服务器
    ipcMain.handle('stop-dhcp-server', async () => {
        try {
            if (dhcpServer?.getStatus().running) {
                dhcpServer.stop();
                console.log('✅ DHCP服务器已停止');
                return {
                    success: true,
                    message: 'DHCP服务器已停止'
                };
            } else {
                return {
                    success: false,
                    message: 'DHCP服务器未运行'
                };
            }
        } catch (error) {
            console.error('❌ 停止DHCP服务器失败:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : '未知错误'
            };
        }
    });

    // 重新配置DHCP服务器
    ipcMain.handle('reconfigure-dhcp', async (event, config: Partial<DHCPServerConfig>) => {
        try {
            if (!dhcpServer) {
                return {
                    success: false,
                    message: 'DHCP服务器未初始化'
                };
            }

            const success = await dhcpServer.reconfigure(config);

            return {
                success,
                status: dhcpServer.getStatus(),
                message: success ? 'DHCP服务器重新配置成功' : 'DHCP服务器重新配置失败'
            };
        } catch (error) {
            console.error('❌ 重新配置DHCP服务器失败:', error);
            return {
                success: false,
                status: dhcpServer?.getStatus() || null,
                message: error instanceof Error ? error.message : '未知错误'
            };
        }
    });

    // 获取DHCP租约
    ipcMain.handle('get-dhcp-leases', async () => {
        try {
            if (dhcpServer) {
                return dhcpServer.getLeases();
            }
            return [];
        } catch (error) {
            console.error('❌ 获取DHCP租约失败:', error);
            return [];
        }
    });

    // 获取DHCP配置
    ipcMain.handle('get-dhcp-config', async () => {
        try {
            if (dhcpServer) {
                return dhcpServer.getConfigInfo();
            }
            return null;
        } catch (error) {
            console.error('❌ 获取DHCP配置失败:', error);
            return null;
        }
    });

    // 释放租约
    ipcMain.handle('release-lease', async (event, mac: string) => {
        try {
            if (dhcpServer) {
                const success = dhcpServer.releaseIP(mac);
                return success;
            }
            return false;
        } catch (error) {
            console.error('❌ 释放租约失败:', error);
            return false;
        }
    });

    // 续租
    ipcMain.handle('renew-lease', async (event, mac: string, extendTime?: number) => {
        try {
            if (dhcpServer) {
                const success = dhcpServer.renewLease(mac, extendTime);
                return success;
            }
            return false;
        } catch (error) {
            console.error('❌ 续租失败:', error);
            return false;
        }
    });

    // 手动分配IP
    ipcMain.handle('assign-ip', async (event, mac: string, ip: string, hostname?: string) => {
        try {
            if (dhcpServer) {
                const success = dhcpServer.assignIP(mac, ip, hostname);
                return success;
            }
            return false;
        } catch (error) {
            console.error('❌ 手动分配IP失败:', error);
            return false;
        }
    });

    // 调试接口
    ipcMain.handle('ping', () => {
        return { success: true, message: 'pong', timestamp: Date.now() };
    });

    console.log('✅ DHCP IPC通信已设置，处理器列表:');

    isIPCSetup = true;
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
    try {
        let topic = params.topic
        let message = params.message
        let options = params.options

        console.log(`topic是字符串吗${typeof topic}`)
        console.log(`topic是字符串吗${topic}`)
        console.log(`topic是字符串吗${JSON.stringify(topic)}`)

        return mqttServer.publish(topic, message, options)
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