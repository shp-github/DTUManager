import {app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, shell} from 'electron'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { exec } from 'child_process'
import net from 'net'

// 导入服务模块
import fileServer from './fileServer'
import SimpleDHCPServer, {DHCPServerConfig} from './simple-dhcp-server';
import {UDPServer} from './udp-server'
import MQTTServer from './mqtt-server'

// =================== 控制台时间戳 ===================
// 重写 console 方法，为所有控制台输出添加时间戳
const _origLog = console.log.bind(console)
const _origWarn = console.warn.bind(console)
const _origError = console.error.bind(console)
const _origInfo = console.info.bind(console)

function _timestamp(): string {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    const ms = String(now.getMilliseconds()).padStart(3, '0')
    return `${hh}:${mm}:${ss}.${ms}`
}

console.log = (...args: any[]) => _origLog(`[${_timestamp()}]`, ...args)
console.warn = (...args: any[]) => _origWarn(`[${_timestamp()}]`, ...args)
console.error = (...args: any[]) => _origError(`[${_timestamp()}]`, ...args)
console.info = (...args: any[]) => _origInfo(`[${_timestamp()}]`, ...args)

// =================== 日志服务 ===================
let LOGS_DIR = ''

function getLogsDir(): string {
    if (!LOGS_DIR) {
        // 打包后 asar 只读，改用 userData；开发环境用项目目录
        LOGS_DIR = app.isPackaged
            ? path.join(app.getPath('userData'), 'logs')
            : path.join(process.env.APP_ROOT || process.cwd(), 'logs')
    }
    return LOGS_DIR
}

function getCurrentDateStr(): string {
    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
}

function getTimeStr(): string {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    const ms = String(now.getMilliseconds()).padStart(3, '0')
    return `${hh}:${mm}:${ss}.${ms}`
}

function getCurrentHourStr(): string {
    return String(new Date().getHours()).padStart(2, '0')
}

function writeLog(deviceId: string, protocol: 'udp' | 'mqtt', content: string, deviceName?: string) {
    try {
        const dateStr = getCurrentDateStr()
        const hourStr = getCurrentHourStr()
        const logDir = path.join(getLogsDir(), dateStr, deviceId)
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true })
        }
        const logFile = path.join(logDir, `${protocol}_${hourStr}.log`)
        const timeStr = getTimeStr()
        const logLine = `[${timeStr}] ${content}\n`
        fs.appendFileSync(logFile, logLine, 'utf-8')
        // 保存设备名称元数据
        if (deviceName) {
            const infoFile = path.join(logDir, 'device_info.txt')
            if (!fs.existsSync(infoFile)) {
                fs.writeFileSync(infoFile, deviceName, 'utf-8')
            } else {
                const existing = fs.readFileSync(infoFile, 'utf-8').trim()
                if (existing !== deviceName) {
                    fs.writeFileSync(infoFile, deviceName, 'utf-8')
                }
            }
        }
    } catch (err) {
        console.error('写日志失败:', err)
    }
}


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

// IO 速率缓存
const _prevNet: Record<string, { rx: number; tx: number; time: number }> = {}
const _prevDisk: Record<string, { read: number; write: number; time: number }> = {}

const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// ----------------- 辅助：广播消息到所有窗口 -----------------
function broadcastToAll(channel: string, ...args: any[]) {
    BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
            w.webContents.send(channel, ...args)
        }
    })
}

// ----------------- 创建主窗口 -----------------
function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'DTU 上位机配置',
        icon: 'public/1.png',
        frame: false,
        webPreferences: {
            preload,
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    // 隐藏默认菜单栏
    Menu.setApplicationMenu(null)

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
            broadcastToAll('app-ready');
        }, 1000);

    })

    // 创建中文菜单
    createApplicationMenu()
}

// ----------------- 创建应用菜单 -----------------
function createApplicationMenu() {
    // @ts-ignore
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

    // 4. 注册升级API处理器
    setupUpgradeAPIHandler()

    console.log('✅ 所有服务已启动完成')
}

