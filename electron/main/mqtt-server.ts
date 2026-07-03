import { createServer, Server } from 'net';
import os from 'os';
import { EventEmitter } from 'events';

interface MQTTClientInfo {
    id: string;
    ip: string;
    connectedAt: Date;
    subscriptions: string[];
}

interface MQTTServerOptions {
    tcpPort?: number;
}

interface PublishOptions {
    qos?: number;
    retain?: boolean;
}

class MQTTServer extends EventEmitter {
    private broker: any = null;
    private tcpServer: Server | null = null;
    private isRunning: boolean = false;
    private clients: Map<string, MQTTClientInfo> = new Map();
    private tcpPort: number;

    constructor(options: MQTTServerOptions = {}) {
        super();
        this.tcpPort = options.tcpPort || 51883;
        this.initializeBroker();
    }

    private async initializeBroker(): Promise<void> {
        try {
            const aedesModule: any = await import('aedes');
            this.broker = aedesModule.default ? aedesModule.default() : aedesModule();
            this.setupBrokerEvents();
            console.log('✅ MQTT Broker 初始化成功');
        } catch (error) {
            console.error('❌ 初始化 MQTT Broker 失败:', error);
            throw error;
        }
    }

    private setupBrokerEvents(): void {
        if (!this.broker) return;

        this.broker.on('client', (client: any) => {
            const clientInfo: MQTTClientInfo = {
                id: client.id,
                ip: this.getClientIP(client),
                connectedAt: new Date(),
                subscriptions: []
            };

            this.clients.set(client.id, clientInfo);
            console.log(`🔗 MQTT客户端连接: ${client.id} (${clientInfo.ip})`);
            this.emit('clientConnected', clientInfo);
        });

        this.broker.on('clientDisconnect', (client: any) => {
            const clientInfo = this.clients.get(client.id);
            if (clientInfo) {
                console.log(`🔌 MQTT客户端断开: ${client.id}`);
                this.clients.delete(client.id);
                this.emit('clientDisconnected', clientInfo);
            }
        });

        this.broker.on('subscribe', (subscriptions: any[], client: any) => {
            const clientInfo = this.clients.get(client.id);
            if (clientInfo) {
                subscriptions.forEach(sub => {
                    if (!clientInfo.subscriptions.includes(sub.topic)) {
                        clientInfo.subscriptions.push(sub.topic);
                    }
                });
                console.log(`📝 客户端 ${client.id} 订阅主题:`, subscriptions.map(s => s.topic));
                this.emit('clientSubscribed', { client: clientInfo, subscriptions });
            }
        });

        this.broker.on('unsubscribe', (unsubscriptions: string[], client: any) => {
            const clientInfo = this.clients.get(client.id);
            if (clientInfo) {
                unsubscriptions.forEach(topic => {
                    const index = clientInfo.subscriptions.indexOf(topic);
                    if (index > -1) {
                        clientInfo.subscriptions.splice(index, 1);
                    }
                });
                console.log(`📝 客户端 ${client.id} 取消订阅:`, unsubscriptions);
                this.emit('clientUnsubscribed', { client: clientInfo, unsubscriptions });
            }
        });

        this.broker.on('publish', (packet: any, client: any) => {
            try {
                const payloadStr = packet.payload.toString();

                // 验证 topic 是字符串
                if (typeof packet.topic !== 'string') {
                    console.error('❌ 收到无效的 topic 类型:', typeof packet.topic, packet.topic);
                    return;
                }

                if (client) {
                    const clientInfo = this.clients.get(client.id);
                    console.log(`📨 收到来自 ${client.id} 的消息: ${packet.topic}`);
                    console.log(payloadStr);
                    this.emit('messagePublished', {
                        client: clientInfo,
                        topic: packet.topic,
                        payload: payloadStr,
                        qos: packet.qos,
                        retain: packet.retain
                    });
                }
            } catch (error) {
                console.error('❌ 处理发布消息时出错:', error);
            }
        });

        this.broker.on('error', (error: Error) => {
            console.error('❌ MQTT Broker 错误:', error);
            this.emit('error', error);
        });
    }

