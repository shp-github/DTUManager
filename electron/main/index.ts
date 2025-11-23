import { app, BrowserWindow, shell, ipcMain, Menu, globalShortcut } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'path'
import os from 'os'
import dgram from 'dgram'
import fileServer from './fileServer';
import fs from 'fs';

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

import type { MenuItemConstructorOptions } from 'electron'

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

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL)
        win.webContents.openDevTools()
    } else {
        win.loadFile(indexHtml)
    }

    win.maximize()

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:')) shell.openExternal(url)
        return { action: 'deny' }
    })

    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', new Date().toLocaleString())
    })

    // 中文菜单
    const menuTemplate: MenuItemConstructorOptions[] = [
        {
            label: '文件',
            submenu: [
                { label: '新建配置', click: () => win?.webContents.send('menu-action', 'new') },
                { label: '保存配置', click: () => win?.webContents.send('menu-action', 'save') },
                { type: 'separator' },
                { label: '退出', role: 'quit' }
            ]
        },
        {
            label: '编辑',
            submenu: [
                { label: '撤销', role: 'undo' },
                { label: '重做', role: 'redo' },
                { type: 'separator' },
                { label: '剪切', role: 'cut' },
                { label: '复制', role: 'copy' },
                { label: '粘贴', role: 'paste' }
            ]
        },
        {
            label: '帮助',
            submenu: [
                { label: '关于', click: () => win?.webContents.send('menu-action', 'about') }
            ]
        }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))
}

// =================== UDP 模块 ===================
const UDP_DISCOVERY_PORT = 4210
const UDP_CONFIG_PORT = 4211
const devices = new Map<string, any>()

const udpServer = dgram.createSocket('udp4')

// 监听设备广播
udpServer.on('message', (msg, rinfo) => {
    try {
        const payload = JSON.parse(msg.toString())

        if (payload.type === 'discover') {
            const id = payload.id || rinfo.address

            // 更新设备列表
            devices.set(id, {
                id,
                mac: payload.mac || "",
                ip: payload.ip || rinfo.address,
                networkType: payload.networkType || "UNKNOWN",
                RSSI: payload.RSSI ?? null,
                runtime: payload.runtime ?? 0,
                firmware: payload.firmware || "?",
                heart_interval: payload.heart_interval || "?",
                lastSeen: new Date().toLocaleTimeString()
            })

            console.log(`[DISCOVERY] Device found: ${id} @ ${rinfo.address}`)

            // 发送给渲染进程（前端）
            win?.webContents.send(
                'udp-device-discovered',
                Array.from(devices.values())
            )
        }

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[WARNING] Failed to parse UDP message:', message)
    }
})

// 启动 UDP 服务器
udpServer.bind(UDP_DISCOVERY_PORT, () => {
    console.log(`✅ Listening UDP discovery port ${UDP_DISCOVERY_PORT}`)
})

// =================== IPC 处理器 ===================

// 渲染进程获取设备列表
ipcMain.handle('getDevices', async () => {
    return Array.from(devices.values())
})

// 渲染进程发送配置命令
ipcMain.handle('sendConfig', async (_event, { ip, config }) => {
    const sock = dgram.createSocket('udp4')
    const msg = Buffer.from(JSON.stringify({ type: 'config', ...(config || {}) }))
    return new Promise((resolve, reject) => {
        sock.send(msg, UDP_CONFIG_PORT, ip, err => {
            sock.close()
            if (err) reject(err)
            else resolve('ok')
        })
    })
})

// 渲染进程调用：window.electronAPI.saveConfig(payload)
ipcMain.handle('save-config', async (_event, payload) => {
    try {
        const entries = Object.entries(payload)
        for (const [deviceId, config] of entries) {
            const device = devices.get(deviceId)
            if (device) {
                const sock = dgram.createSocket('udp4')
                const msg = Buffer.from(JSON.stringify({ type: 'config', ...(config || {}) as object }))
                await new Promise<void>((resolve, reject) => {
                    sock.send(msg, UDP_CONFIG_PORT, device.ip, (err) => {
                        sock.close()
                        if (err) reject(err)
                        else resolve()
                    })
                })
            }
        }

        return { success: true }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[SAVE] Error:', message)
        return { success: false, error: message }
    }
})

// 优化后的读取设备配置（带调试日志）
ipcMain.handle('read-device-config', async (_event, device) => {
    if (!device || !device.ip) {
        console.error('[READ CONFIG] 无效的 device 对象:', device)
        throw new Error('Invalid device object')
    }

    const ip = device.ip
    const sock = dgram.createSocket('udp4')
    let closed = false
    const closeSock = () => {
        if (!closed) {
            sock.close()
            closed = true
            console.log('[READ CONFIG] UDP socket 已关闭')
        }
    }

    const msg = Buffer.from(JSON.stringify({ type: 'read_config' }))
    console.log(`[READ CONFIG] 准备发送读取请求到设备 ${device.id} (${ip}:${UDP_CONFIG_PORT})`, msg.toString())

    return new Promise((resolve, reject) => {
        sock.send(msg, UDP_CONFIG_PORT, ip, (err) => {
            if (err) {
                console.error('[READ CONFIG] 发送请求失败:', err)
                closeSock()
                return reject(err)
            } else {
                console.log(`[READ CONFIG] 已发送请求到 ${ip}:${UDP_CONFIG_PORT}`)
            }
        })

        sock.on('message', (msg, rinfo) => {
            console.log(`[READ CONFIG] 收到 UDP 消息，来自 ${rinfo.address}:${rinfo.port}，长度 ${msg.length}`)
            try {
                const payload = JSON.parse(msg.toString())
                console.log('[READ CONFIG] 消息内容:', payload)
                if (payload.type === 'config' && rinfo.address === ip) {
                    console.log(`[READ CONFIG] 配置已匹配，返回给前端`)
                    closeSock()
                    resolve(payload)
                }
            } catch (err) {
                console.error('[READ CONFIG] 解析消息失败:', err)
                closeSock()
                reject(err)
            }
        })

        const timer = setTimeout(() => {
            console.error(`[READ CONFIG] 设备读取配置超时 (${ip})`)
            closeSock()
            reject(new Error('Device read config timeout'))
        }, 3000)

        const originalResolve = resolve
        const originalReject = reject
        resolve = (val) => { clearTimeout(timer); originalResolve(val) }
        reject = (err) => { clearTimeout(timer); originalReject(err) }
    })
})