// ----------------- 注册升级API处理器 -----------------
function setupUpgradeAPIHandler(): void {
    fileServer.setUpgradeHandler(async (request) => {
        const { deviceId, fileName, fileSize } = request;

        try {
            // 1. 通过设备ID查找设备IP
            if (!udpServer) {
                return { success: false, error: 'UDP服务未启动' };
            }

            const devices = udpServer.getDevices();
            const targetDevice = devices.find(d => d.id === deviceId);

            if (!targetDevice) {
                return {
                    success: false,
                    error: `未找到设备: ${deviceId}，请确认设备已在线`
                };
            }

            const deviceIp = targetDevice.ip;
            console.log(`🔍 [API] 设备 ${deviceId} -> IP: ${deviceIp}`);

            // 2. 通过UDP发送升级命令到设备
            const fileServerStatus = fileServer.getStatus();
            const upgradeResult = await udpServer.sendUpgradeCommand(deviceIp, fileName, {
                port: fileServerStatus.port,
                fileSize
            });

            if (!upgradeResult.success) {
                return {
                    success: false,
                    error: upgradeResult.error || '发送升级命令失败'
                };
            }

            console.log(`📡 [API] UDP升级命令已发送: ${deviceIp}`);

            // 3. 通过MQTT推送升级消息（OTA通知）
            if (mqttServer && upgradeResult.downloadUrl) {
                const topic = `/server/cmd/${deviceId}`;
                const message = JSON.stringify({
                    type: 'ota',
                    downloadUrl: upgradeResult.downloadUrl
                });

                try {
                    mqttServer.publish(topic, message, { qos: 1 });
                    console.log(`📤 [API] MQTT已推送: ${topic}`);
                } catch (mqttErr: any) {
                    console.warn(`⚠️ [API] MQTT推送失败: ${mqttErr.message}`);
                }
            }

            // 4. 等待设备通过MQTT上报升级进度（最长等待2分钟）
            if (mqttServer) {
                console.log(`⏳ [API] 等待设备 ${deviceId} 上报升级结果...`);
                const otaResult = await mqttServer.waitForOtaProgress(deviceId, 120000);

                if (otaResult.success) {
                    return {
                        success: true,
                        downloadUrl: upgradeResult.downloadUrl,
                        status: otaResult.status,
                        progress: otaResult.progress,
                        message: `设备 ${deviceId} 升级完成`
                    };
                } else {
                    return {
                        success: false,
                        downloadUrl: upgradeResult.downloadUrl,
                        status: otaResult.status,
                        progress: otaResult.progress,
                        error: otaResult.error || '升级失败',
                        message: `设备 ${deviceId} 升级失败: ${otaResult.error || '未知错误'}`
                    };
                }
            }

            // MQTT服务未运行，UDP命令已发送即返回成功
            return {
                success: true,
                downloadUrl: upgradeResult.downloadUrl,
                message: `升级命令已发送到设备 ${deviceId}（未启用MQTT进度监听）`
            };
        } catch (error: any) {
            console.error('❌ [API] 升级处理器异常:', error);
            return {
                success: false,
                error: error.message || '升级处理失败'
            };
        }
    });
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
        broadcastToAll('dhcp-server-started', status);
    });

    // 监听服务器停止事件
    server.on('stopped', () => {
        console.log('🛑 DHCP服务器已停止');
        broadcastToAll('dhcp-server-stopped');
    });

    // 监听状态变化
    server.on('status-changed', (status: any) => {
        console.log(`监听状态变化 ${JSON.stringify(status)}`)
        console.log(`监听状态变化 ${typeof status}`)
        broadcastToAll('dhcp-server-status', status);
    });

    // 监听IP分配事件
    server.on('ip-assigned', (data: any) => {
        console.log(`📡 IP分配: ${data.mac} -> ${data.ip}`);
        broadcastToAll('dhcp-device-registered', data);
    });

    // 监听设备注册事件
    server.on('device-registered', (data: any) => {
        broadcastToAll('dhcp-device-registered', data);
    });

    // 监听租约更新事件
    server.on('lease-updated', (data: any) => {
        broadcastToAll('dhcp-lease-updated', data);
    });

    // 监听错误事件
    server.on('error', (error: Error) => {
        console.error('❌ DHCP服务器错误:', error);
        broadcastToAll('dhcp-error', {
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
                broadcastToAll('device-discovered', device)
            })

            udpServer.on('device-offline', (deviceId) => {
                console.log(`📱 设备离线: ${deviceId}`)
                broadcastToAll('device-offline', deviceId)
            })

            udpServer.on('error', (err) => {
                console.error('❌ UDP服务错误:', err)
                broadcastToAll('server-error', { service: 'UDP', error: err.message })
            })

            // 转发原始UDP消息到渲染进程
            udpServer.on('message-received', (data) => {
                broadcastToAll('udp-message-received', data)
                // 写入日志
                const deviceId = data.parsed?.id || data.ip || 'unknown'
                const deviceName = data.parsed?.name || ''
                writeLog(deviceId, 'udp', JSON.stringify(data.parsed || data.raw), deviceName)
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
        mqttServer = new MQTTServer({ tcpPort: 51883 })
        const result = await mqttServer.start()

        if (result.success) {
            console.log('✅ MQTT服务器启动成功')

            // 监听MQTT事件
            mqttServer.on('clientConnected', (clientInfo) => {
                console.log(`📱 MQTT设备连接: ${clientInfo.id}`)
                broadcastToAll('mqtt-client-connected', clientInfo)
            })

            mqttServer.on('clientDisconnected', (clientInfo) => {
                console.log(`📱 MQTT设备断开: ${clientInfo.id}`)
                broadcastToAll('mqtt-client-disconnected', clientInfo)
            })

            mqttServer.on('messagePublished', (message) => {
                if (message.client) {
                    broadcastToAll('mqtt-message-published', message)
                    broadcastToAll('device-config-message', message)
                    // 写入日志
                    const deviceId = message.client?.id || 'unknown'
                    const logContent = `topic=${message.topic} payload=${message.payload}`
                    writeLog(deviceId, 'mqtt', logContent, message.client?.id || '')
                }
            })

            mqttServer.on('error', (err) => {
                console.error('❌ MQTT服务错误:', err)
                broadcastToAll('server-error', { service: 'MQTT', error: err.message })
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
        width: 1200,
        height: 800,
        title: 'DTU 上位机配置',
        icon: 'public/1.png',
        frame: false,
        webPreferences: {
            preload,
            nodeIntegration: false,
            contextIsolation: true,
        },
    })

    // 新窗口也隐藏菜单栏
    childWindow.setMenu(null)

    if (VITE_DEV_SERVER_URL) {
        childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
    } else {
        childWindow.loadFile(indexHtml, { hash: arg })
    }

    // 页面加载完成后发送 app-ready
    childWindow.webContents.on('did-finish-load', () => {
        childWindow.webContents.send('app-ready')
    })
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

// 导出/导入配置 JSON
ipcMain.handle('export-config-file', async (_event, jsonStr: string, deviceName?: string, deviceId?: string) => {
    try {
        // 构建默认文件名: {设备名}_{设备号}_config.json
        let defaultFilename = 'dtu-config.json'
        if (deviceName || deviceId) {
            const parts: string[] = []
            if (deviceName) parts.push(deviceName.replace(/[\\/:*?"<>|]/g, '_'))
            if (deviceId) parts.push(deviceId.replace(/[\\/:*?"<>|]/g, '_'))
            parts.push('config.json')
            defaultFilename = parts.join('_')
        }
        const { canceled, filePath } = await dialog.showSaveDialog({
            title: '导出设备配置',
            defaultPath: defaultFilename,
            filters: [{ name: 'JSON 文件', extensions: ['json'] }]
        })
        if (canceled || !filePath) return { success: false }
        fs.writeFileSync(filePath, jsonStr, 'utf-8')
        console.log(`✅ 配置已导出: ${filePath}`)
        return { success: true, path: filePath }
    } catch (error: any) {
        console.error('❌ 导出配置失败:', error)
        return { success: false, error: error.message }
    }
})

ipcMain.handle('import-config-file', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            title: '导入设备配置',
            filters: [{ name: 'JSON 文件', extensions: ['json'] }],
            properties: ['openFile']
        })
        if (canceled || filePaths.length === 0) return { success: false }
        const content = fs.readFileSync(filePaths[0], 'utf-8')
        console.log(`✅ 配置已导入: ${filePaths[0]}`)
        return { success: true, data: content }
    } catch (error: any) {
        console.error('❌ 导入配置失败:', error)
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

// HTTP 升级配置
ipcMain.handle('set-http-upgrade-config', async (_event, enabled: boolean, password: string) => {
    fileServer.setUpgradeConfig(enabled, password)
    return { success: true }
})

ipcMain.handle('get-http-upgrade-config', async () => {
    return fileServer.getUpgradeConfig()
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

// 获取可用的网络IP列表（用于选择网卡）
ipcMain.handle('get-available-ips', async () => {
    if (!udpServer) {
        return []
    }
    return udpServer.getAvailableIPs()
})

// 设置选择的本地IP
ipcMain.handle('set-selected-ip', async (_event, ip: string) => {
    if (!udpServer) {
        return { success: false, error: 'UDP服务未启动' }
    }
    udpServer.setSelectedIP(ip)
    return { success: true }
})

// 网络扫描
ipcMain.handle('scan-network', async () => {
    // 这里可以添加网络扫描逻辑
    // 例如使用nmap或自定义扫描
    console.log('开始网络扫描...')
    return { scanning: true }
})

// 获取系统信息
ipcMain.handle('get-system-info', async () => {
    const cpus = os.cpus()
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem

    // 计算CPU使用率
    let totalIdle = 0, totalTick = 0
    for (const cpu of cpus) {
        for (const type in cpu.times) {
            totalTick += cpu.times[type]
        }
        totalIdle += cpu.times.idle
    }
    const cpuUsage = ((1 - totalIdle / totalTick) * 100).toFixed(1)

    // 获取网络接口
    const networkInterfaces = os.networkInterfaces()
    const networks: any[] = []
    for (const [name, ifaces] of Object.entries(networkInterfaces)) {
        if (!ifaces) continue
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                networks.push({ name, ip: iface.address, mac: iface.mac, netmask: iface.netmask })
            }
        }
    }

    // 获取磁盘信息
    const disks: { path: string; total: number; used: number; free: number; usage: number }[] = []
    try {
        const path = require('path')
        const fs = require('fs')
        // Windows 获取所有盘符，Linux/macOS 获取根目录
        const platform = os.platform()
        const checkPaths = platform === 'win32'
            ? 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => `${l}:\\`).filter((p: string) => {
                try { fs.statfsSync(p); return true } catch { return false }
            })
            : ['/']
        for (const diskPath of checkPaths) {
            try {
                const stats = fs.statfsSync(diskPath)
                const total = stats.bsize * stats.blocks
                const free = stats.bsize * stats.bavail
                const used = total - free
                disks.push({
                    path: diskPath,
                    total,
                    used,
                    free,
                    usage: total > 0 ? parseFloat(((used / total) * 100).toFixed(1)) : 0
                })
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }

    // 获取 GPU 信息
    let gpuModel = '未知'
    let gpuUsage = 0
    try {
        // 优先用 WMIC 获取 Windows GPU 型号（更可靠）
        if (process.platform === 'win32') {
            try {
                const wmicOut = await new Promise<string>((resolve, reject) => {
                    exec('wmic path win32_VideoController get Name /format:list', { timeout: 3000, encoding: 'utf-8' }, (err, stdout) => {
                        if (err) return reject(err)
                        resolve(stdout)
                    })
                })
                const lines = wmicOut.split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('Name='))
                const gpuNames = lines.map(l => l.replace(/^Name=/,'').trim()).filter(Boolean)
                // 优先取独显（通常描述更长或有 NVIDIA/AMD 字样）
                const discrete = gpuNames.find(n => /(NVIDIA|AMD|Radeon|RTX|GTX|RX|Arc)/i.test(n))
                gpuModel = discrete || gpuNames[0] || '未知'
            } catch { /* wmic 失败 */ }
        } else if (process.platform === 'linux') {
            try {
                const lspci = await new Promise<string>((resolve, reject) => {
                    exec('lspci | grep -Ei "vga|3d|display" | head -1', { timeout: 3000, encoding: 'utf-8' }, (err, stdout) => {
                        if (err) return reject(err)
                        resolve(stdout)
                    })
                })
                if (lspci) {
                    // 格式如 "01:00.0 VGA compatible controller: NVIDIA Corporation GA106 [GeForce RTX 3060]"
                    const m = lspci.match(/:\s*(.+)$/)
                    gpuModel = m ? m[1].trim() : lspci.trim()
                }
            } catch { /* lspci 失败 */ }
        } else if (process.platform === 'darwin') {
            try {
                const sysProf = await new Promise<string>((resolve, reject) => {
                    exec('system_profiler SPDisplaysDataType | grep -E "Chipset Model|^\\s+Chipset" | head -1', { timeout: 3000, encoding: 'utf-8' }, (err, stdout) => {
                        if (err) return reject(err)
                        resolve(stdout)
                    })
                })
                if (sysProf) {
                    const m = sysProf.match(/:\s*(.+)$/)
                    gpuModel = m ? m[1].trim() : sysProf.trim()
                }
            } catch { /* system_profiler 失败 */ }
        }
    } catch { /* 整体 GPU 检测失败 */ }

    // 尝试用 Electron getGPUInfo 作为补充
    if (gpuModel === '未知') {
        try {
            const gpuInfo = await app.getGPUInfo('basic')
            const raw = gpuInfo as any
            // 兼容多种返回结构
            const gpus = raw?.gpuDevice || raw?.info?.gpuDevice || []
            if (gpus.length > 0) {
                gpuModel = gpus[0].deviceString || gpus[0].vendorString || '未知'
                if (gpus.length > 1 && gpus[1].deviceString) {
                    gpuModel = gpus[1].deviceString
                }
            }
        } catch { /* */ }
    }

    // 尝试获取 NVIDIA GPU 使用率 (仅 Windows)
    if (process.platform === 'win32') {
        try {
            const nvidiaSmi = await new Promise<string>((resolve, reject) => {
                exec('nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits', { timeout: 3000 }, (err, stdout) => {
                    if (err) return reject(err)
                    resolve(stdout.toString().trim())
                })
            })
            const usage = parseInt(nvidiaSmi)
            if (!isNaN(usage)) gpuUsage = usage
        } catch { /* nvidia-smi 不可用 */ }
    }

    // ====== IO 统计（磁盘读写 + 网络收发速率） ======
    const diskIO: { name: string; readBytes: number; writeBytes: number }[] = []
    const netIO: { name: string; rxBytes: number; txBytes: number }[] = []

    const plat = process.platform

    // —— 收集网络累计字节 ——
    try {
        if (plat === 'win32') {
            const buf = await new Promise<Buffer>((resolve, reject) => {
                exec('netstat -e', { timeout: 5000, encoding: 'buffer' }, (err, stdout) => {
                    if (err) return reject(err)
                    resolve(stdout)
                })
            })
            // netstat -e 输出在中文 Windows 上是 GBK 编码，需要解码
            let out = ''
            try { out = new TextDecoder('gbk').decode(buf) } catch { out = buf.toString('utf-8') }
            // 行格式: "Bytes                      12345678       87654321" 或 "字节"
            const lines = out.split(/\r?\n/).map(l => l.trim())
            const bytesLine = lines.find(l => l.startsWith('Bytes') || l.startsWith('字节'))
            if (bytesLine) {
                const parts = bytesLine.split(/\s+/).slice(1)
                if (parts.length >= 2) {
                    netIO.push({ name: '总流量', rxBytes: parseInt(parts[0]) || 0, txBytes: parseInt(parts[1]) || 0 })
                }
            }

            // netstat -e 失败时，用 PowerShell 作为备选
            if (netIO.length === 0) {
                try {
                    const psBuf = await new Promise<Buffer>((resolve, reject) => {
                        const cmd = `powershell -Command "$if=(Get-NetAdapterStatistics | Where-Object {$_.Name -like '*Ethernet*' -or $_.Name -like '*Wi-Fi*' -or $_.Name -like '*WLAN*'} | Select-Object -First 1); Write-Host ($if.ReceivedBytes) ($if.SentBytes)"`
                        exec(cmd, { timeout: 8000, encoding: 'buffer' }, (err, stdout) => {
                            if (err) return reject(err)
                            resolve(stdout)
                        })
                    })
                    const psOut = psBuf.toString('utf-8').trim()
                    if (psOut) {
                        const parts = psOut.split(/\s+/)
                        if (parts.length >= 2) {
                            netIO.push({ name: '总流量', rxBytes: parseInt(parts[0]) || 0, txBytes: parseInt(parts[1]) || 0 })
                        }
                    }
                } catch { /* PowerShell 备选也失败 */ }
            }
        } else if (plat === 'linux') {
            const out = await new Promise<string>((resolve, reject) => {
                exec('cat /proc/net/dev', { timeout: 3000, encoding: 'utf-8' }, (err, stdout) => {
                    if (err) return reject(err)
                    resolve(stdout)
                })
            })
            for (const line of out.split('\n').slice(2)) {
                const m = line.match(/^\s*(\w+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/)
                if (m && m[1] !== 'lo') {
                    netIO.push({ name: m[1], rxBytes: parseInt(m[2]), txBytes: parseInt(m[3]) })
                }
            }
        } else if (plat === 'darwin') {
            const out = await new Promise<string>((resolve, reject) => {
                exec('netstat -ib | grep -v lo0', { timeout: 3000, encoding: 'utf-8' }, (err, stdout) => {
                    if (err) return reject(err)
                    resolve(stdout)
                })
            })
            for (const line of out.split('\n').slice(1)) {
                const m = line.match(/^\s*(\w+)\s+\S+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(\d+)/)
                if (m && m[1] !== 'lo0') {
                    netIO.push({ name: m[1], rxBytes: parseInt(m[2]), txBytes: parseInt(m[3]) })
                }
            }
        }
    } catch { /* 网络 IO 采集失败 */ }

    // —— 收集磁盘累计字节 ——
    try {
        if (plat === 'win32') {
            // typeperf 直接返回当前瞬时速率 (Bytes/sec)，无需累计计算
            const buf = await new Promise<Buffer>((resolve, reject) => {
                exec('typeperf "\\PhysicalDisk(_Total)\\Disk Read Bytes/sec" "\\PhysicalDisk(_Total)\\Disk Write Bytes/sec" -sc 1',
                    { timeout: 5000, encoding: 'buffer' }, (err, stdout) => {
                    if (err) return reject(err)
                    resolve(stdout)
                })
            })
            let out = ''
            try { out = buf.toString('utf-8') } catch { out = buf.toString() }
            // typeperf 输出示例（带引号的 CSV）：
            // "(PDH-CSV 4.0)","\\HOST\PhysicalDisk..."
            // "07/17/2026 12:00:00.000","12345.678","9876.543"
            const lines = out.split(/\r?\n/).filter(l => l.includes(',') && l.includes('"'))
            if (lines.length >= 2) {
                // 解析第二行（数据行）：去掉日期时间后取 CSV 字段
                const dataLine = lines[1]
                const vals = dataLine.match(/"([0-9.eE+-]+)"/g)
                if (vals && vals.length >= 2) {
                    const readBytes = parseFloat(vals[0].replace(/"/g, ''))
                    const writeBytes = parseFloat(vals[1].replace(/"/g, ''))
                    if (!isNaN(readBytes) && !isNaN(writeBytes)) {
                        // typeperf 已经给出速率 (Bytes/sec)，作为 instantaneous read/write
                        diskIO.push({ name: '总磁盘', readBytes: readBytes, writeBytes: writeBytes })
                    }
                }
            }
    
            // 如果 typeperf 失败，尝试 PowerShell 采 WMI 格式化计数器
            if (diskIO.length === 0) {
                try {
                    const psBuf = await new Promise<Buffer>((resolve, reject) => {
                        exec(`powershell -Command "Get-Counter '\\PhysicalDisk(_Total)\\Disk Read Bytes/sec','\\PhysicalDisk(_Total)\\Disk Write Bytes/sec' | Select -Expand CounterSamples | ForEach { '{0}={1}' -f $_.Path.Split('\\\\')[-1].Replace(')','').Replace('(',''), $_.CookedValue }"`,
                            { timeout: 8000, encoding: 'buffer' }, (err, stdout) => {
                            if (err) return reject(err)
                            resolve(stdout)
                        })
                    })
                    const lines = psBuf.toString('utf-8').split(/\r?\n/).filter(l => l.includes('='))
                    let readVal = 0, writeVal = 0
                    for (const line of lines) {
                        const parts = line.split('=')
                        if (parts.length >= 2) {
                            if (parts[0].toLowerCase().includes('read')) readVal = parseFloat(parts[1]) || 0
                            if (parts[0].toLowerCase().includes('write')) writeVal = parseFloat(parts[1]) || 0
                        }
                    }
                    if (readVal > 0 || writeVal > 0) {
                        diskIO.push({ name: '总磁盘', readBytes: readVal, writeBytes: writeVal })
                    }
                } catch { /* PowerShell 备选也失败 */ }
            }
        } else if (plat === 'linux') {
            const out = await new Promise<string>((resolve, reject) => {
                exec('cat /proc/diskstats', { timeout: 3000, encoding: 'utf-8' }, (err, stdout) => {
                    if (err) return reject(err)
                    resolve(stdout)
                })
            })
            for (const line of out.split('\n')) {
                const m = line.match(/^\s*\d+\s+\d+\s+(\S+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(\d+)/)
                if (m && !m[1].startsWith('loop') && !m[1].startsWith('ram')) {
                    // 扇区数 * 512 = 字节
                    diskIO.push({ name: m[1], readBytes: (parseInt(m[2]) || 0) * 512, writeBytes: (parseInt(m[3]) || 0) * 512 })
                }
            }
        } else if (plat === 'darwin') {
            const out = await new Promise<string>((resolve, reject) => {
                exec('iostat -d -c 1', { timeout: 3000, encoding: 'utf-8' }, (err, stdout) => {
                    if (err) return reject(err)
                    resolve(stdout)
                })
            })
            // macOS iostat 输出的是瞬时速率 KB/t，但需要多次采样
            // 简化处理：第一行 header，第二行数据
            const lines = out.split('\n').filter(l => l.trim())
            if (lines.length >= 2) {
                const parts = lines[lines.length - 1].split(/\s+/).filter(Boolean)
                if (parts.length >= 3) {
                    diskIO.push({ name: 'disk0', readBytes: (parseFloat(parts[1]) || 0) * 1024, writeBytes: (parseFloat(parts[2]) || 0) * 1024 })
                }
            }
        }
    } catch { /* 磁盘 IO 采集失败 */ }

    // —— 磁盘 IO 聚合：多条物理磁盘合并为一条 "总磁盘"，避免条数波动 ——
    // typeperf 已经返回速率 (Bytes/sec)，不参与累计差值计算，直接透传
    if (diskIO.length > 0) {
        let totalRead = 0, totalWrite = 0
        for (const d of diskIO) { totalRead += d.readBytes; totalWrite += d.writeBytes }
        diskIO.length = 0
        diskIO.push({ name: '总磁盘', readBytes: totalRead, writeBytes: totalWrite })
    }
    // typeperf 返回瞬时速率标记
    const diskUseDirectRate = plat === 'win32' && diskIO.length > 0

    // —— 计算速率（通过与上次采样的差值 / 时间间隔）——
    const now = Date.now()
    const networkRate: { name: string; rxSpeed: number; txSpeed: number }[] = []
    const diskRate: { name: string; readSpeed: number; writeSpeed: number }[] = []

    for (const io of netIO) {
        const prev = _prevNet[io.name]
        if (prev && prev.time) {
            const dt = (now - prev.time) / 1000
            networkRate.push({
                name: io.name,
                rxSpeed: dt > 0 ? Math.max(0, (io.rxBytes - prev.rx) / dt) : 0,
                txSpeed: dt > 0 ? Math.max(0, (io.txBytes - prev.tx) / dt) : 0,
            })
        }
        _prevNet[io.name] = { rx: io.rxBytes, tx: io.txBytes, time: now }
    }
    for (const io of diskIO) {
        if (diskUseDirectRate) {
            // typeperf 已将速率作为 readBytes/writeBytes，直接使用
            diskRate.push({
                name: io.name,
                readSpeed: io.readBytes,
                writeSpeed: io.writeBytes,
            })
        } else {
            const prev = _prevDisk[io.name]
            if (prev && prev.time) {
                const dt = (now - prev.time) / 1000
                diskRate.push({
                    name: io.name,
                    readSpeed: dt > 0 ? Math.max(0, (io.readBytes - prev.read) / dt) : 0,
                    writeSpeed: dt > 0 ? Math.max(0, (io.writeBytes - prev.write) / dt) : 0,
                })
            }
            _prevDisk[io.name] = { read: io.readBytes, write: io.writeBytes, time: now }
        }
    }

    return {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        osType: os.type(),
        osRelease: os.release(),
        cpuModel: cpus[0]?.model || '未知',
        cpuCores: cpus.length,
        cpuUsage: parseFloat(cpuUsage),
        totalMemory: totalMem,
        usedMemory: usedMem,
        freeMemory: freeMem,
        memoryUsage: parseFloat(((usedMem / totalMem) * 100).toFixed(1)),
        uptime: os.uptime(),
        networks,
        disks,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        gpuModel,
        gpuUsage,
        networkRate,
        diskRate,
    }
})


// =================== 网络工具 IPC ===================

// Ping 测试
ipcMain.handle('network-ping', async (_event, host: string) => {
    return new Promise((resolve) => {
        const isWin = process.platform === 'win32'
        const cmd = isWin ? `ping -n 4 ${host}` : `ping -c 4 ${host}`
        // Windows ping 输出为 GBK 编码，需用 buffer 模式接收后手动解码
        exec(cmd, { timeout: 15000, encoding: 'buffer' }, (error, stdout, stderr) => {
            const decode = (buf: Buffer | string): string => {
                if (!buf || buf.length === 0) return ''
                const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
                try {
                    // Windows 中文环境 ping 输出为 GBK，优先尝试 GBK 解码
                    if (isWin) return new TextDecoder('gbk').decode(buffer)
                } catch { /* fallback to utf-8 */ }
                return buffer.toString('utf-8')
            }
            const stdoutStr = decode(stdout)
            const lines = stdoutStr ? stdoutStr.split('\n').filter(l => l.trim()) : []
            // ping 不通时退出码非零是正常行为，仍然返回输出内容
            const spawnError = error && (!stdoutStr || stdoutStr.length === 0)
            resolve({
                success: !spawnError,
                lines,
                error: spawnError ? (stderr ? decode(stderr) : error.message) : null
            })
        })
    })
})

// TCP 端口扫描
ipcMain.handle('network-tcp-scan', async (_event, { host, ports }: { host: string; ports: number[] }) => {
    const results: { port: number; status: string; time?: number }[] = []

    const scanPort = (port: number): Promise<{ port: number; status: string; time?: number }> => {
        return new Promise((resolve) => {
            const start = Date.now()
            const socket = new net.Socket()
            socket.setTimeout(2000)

            socket.on('connect', () => {
                const time = Date.now() - start
                socket.destroy()
                resolve({ port, status: 'open', time })
            })

            socket.on('timeout', () => {
                socket.destroy()
                resolve({ port, status: 'closed' })
            })

            socket.on('error', () => {
                socket.destroy()
                resolve({ port, status: 'closed' })
            })

            socket.connect(port, host)
        })
    }

    // 并发扫描（最多10个并发）
    const batchSize = 10
    for (let i = 0; i < ports.length; i += batchSize) {
        const batch = ports.slice(i, i + batchSize)
        const batchResults = await Promise.all(batch.map(scanPort))
        results.push(...batchResults)
    }

    return { results }
})

// =================== TCP/UDP 客户端 IPC ===================

let tcpClient: net.Socket | null = null
let udpClient: any = null
let networkProtocol: 'tcp' | 'udp' = 'tcp'
let networkTarget = { host: '', port: 0 }

// TCP/UDP 服务端
let tcpServer: net.Server | null = null
let tcpServerClients: net.Socket[] = []
let udpServer2: any = null  // 网络工具用的 UDP 服务端
let serverMode = false

// 获取网卡接口列表（用于网络工具选择）
ipcMain.handle('get-network-interfaces-list', async () => {
    const interfaces = os.networkInterfaces()
    const result: { name: string; ip: string; mac: string; netmask: string }[] = []
    for (const [name, ifaces] of Object.entries(interfaces)) {
        if (!ifaces) continue
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                result.push({ name, ip: iface.address, mac: iface.mac, netmask: iface.netmask })
            }
        }
    }
    // 也加上 0.0.0.0 方便监听所有
    result.unshift({ name: '所有接口', ip: '0.0.0.0', mac: '', netmask: '' })
    return result
})

// 服务端启动
ipcMain.handle('network-server-start', async (_event, { host, port, protocol }: { host: string; port: number; protocol: 'tcp' | 'udp' }) => {
    try {
        networkProtocol = protocol
        serverMode = true

        if (protocol === 'tcp') {
            // 关闭旧服务
            if (tcpServer) {
                tcpServer.close()
                tcpServerClients.forEach(c => c.destroy())
                tcpServerClients = []
                tcpServer = null
            }

            return new Promise((resolve) => {
                tcpServer = net.createServer((socket) => {
                    const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`
                    tcpServerClients.push(socket)
                    broadcastToAll('network-data', { client: clientAddr, data: `[客户端连接] ${clientAddr}` })

                    socket.on('data', (data: Buffer) => {
                        broadcastToAll('network-data', {
                            hex: data.toString('hex'),
                            data: data.toString()
                        })
                    })

                    socket.on('close', () => {
                        tcpServerClients = tcpServerClients.filter(c => c !== socket)
                        broadcastToAll('network-data', { data: `[客户端断开] ${clientAddr}`, hex: '' })
                    })

                    socket.on('error', (err: Error) => {
                        broadcastToAll('network-data', { data: `[客户端错误] ${err.message}`, hex: '' })
                    })
                })

                tcpServer.on('error', (err: Error) => {
                    resolve({ success: false, error: err.message })
                })

                tcpServer.listen(port, host, () => {
                    resolve({ success: true })
                })
            })
        } else {
            // UDP 服务端
            const dgram = require('dgram')
            if (udpServer2) {
                udpServer2.close()
                udpServer2 = null
            }
            udpServer2 = dgram.createSocket('udp4')

            udpServer2.on('message', (msg: Buffer, rinfo: any) => {
                // 记录来源，方便回复
                networkTarget = { host: rinfo.address, port: rinfo.port }
                broadcastToAll('network-data', {
                    hex: msg.toString('hex'),
                    data: msg.toString()
                })
            })

            udpServer2.on('error', (err: Error) => {
                broadcastToAll('network-data', { data: `[ERROR] ${err.message}`, hex: '' })
            })

            return new Promise((resolve) => {
                udpServer2.bind(port, host, () => {
                    resolve({ success: true })
                })
            })
        }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
})

// 服务端停止
ipcMain.handle('network-server-stop', async () => {
    try {
        serverMode = false
        if (tcpServer) {
            tcpServerClients.forEach(c => c.destroy())
            tcpServerClients = []
            tcpServer.close()
            tcpServer = null
        }
        if (udpServer2) {
            udpServer2.close()
            udpServer2 = null
        }
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
})

// TCP/UDP 连接
ipcMain.handle('network-tcp-connect', async (_event, { host, port, protocol }: { host: string; port: number; protocol: 'tcp' | 'udp' }) => {
    try {
        networkProtocol = protocol
        networkTarget = { host, port }

        if (protocol === 'tcp') {
            // 关闭旧连接（彻底清理）
            if (tcpClient) {
                tcpClient.removeAllListeners()
                tcpClient.destroy()
                tcpClient = null
            }

            return new Promise((resolve) => {
                tcpClient = new net.Socket()
                let resolved = false
                let hadError = false

                tcpClient.setTimeout(5000)

                tcpClient.connect(port, host, () => {
                    resolved = true
                    tcpClient.setTimeout(0) // 连接成功后取消超时
                    resolve({ success: true })
                })

                tcpClient.on('data', (data: Buffer) => {
                    broadcastToAll('network-data', {
                        hex: data.toString('hex'),
                        data: data.toString()
                    })
                })

                tcpClient.on('error', (err: Error) => {
                    hadError = true
                    if (!resolved) {
                        resolved = true
                        resolve({ success: false, error: err.message })
                    }
                    broadcastToAll('network-data', { data: `[ERROR] ${err.message}`, hex: '' })
                })

                tcpClient.on('close', (hadErrorFlag: boolean) => {
                    // 只有异常关闭（非主动断开）才通知前端
                    if (!hadErrorFlag && !resolved) {
                        broadcastToAll('network-data', { data: '[连接已关闭]', hex: '' })
                    }
                    tcpClient = null
                })

                tcpClient.on('timeout', () => {
                    if (!resolved) {
                        resolved = true
                        tcpClient?.destroy()
                        resolve({ success: false, error: '连接超时' })
                    }
                })
            })
        } else {
            // UDP
            const dgram = require('dgram')
            if (udpClient) {
                udpClient.close()
                udpClient = null
            }
            udpClient = dgram.createSocket('udp4')

            udpClient.on('message', (msg: Buffer) => {
                broadcastToAll('network-data', {
                    hex: msg.toString('hex'),
                    data: msg.toString()
                })
            })

            udpClient.on('error', (err: Error) => {
                broadcastToAll('network-data', { data: `[ERROR] ${err.message}`, hex: '' })
            })

            // UDP 绑定随机端口
            udpClient.bind(0)
            return { success: true }
        }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
})

// 断开连接
ipcMain.handle('network-tcp-disconnect', async () => {
    try {
        if (tcpClient) {
            tcpClient.removeAllListeners('close')
            tcpClient.removeAllListeners('data')
            tcpClient.removeAllListeners('error')
            tcpClient.destroy()
            tcpClient = null
        }
        if (udpClient) {
            udpClient.close()
            udpClient = null
        }
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
})

// 发送数据（客户端+服务端通用）
ipcMain.handle('network-tcp-send', async (_event, { data, hex }: { data: string; hex: boolean }) => {
    try {
        let buffer: Buffer
        if (hex) {
            const hexStr = data.replace(/\s+/g, '')
            buffer = Buffer.from(hexStr, 'hex')
        } else {
            buffer = Buffer.from(data)
        }

        if (serverMode) {
            // 服务端模式
            if (networkProtocol === 'tcp') {
                if (tcpServerClients.length === 0) {
                    return { success: false, error: '没有客户端连接' }
                }
                // 广播给所有连接的客户端
                tcpServerClients.forEach(c => {
                    if (!c.destroyed) c.write(buffer)
                })
                return { success: true }
            } else {
                if (!udpServer2 || !networkTarget.host) {
                    return { success: false, error: 'UDP服务未启动或无目标' }
                }
                return new Promise((resolve) => {
                    udpServer2.send(buffer, networkTarget.port, networkTarget.host, (err: any) => {
                        if (err) resolve({ success: false, error: err.message })
                        else resolve({ success: true })
                    })
                })
            }
        } else {
            // 客户端模式
            if (networkProtocol === 'tcp') {
                if (!tcpClient || tcpClient.destroyed) {
                    return { success: false, error: 'TCP未连接' }
                }
                tcpClient.write(buffer)
                return { success: true }
            } else {
                if (!udpClient) {
                    return { success: false, error: 'UDP未连接' }
                }
                return new Promise((resolve) => {
                    udpClient.send(buffer, networkTarget.port, networkTarget.host, (err: any) => {
                        if (err) resolve({ success: false, error: err.message })
                        else resolve({ success: true })
                    })
                })
            }
        }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
})

// =================== 串口工具 IPC ===================

let serialPort: any = null
let SerialPortModule: any = null
let serialBuffer = Buffer.alloc(0)
let serialFlushTimer: NodeJS.Timeout | null = null
const SERIAL_FLUSH_INTERVAL = 30 // ms：30ms 内无新数据到达则合并发送

/** 清空串口缓冲区并取消定时器 */
function clearSerialBuffer() {
    if (serialFlushTimer) {
        clearTimeout(serialFlushTimer)
        serialFlushTimer = null
    }
    serialBuffer = Buffer.alloc(0)
}

/** 刷新串口缓冲区：将累积数据作为一个完整消息发送 */
function flushSerialBuffer() {
    if (serialBuffer.length > 0) {
        const merged = serialBuffer
        serialBuffer = Buffer.alloc(0)
        broadcastToAll('serial-data', {
            data: merged.toString(),
            hex: merged.toString('hex')
        })
    }
}

// 动态加载 serialport
async function getSerialPortModule() {
    if (!SerialPortModule) {
        try {
            SerialPortModule = require('serialport')
        } catch (e) {
            console.warn('⚠️ serialport 模块未安装')
            return null
        }
    }
    return SerialPortModule
}

// 获取串口列表
ipcMain.handle('serial-list-ports', async () => {
    try {
        const sp = await getSerialPortModule()
        if (!sp) return { ports: [], error: 'serialport 模块未安装，请执行: yarn add serialport' }
        const ports = await sp.SerialPort.list()
        return { ports }
    } catch (e: any) {
        return { ports: [], error: e.message }
    }
})

// 打开串口
ipcMain.handle('serial-open', async (_event, { path: portPath, baudRate: baud }) => {
    try {
        const sp = await getSerialPortModule()
        if (!sp) return { success: false, error: 'serialport 模块未安装' }

        // 清空旧缓冲区
        clearSerialBuffer()

        if (serialPort && serialPort.isOpen) {
            serialPort.close()
            serialPort = null
        }

        return new Promise((resolve) => {
            serialPort = new sp.SerialPort({ path: portPath, baudRate: baud }, (err: any) => {
                if (err) {
                    serialPort = null
                    resolve({ success: false, error: err.message })
                    return
                }
                resolve({ success: true })
            })

            serialPort.on('data', (data: Buffer) => {
                // 累积到缓冲区，重置定时器
                serialBuffer = Buffer.concat([serialBuffer, data])
                if (serialFlushTimer) clearTimeout(serialFlushTimer)
                serialFlushTimer = setTimeout(flushSerialBuffer, SERIAL_FLUSH_INTERVAL)
            })

            serialPort.on('error', (err: Error) => {
                console.error('串口错误:', err.message)
                broadcastToAll('serial-data', { data: `[ERROR] ${err.message}`, hex: '' })
            })

            serialPort.on('close', () => {
                console.log('串口已关闭')
            })
        })
    } catch (e: any) {
        return { success: false, error: e.message }
    }
})

// 关闭串口
ipcMain.handle('serial-close', async () => {
    try {
        // 先刷新缓冲区中的残留数据
        flushSerialBuffer()
        if (serialPort && serialPort.isOpen) {
            serialPort.close()
            serialPort = null
        }
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message }
    }
})

// 发送数据
ipcMain.handle('serial-send', async (_event, { data, hex }: { data: string; hex: boolean }) => {
    try {
        if (!serialPort || !serialPort.isOpen) {
            return { success: false, error: '串口未打开' }
        }

        let buffer: Buffer
        if (hex) {
            // HEX 模式：将空格分隔的十六进制字符串转为 Buffer
            const hexStr = data.replace(/\s+/g, '')
            buffer = Buffer.from(hexStr, 'hex')
        } else {
            buffer = Buffer.from(data + '\r\n')
        }

        return new Promise((resolve) => {
            serialPort.write(buffer, (err: any) => {
                if (err) {
                    resolve({ success: false, error: err.message })
                } else {
                    serialPort.drain((drainErr: any) => {
                        if (drainErr) {
                            resolve({ success: false, error: drainErr.message })
                        } else {
                            resolve({ success: true })
                        }
                    })
                }
            })
        })
    } catch (e: any) {
        return { success: false, error: e.message }
    }
})


// =================== 日志查询 IPC ===================

// 获取日志日期列表
ipcMain.handle('get-log-dates', async () => {
    try {
        const dir = getLogsDir()
        if (!fs.existsSync(dir)) return []
        return fs.readdirSync(dir).filter(f => {
            const fullPath = path.join(dir, f)
            return fs.statSync(fullPath).isDirectory()
        }).sort().reverse()
    } catch {
        return []
    }
})

// 获取某日期的设备列表（含名称）
ipcMain.handle('get-log-devices', async (_event, date: string) => {
    try {
        const dateDir = path.join(getLogsDir(), date)
        if (!fs.existsSync(dateDir)) return []
        return fs.readdirSync(dateDir).filter(f => {
            return fs.statSync(path.join(dateDir, f)).isDirectory()
        }).sort().map(dirName => {
            let name = ''
            try {
                const infoFile = path.join(dateDir, dirName, 'device_info.txt')
                if (fs.existsSync(infoFile)) {
                    name = fs.readFileSync(infoFile, 'utf-8').trim()
                }
            } catch { /* ignore */ }
            return { id: dirName, name: name || dirName }
        })
    } catch {
        return []
    }
})

// 获取某设备下的日志文件列表（udp.log / mqtt.log）
ipcMain.handle('get-log-files', async (_event, { date, deviceId }: { date: string; deviceId: string }) => {
    try {
        const deviceDir = path.join(getLogsDir(), date, deviceId)
        if (!fs.existsSync(deviceDir)) return []
        return fs.readdirSync(deviceDir).filter(f => f.endsWith('.log')).sort()
    } catch {
        return []
    }
})

// 读取日志文件内容（按小时合并，时间正序）
ipcMain.handle('read-log-file', async (_event, { date, deviceId, protocol }: { date: string; deviceId: string; protocol: string }) => {
    try {
        const deviceDir = path.join(getLogsDir(), date, deviceId)
        if (!fs.existsSync(deviceDir)) return ''

        // 收集所有 protocol_HH.log 文件，按小时排序后合并
        const pattern = new RegExp(`^${protocol}_(\\d{2})\\.log$`)
        const hourFiles: { hour: string; file: string }[] = []
        for (const f of fs.readdirSync(deviceDir)) {
            const m = f.match(pattern)
            if (m) {
                hourFiles.push({ hour: m[1], file: f })
            }
        }
        hourFiles.sort((a, b) => a.hour.localeCompare(b.hour))

        // 合并所有小时文件
        const contents = hourFiles.map(hf =>
            fs.readFileSync(path.join(deviceDir, hf.file), 'utf-8').trim()
        ).filter(c => c.length > 0)

        return contents.join('\n')
    } catch {
        return ''
    }
})

// =================== 窗口控制 IPC ===================

ipcMain.on('window-minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.on('window-maximize', (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    if (senderWin?.isMaximized()) {
        senderWin?.unmaximize()
    } else {
        senderWin?.maximize()
    }
})

ipcMain.on('window-close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('window-is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
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
        win?.webContents.toggleDevTools()
    })

    globalShortcut.register('F12', () => {
        win?.webContents.toggleDevTools()
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