    private getClientIP(client: any): string {
        try {
            return client.conn?.remoteAddress || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    async start(): Promise<{
        success: boolean;
        tcpPort?: number;
        addresses?: string[];
        error?: string;
    }> {
        return new Promise(async (resolve) => {
            try {
                if (this.isRunning) {
                    resolve({ success: false, error: 'MQTT服务器已经在运行' });
                    return;
                }

                if (!this.broker) {
                    await this.initializeBroker();
                }

                this.tcpServer = createServer((socket) => {
                    if (this.broker) {
                        this.broker.handle(socket);
                    }
                });

                this.tcpServer.listen(this.tcpPort, '0.0.0.0', () => {
                    this.isRunning = true;
                    const addresses = this.getNetworkAddresses();

                    console.log('🚀 MQTT TCP服务器已启动!');
                    console.log(`📍 TCP端口: ${this.tcpPort}`);
                    console.log('🌐 局域网访问地址:');
                    addresses.forEach(addr => {
                        console.log(`   ${addr}:${this.tcpPort}`);
                    });
                    console.log('📡 等待设备连接...');

                    this.emit('started', {
                        tcpPort: this.tcpPort,
                        addresses
                    });

                    resolve({
                        success: true,
                        tcpPort: this.tcpPort,
                        addresses
                    });
                });

                this.tcpServer.on('error', (error: Error) => {
                    resolve({
                        success: false,
                        error: `TCP端口 ${this.tcpPort} 被占用: ${error.message}`
                    });
                });

            } catch (error: any) {
                resolve({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    stop(): boolean {
        if (!this.isRunning) {
            return false;
        }

        try {
            if (this.tcpServer) {
                this.tcpServer.close();
                this.tcpServer = null;
            }

            this.clients.forEach((clientInfo, clientId) => {
                const client = this.broker?.clients[clientId];
                if (client) {
                    try {
                        client.end();
                    } catch (error) {
                        console.error(`断开客户端 ${clientId} 时出错:`, error);
                    }
                }
            });
            this.clients.clear();

            this.isRunning = false;
            console.log('🛑 MQTT服务器已停止');
            this.emit('stopped');
            return true;

        } catch (error) {
            console.error('停止MQTT服务器时出错:', error);
            return false;
        }
    }

    publish(topic: string, message: any, options: PublishOptions = {}): boolean {
        if (!this.isRunning || !this.broker) {
            console.error('❌ MQTT服务器未运行，无法发布消息');
            return false;
        }

        try {
            // 双重验证 - 确保 topic 是字符串
            if (typeof topic !== 'string') {
                console.error('❌ MQTTServer: topic 不是字符串, 收到:', typeof topic, topic);
                return false;
            }

            // 修剪 topic
            const safeTopic = topic.trim();
            if (!safeTopic) {
                console.error('❌ MQTTServer: topic 为空');
                return false;
            }

            // 处理消息内容
            let payload: string;
            if (typeof message === 'string') {
                payload = message;
            } else if (typeof message === 'object') {
                try {
                    payload = JSON.stringify(message);
                } catch (e) {
                    payload = String(message);
                }
            } else {
                payload = String(message);
            }

            console.log(`📤 MQTTServer 发布消息: ${safeTopic}`, payload.substring(0, 100) + (payload.length > 100 ? '...' : ''));

            // 发布消息
            this.broker.publish({
                topic: safeTopic,
                payload: payload,
                qos: options.qos || 0,
                retain: options.retain || false
            }, (error) => {
                if (error) {
                    console.error(`❌ 发布消息到主题 ${safeTopic} 失败:`, error);
                } else {
                    console.log(`✅ 消息发布成功: ${safeTopic}`);
                }
            });

            return true;

        } catch (error) {
            console.error('💥 MQTTServer 发布消息时出错:', error);
            return false;
        }
    }

    sendConfigToDevice(deviceId: string, config: any): boolean {
        // 确保 deviceId 是字符串
        const safeDeviceId = String(deviceId || '').trim();
        if (!safeDeviceId) {
            console.error('❌ sendConfigToDevice: deviceId 为空');
            return false;
        }

        const topic = `config/${safeDeviceId}/set`;
        console.log(`📤 发送配置到设备 ${safeDeviceId}, 主题: ${topic}`);
        return this.publish(topic, config, { qos: 1 });
    }

    requestDeviceConfig(deviceId: string): boolean {
        // 确保 deviceId 是字符串
        const safeDeviceId = String(deviceId || '').trim();
        if (!safeDeviceId) {
            console.error('❌ requestDeviceConfig: deviceId 为空');
            return false;
        }

        const topic = `config/${safeDeviceId}/get`;
        console.log(`📤 请求设备配置 ${safeDeviceId}, 主题: ${topic}`);
        return this.publish(topic, {
            timestamp: Date.now(),
            type: 'config_request'
        }, { qos: 1 });
    }

    getStatus() {
        const addresses = this.isRunning ? this.getNetworkAddresses() : [];

        return {
            isRunning: this.isRunning,
            tcpPort: this.tcpPort,
            addresses: addresses,
            connectedClients: Array.from(this.clients.values()),
            clientCount: this.clients.size
        };
    }

    getConnectedClients(): MQTTClientInfo[] {
        return Array.from(this.clients.values());
    }

    getClient(clientId: string): MQTTClientInfo | undefined {
        return this.clients.get(clientId);
    }

    isClientConnected(clientId: string): boolean {
        return this.clients.has(clientId);
    }

    // 等待设备OTA升级进度消息
    // 监听 /dev/ota/{deviceId} 主题，直到 status=completed 或 error 或超时
    async waitForOtaProgress(
        deviceId: string,
        timeoutMs: number = 120000
    ): Promise<{
        success: boolean;
        status: string;
        progress: number;
        error?: string;
    }> {
        return new Promise((resolve) => {
            const topic = `/dev/ota/${deviceId}`;
            let settled = false;

            const handler = (packet: any, client: any) => {
                if (settled || !client) return; // 只监听设备端发布的消息
                if (packet.topic !== topic) return;

                try {
                    const payloadStr = packet.payload.toString();
                    const payload = JSON.parse(payloadStr);
                    const { status, progress } = payload;

                    console.log(`📥 [OTA进度] deviceId=${deviceId}, status=${status}, progress=${progress}`);

                    if (status === 'completed' || status === 'success') {
                        settled = true;
                        cleanup();
                        resolve({ success: true, status, progress: progress ?? 100 });
                    } else if (status === 'error' || status === 'failed') {
                        settled = true;
                        cleanup();
                        resolve({
                            success: false,
                            status,
                            progress: progress ?? 0,
                            error: payload.error || payload.message || '设备上报升级失败'
                        });
                    }
                } catch {
                    // 忽略无法解析的消息
                }
            };

            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                console.warn(`⏰ [OTA进度] deviceId=${deviceId} 等待超时 (${timeoutMs}ms)`);
                resolve({
                    success: false,
                    status: 'timeout',
                    progress: 0,
                    error: `等待设备升级结果超时 (${timeoutMs / 1000}秒)`
                });
            }, timeoutMs);

            const cleanup = () => {
                clearTimeout(timer);
                this.broker?.removeListener('publish', handler);
            };

            this.broker?.on('publish', handler);
            console.log(`👂 [OTA] 开始监听设备升级进度: ${topic}`);
        });
    }

    private getNetworkAddresses(): string[] {
        const networkInterfaces = os.networkInterfaces();
        const addresses: string[] = [];

        for (const interfaceName of Object.keys(networkInterfaces)) {
            const interfaces = networkInterfaces[interfaceName];
            if (interfaces) {
                for (const netInterface of interfaces) {
                    if (netInterface.family === 'IPv4' && !netInterface.internal) {
                        addresses.push(netInterface.address);
                    }
                }
            }
        }

        return addresses;
    }

    async restart(): Promise<{ success: boolean; error?: string }> {
        this.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
        const result = await this.start();
        return {
            success: result.success,
            error: result.error
        };
    }
}

export default MQTTServer;