// 打开子窗口示例
ipcMain.handle('open-win', (_, arg) => {
    const childWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload,
            nodeIntegration: false,
            contextIsolation: true,
        }
    })

    if (VITE_DEV_SERVER_URL) {
        childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
    } else {
        childWindow.loadFile(indexHtml, { hash: arg })
    }
})


// 添加文件保存的 IPC 处理器
ipcMain.handle('save-file', async (event, { fileName, fileData }: { fileName: string; fileData: ArrayBuffer }) => {
    try {
        const filesDir = path.join(process.cwd(), 'files');

        // 确保 files 目录存在
        if (!fs.existsSync(filesDir)) {
            fs.mkdirSync(filesDir, { recursive: true });
        }

        const filePath = path.join(filesDir, fileName);

        // 将 ArrayBuffer 转换为 Buffer 并写入文件
        const buffer = Buffer.from(fileData);
        fs.writeFileSync(filePath, buffer);

        console.log(`✅ 文件已保存: ${filePath}`);
        return { success: true, path: filePath };
    } catch (error: any) {
        console.error('❌ 文件保存失败:', error);
        return { success: false, error: error.message };
    }
});

// 获取文件列表的 IPC 处理器（可选，用于显示已上传的文件）
ipcMain.handle('get-file-list', async () => {
    try {
        const filesDir = path.join(process.cwd(), 'files');

        if (!fs.existsSync(filesDir)) {
            return { success: true, files: [] };
        }

        const files = fs.readdirSync(filesDir);
        return { success: true, files };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
});

// 设备升级 IPC 处理器 - 提供完整下载地址
ipcMain.handle('send-upgrade-command', async (event, { deviceIp, fileName, serverInfo }) => {
    try {
        const sock = dgram.createSocket('udp4');

        // 获取本机所有网络地址
        const addresses = getNetworkAddresses();

        // 构建完整的下载 URL（使用第一个可用的局域网 IP）
        const localIp = addresses[0] || 'localhost';
        const downloadUrl = `http://${localIp}:${serverInfo.port}/download/${fileName}`;

        // 构建升级命令消息
        const upgradeMessage = {
            type: 'upgrade',
            fileName: fileName,
            downloadUrl: downloadUrl,
            fileSize: serverInfo.fileSize, // 可选：文件大小
            timestamp: Date.now(),
            serverInfo: {
                ip: localIp,
                port: serverInfo.port
            }
        };

        const msg = Buffer.from(JSON.stringify(upgradeMessage));

        return new Promise((resolve, reject) => {
            sock.send(msg, UDP_CONFIG_PORT, deviceIp, (err) => {
                sock.close();
                if (err) {
                    reject(err);
                } else {
                    console.log(`✅ 升级命令已发送到设备 ${deviceIp}`);
                    console.log(`📥 下载地址: ${downloadUrl}`);
                    resolve({
                        success: true,
                        downloadUrl: downloadUrl,
                        serverIp: localIp
                    });
                }
            });
        });

    } catch (error: any) {
        console.error('❌ 发送升级命令失败:', error);
        return { success: false, error: error.message };
    }
});

// 获取本机网络地址函数（确保这个函数存在）
function getNetworkAddresses(): string[] {
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    const addresses: string[] = [];

    for (const interfaceName of Object.keys(networkInterfaces)) {
        for (const netInterface of networkInterfaces[interfaceName]) {
            if (netInterface.family === 'IPv4' && !netInterface.internal) {
                addresses.push(netInterface.address);
            }
        }
    }

    return addresses;
}



// =================== 应用生命周期 ===================

app.whenReady().then(async () => {
    console.log('🎯 Electron 应用启动中...');

    // 创建主窗口
    createWindow();

    // 自动启动文件服务器
    const result = await fileServer.start(8080);

    if (!result.success) {
        console.error('❌ 文件服务器启动失败:', result.error);
        // 如果默认端口被占用，尝试其他端口
        for (let port = 8081; port <= 8090; port++) {
            const retryResult = await fileServer.start(port);
            if (retryResult.success) {
                break;
            }
        }
    }

    // 注册快捷键
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        win?.webContents.openDevTools()
    })
})

// 应用事件监听器
app.on('window-all-closed', () => {
    fileServer.stop();
    if (process.platform !== 'darwin') {
        app.quit();
    }
})

app.on('activate', () => {
    // 在 macOS 上，当点击 dock 图标且没有其他窗口打开时，
    // 通常在应用程序中重新创建一个窗口
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
})

app.on('before-quit', () => {
    fileServer.stop();
})

app.on('second-instance', () => {
    if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
    }
})