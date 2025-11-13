// src/types/electron.d.ts
export {}

declare global {
    interface Window {
        electronAPI: {
            onDeviceDiscovered: (callback: (devices: any[]) => void) => void
            on: (channel: string, listener: (...args: any[]) => void) => void
            off: (channel: string, listener?: (...args: any[]) => void) => void
            send: (channel: string, ...args: any[]) => void
            invoke: (channel: string, ...args: any[]) => Promise<any>
            saveConfig: (config: any) => Promise<any>
            loadConfig: () => Promise<any>
            readDeviceConfig: (device: any) => Promise<any>
            openChildWindow: (page: string) => Promise<void>
            sendConfig: (payload: { ip: string; config: any }) => Promise<any>
        }
    }
}
