import { app, BrowserWindow, shell, ipcMain, Menu,globalShortcut  } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'path'
import os from 'os'
import dgram from 'dgram'

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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    win = null
    if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
    if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

//快捷键打开控制台
app.whenReady().then(() => {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        win?.webContents.openDevTools()
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


udpServer.bind(UDP_DISCOVERY_PORT, () => {
    console.log(`✅ Listening UDP discovery port ${UDP_DISCOVERY_PORT}`)
})

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
                const msg = Buffer.from(JSON.stringify({ type: 'config', ...(config || {}) }))
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

// =================== 优化后的读取设备配置 ===================
ipcMain.handle('read-device-config', async (_event, device) => {
    if (!device || !device.ip) {
        throw new Error('Invalid device object')
    }

    const ip = device.ip
    const sock = dgram.createSocket('udp4')
    let closed = false
    const closeSock = () => {
        if (!closed) {
            sock.close()
            closed = true
        }
    }

    const msg = Buffer.from(JSON.stringify({ type: 'read_config' }))

    return new Promise((resolve, reject) => {
        sock.send(msg, UDP_CONFIG_PORT, ip, (err) => {
            if (err) {
                closeSock()
                return reject(err)
            }
        })

        sock.on('message', (msg, rinfo) => {
            try {
                const payload = JSON.parse(msg.toString())
                if (payload.type === 'config' && rinfo.address === ip) {
                    closeSock()
                    resolve(payload)
                }
            } catch (err) {
                closeSock()
                reject(err)
            }
        })

        const timer = setTimeout(() => {
            closeSock()
            reject(new Error('Device read config timeout'))
        }, 3000)

        const originalResolve = resolve
        const originalReject = reject
        resolve = (val) => { clearTimeout(timer); originalResolve(val) }
        reject = (err) => { clearTimeout(timer); originalReject(err) }
    })
})
