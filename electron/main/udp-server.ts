// udp-server.ts
import dgram from 'dgram';
import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';

export interface DeviceInfo {
    id: string;
    name: string;
    mac: string;
    ip: string;
    networkType: string;
    RSSI: number | null;
    runtime: number;
    firmware: string;
    heart_interval: number;
    lastSeen: number;
}

export interface UDPServerOptions {
    discoveryPort?: number;
    configPort?: number;
    deviceTimeout?: number; // 毫秒
}

export class UDPServer extends EventEmitter {
    private devices = new Map<string, DeviceInfo>();
    private discoveryPort: number;
    private configPort: number;
    private deviceTimeout: number;
    private discoveryServer: dgram.Socket | null = null;
    private configServer: dgram.Socket | null = null;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private win: BrowserWindow | null = null;

    constructor(options: UDPServerOptions = {}) {
        super();
        this.discoveryPort = options.discoveryPort || 4210;
        this.configPort = options.configPort || 4211;
        this.deviceTimeout = options.deviceTimeout || 11000; // 11秒
    }

    // 设置主窗口引用（用于发送消息到渲染进程）
    setWindow(win: BrowserWindow) {
        this.win = win;
    }

    // 启动UDP服务
    async start(): Promise<{ success: boolean; error?: string }> {
        try {
            await this.startDiscoveryServer();
            await this.startConfigServer();
            this.startDeviceCleanup();

            console.log(`✅ UDP服务已启动 - 发现端口:${this.discoveryPort}, 配置端口:${this.configPort}`);
            return { success: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('❌ UDP服务启动失败:', errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    // 停止UDP服务
    async stop(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        if (this.discoveryServer) {
            this.discoveryServer.close();
            this.discoveryServer = null;
        }

        if (this.configServer) {
            this.configServer.close();
            this.configServer = null;
        }

        this.devices.clear();
        console.log('UDP服务已停止');
    }

    // 获取所有设备
    getDevices(): Omit<DeviceInfo, "lastSeen">[] {
        return Array.from(this.devices.values()).map(device => {
            const { lastSeen, ...deviceData } = device;
            return deviceData;
        });
    }

    // 获取特定设备
    getDevice(deviceId: string): Omit<DeviceInfo, "lastSeen"> {
        const device = this.devices.get(deviceId);
        if (!device) return null;

        const { lastSeen, ...deviceData } = device;
        return deviceData;
    }

    // 发送配置到设备
    async sendConfig(deviceIp: string, config: any): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            const sock = dgram.createSocket('udp4');
            const msg = Buffer.from(JSON.stringify({ type: 'config', ...config }));

            sock.send(msg, this.configPort, deviceIp, (err) => {
                sock.close();
                if (err) {
                    const errorMessage = `发送配置到 ${deviceIp} 失败: ${err.message}`;
                    console.error('❌', errorMessage);
                    resolve({ success: false, error: errorMessage });
                } else {
                    console.log(`✅ 配置已发送到设备 ${deviceIp}`);
                    resolve({ success: true });
                }
            });
        });
    }

    // 发送升级命令
    async sendUpgradeCommand(
        deviceIp: string,
        fileName: string,
        serverInfo: { port: number; fileSize?: number }
    ): Promise<{ success: boolean; downloadUrl?: string; error?: string }> {
        return new Promise((resolve) => {
            const sock = dgram.createSocket('udp4');

            // 获取本机IP
            const localIp = this.getLocalIP();
            const downloadUrl = `http://${localIp}:${serverInfo.port}/download/${fileName}`;

            const upgradeMessage = {
                type: 'upgrade',
                fileName,
                downloadUrl,
                fileSize: serverInfo.fileSize,
                timestamp: Date.now(),
                ip: localIp,
                mqttPort: 1883,
                mqttUsername: "device",
                mqttPassword: "123456"
            };

            const msg = Buffer.from(JSON.stringify(upgradeMessage));

            sock.send(msg, this.configPort, deviceIp, (err) => {
                sock.close();
                if (err) {
                    const errorMessage = `发送升级命令到 ${deviceIp} 失败: ${err.message}`;
                    console.error('❌', errorMessage);
                    resolve({ success: false, error: errorMessage });
                } else {
                    console.log(`✅ 升级命令已发送到设备 ${deviceIp}`);
                    resolve({ success: true, downloadUrl });
                }
            });
        });
    }

    // 发送MQTT连接命令
    async sendMqttConnectCommand(deviceIp: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            const sock = dgram.createSocket('udp4');

            const connectCommand = {
                type: 'connect-mqtt',
                ip: this.getLocalIP()
            };

            const message = Buffer.from(JSON.stringify(connectCommand));

            const timeout = setTimeout(() => {
                sock.close();
                resolve({ success: false, error: '发送命令超时（5秒）' });
            }, 5000);

            sock.send(message, this.configPort, deviceIp, (err) => {
                clearTimeout(timeout);
                sock.close();
                if (err) {
                    const errorMessage = `发送MQTT连接命令失败: ${err.message}`;
                    console.error('❌', errorMessage);
                    resolve({ success: false, error: errorMessage });
                } else {
                    console.log(`✅ MQTT连接命令已发送到设备 ${deviceIp}`);
                    resolve({ success: true });
                }
            });

            sock.on('error', (err) => {
                clearTimeout(timeout);
                console.error('UDP socket错误:', err);
                resolve({ success: false, error: `网络错误: ${err.message}` });
            });
        });
    }

    // 发送重启命令
    async sendRebootCommand(deviceIp: string): Promise<{ success: boolean; error?: string }> {
        return new Promise((resolve) => {
            const sock = dgram.createSocket('udp4');

            const rebootCommand = {
                type: 'reboot'
            };

            const message = Buffer.from(JSON.stringify(rebootCommand));

            const timeout = setTimeout(() => {
                sock.close();
                resolve({ success: false, error: '发送命令超时（5秒）' });
            }, 5000);

            sock.send(message, this.configPort, deviceIp, (err) => {
                clearTimeout(timeout);
                sock.close();
                if (err) {
                    const errorMessage = `发送重启命令失败: ${err.message}`;
                    console.error('❌', errorMessage);
                    resolve({ success: false, error: errorMessage });
                } else {
                    console.log(`✅ 重启命令已发送到设备 ${deviceIp}`);
                    resolve({ success: true });
                }
            });

            sock.on('error', (err) => {
                clearTimeout(timeout);
                console.error('UDP socket错误:', err);
                resolve({ success: false, error: `网络错误: ${err.message}` });
            });
        });
    }

    // 读取设备配置
    async readDeviceConfig(deviceIp: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const sock = dgram.createSocket('udp4');
            let closed = false;

            const closeSock = () => {
                if (!closed) {
                    sock.close();
                    closed = true;
                }
            };

            const msg = Buffer.from(JSON.stringify({ type: 'read_config' }));

            sock.send(msg, this.configPort, deviceIp, (err) => {
                if (err) {
                    closeSock();
                    return reject(err);
                }
            });

            sock.on('message', (msg, rinfo) => {
                try {
                    const payload = JSON.parse(msg.toString());
                    if (payload.type === 'config' && rinfo.address === deviceIp) {
                        closeSock();
                        resolve(payload);
                    }
                } catch (err) {
                    closeSock();
                    reject(err);
                }
            });

            const timer = setTimeout(() => {
                closeSock();
                reject(new Error('设备读取配置超时'));
            }, 3000);

            sock.on('error', (err) => {
                clearTimeout(timer);
                closeSock();
                reject(err);
            });
        });
    }

    // 私有方法
    private async startDiscoveryServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.discoveryServer = dgram.createSocket('udp4');

            this.discoveryServer.on('message', (msg, rinfo) => {
                this.handleDiscoveryMessage(msg, rinfo);
            });

            this.discoveryServer.on('error', (err) => {
                console.error('发现服务器错误:', err);
                this.emit('error', err);
            });

            this.discoveryServer.on('listening', () => {
                console.log(`✅ UDP发现服务器监听端口 ${this.discoveryPort}`);
                resolve();
            });

            this.discoveryServer.bind(this.discoveryPort, () => {
                const address = this.discoveryServer!.address();
                console.log(`📡 UDP发现服务已启动: ${address.address}:${address.port}`);
            });
        });
    }

    private async startConfigServer(): Promise<void> {
        return new Promise((resolve) => {
            this.configServer = dgram.createSocket('udp4');

            this.configServer.on('listening', () => {
                console.log(`✅ UDP配置服务器监听端口 ${this.configPort}`);
                resolve();
            });

            this.configServer.bind(this.configPort);
        });
    }

    private handleDiscoveryMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
        try {
            const payload = JSON.parse(msg.toString());

            if (payload.type === 'discover') {
                const id = payload.id || rinfo.address;
                const currentTime = Date.now();

                if (this.devices.has(id)) {
                    // 更新已有设备
                    const existingDevice = this.devices.get(id)!;
                    existingDevice.lastSeen = currentTime;

                    // 更新其他可能变化的信息
                    if (payload.runtime !== undefined) existingDevice.runtime = payload.runtime;
                    if (payload.RSSI !== undefined) existingDevice.RSSI = payload.RSSI;
                    if (payload.name) existingDevice.name = payload.name;
                    if (payload.firmware) existingDevice.firmware = payload.firmware;
                    if (payload.heart_interval) existingDevice.heart_interval = payload.heart_interval;

                    console.log(`[UPDATE] 更新设备 ${id} 的心跳时间`);
                } else {
                    // 新增设备
                    this.devices.set(id, {
                        name: payload.name || `设备-${id}`,
                        id,
                        mac: payload.mac || "未知",
                        ip: payload.ip || rinfo.address,
                        networkType: payload.networkType || "未知",
                        RSSI: payload.RSSI ?? null,
                        runtime: payload.runtime ?? 0,
                        firmware: payload.firmware || "未知",
                        heart_interval: payload.heart_interval || 5,
                        lastSeen: currentTime
                    });

                    console.log(`[DISCOVERY] 发现新设备: ${id} @ ${rinfo.address}`);
                    this.emit('device-discovered', this.devices.get(id));
                }

                // 通知前端更新设备列表
                this.notifyFrontend();
            }
        } catch (err) {
            console.warn('[WARNING] 解析UDP消息失败:', err);
        }
    }

    private startDeviceCleanup(): void {
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let changed = false;

            for (const [id, device] of this.devices.entries()) {
                if (device.lastSeen && typeof device.lastSeen === 'number') {
                    if (now - device.lastSeen > this.deviceTimeout) {
                        console.log(`[TIMEOUT] 设备离线: ${id} (${device.ip})`);
                        this.devices.delete(id);
                        changed = true;
                        this.emit('device-offline', id);
                    }
                } else {
                    console.warn(`设备 ${id} 的 lastSeen 格式错误，已移除`);
                    this.devices.delete(id);
                    changed = true;
                }
            }

            if (changed) {
                this.notifyFrontend();
            }
        }, 1000);
    }

    private notifyFrontend(): void {
        if (this.win && !this.win.isDestroyed()) {
            this.win.webContents.send(
                'udp-device-discovered',
                this.getDevices()
            );
        }
    }

    private getLocalIP(): string {
        // 这里应该实现获取本机IP的逻辑
        // 简单返回默认值，实际应该从网络接口获取
        return '192.168.1.2';
    }
}