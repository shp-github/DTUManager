import { contextBridge, ipcRenderer } from 'electron'

/**
 * ========= 暴露给渲染进程的 API =========
 * 可以在 Vue 中通过 window.electronAPI 调用
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // -------------------- 基础通信 --------------------
    on: (channel: string, listener: (...args: any[]) => void) => {
        ipcRenderer.on(channel, (_, ...args) => listener(...args))
    },
    off: (channel: string, listener?: (...args: any[]) => void) => {
        ipcRenderer.off(channel, listener)
    },
    send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

    // -------------------- 业务接口 --------------------
    saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
    loadConfig: () => ipcRenderer.invoke('load-config'),
    readDeviceConfig: (params: any) => ipcRenderer.invoke('read-device-config', params),
    openChildWindow: (page: string) => ipcRenderer.invoke('open-win', page),
    onDeviceDiscovered: (callback: (devices: any[]) => void) => ipcRenderer.on('udp-device-discovered', (_, devices) => callback(devices)),
    sendConfig: (payload: { ip: string; config: any }) => ipcRenderer.invoke('sendConfig', payload),
    saveFile: (fileName, fileData) => ipcRenderer.invoke('save-file', { fileName, fileData }),
    getFileList: () => ipcRenderer.invoke('get-file-list'),
    sendUpgradeCommand: (deviceIp, fileName, serverInfo) => ipcRenderer.invoke('send-upgrade-command', { deviceIp, fileName, serverInfo }),})

/**
 * ========= 页面加载动画 =========
 */
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
    return new Promise((resolve) => {
        if (condition.includes(document.readyState)) {
            resolve(true)
        } else {
            document.addEventListener('readystatechange', () => {
                if (condition.includes(document.readyState)) resolve(true)
            })
        }
    })
}

const safeDOM = {
    append(parent: HTMLElement, child: HTMLElement) {
        if (!Array.from(parent.children).includes(child)) parent.appendChild(child)
    },
    remove(parent: HTMLElement, child: HTMLElement) {
        if (Array.from(parent.children).includes(child)) parent.removeChild(child)
    },
}

function useLoading() {
    const className = 'loaders-css__square-spin'
    const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9999;
}
  `
    const oStyle = document.createElement('style')
    const oDiv = document.createElement('div')

    oStyle.id = 'app-loading-style'
    oStyle.innerHTML = styleContent
    oDiv.className = 'app-loading-wrap'
    oDiv.innerHTML = `<div class="${className}"><div></div></div>`

    return {
        appendLoading() {
            safeDOM.append(document.head, oStyle)
            safeDOM.append(document.body, oDiv)
        },
        removeLoading() {
            safeDOM.remove(document.head, oStyle)
            safeDOM.remove(document.body, oDiv)
        },
    }
}

// -------- 启动加载动画 --------
const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

// 收到消息后移除动画
window.onmessage = (ev) => {
    if (ev.data?.payload === 'removeLoading') removeLoading()
}

// 最迟 1 秒后移除加载动画，防止卡死
setTimeout(removeLoading, 1000)
