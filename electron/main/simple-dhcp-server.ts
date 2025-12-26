// simple-dhcp-server.ts
import dgram from 'dgram';
import { EventEmitter } from 'events';
import os from 'os';

export interface SimpleLease {
    mac: string;
    ip: string;
    deviceId?: string;
    lastSeen: number;
}

export class SimpleDHCPServer extends EventEmitter {
    private server: dgram.Socket | null = null;
    private leases = new Map<string, SimpleLease>();
    private ipIndex = 0;

    // 配置
    private readonly SUBNET = '192.168.100.0';
    private readonly NETMASK = '255.255.255.0';
    private readonly GATEWAY: string;
    private readonly DNS = ['8.8.8.8', '8.8.4.4'];
    private readonly IP_POOL: string[];

    // 端口
    private readonly DHCP_PORT = 67;
    private readonly CLIENT_PORT = 68;

    constructor() {
        super();

        // 获取本机IP作为网关
        this.GATEWAY = this.getLocalIP();

        // 生成IP池（192.168.100.10 - 192.168.100.200）
        this.IP_POOL = this.generateIPPool('192.168.100.101', '192.168.100.200');

        console.log('🔧 简化DHCP服务器配置:');
        console.log(`   网关: ${this.GATEWAY}`);
        console.log(`   子网: ${this.SUBNET}/${this.NETMASK}`);
        console.log(`   IP池: ${this.IP_POOL.length} 个地址`);
    }

    // 启动服务器
    async start(): Promise<boolean> {
        try {
            this.server = dgram.createSocket('udp4');

            // 绑定到端口
            await new Promise<void>((resolve, reject) => {
                this.server!.bind(this.DHCP_PORT, '0.0.0.0', () => {
                    console.log(`✅ DHCP服务器已启动 (端口: ${this.DHCP_PORT})`);
                    resolve();
                });

                this.server!.on('error', (err) => {
                    console.error('❌ DHCP服务器错误:', err);
                    reject(err);
                });
            });

            // 设置消息处理器
            this.server.on('message', this.handleMessage.bind(this));

            // 启动租约清理
            this.startLeaseCleanup();

            this.emit('started');
            return true;

        } catch (error) {
            console.error('❌ 启动DHCP服务器失败:', error);

            // 尝试用户空间端口
            if (error instanceof Error && error.message.includes('EACCES')) {
                console.warn('⚠️ 需要管理员权限，尝试使用用户空间端口...');
                return this.startUserSpace();
            }

            return false;
        }
    }

    // 使用用户空间端口（无需管理员权限）
    private async startUserSpace(): Promise<boolean> {
        try {
            // 使用不同的端口（大于1024）
            const userPort = 1067;

            this.server = dgram.createSocket('udp4');

            await new Promise<void>((resolve, reject) => {
                this.server!.bind(userPort, '0.0.0.0', () => {
                    console.log(`✅ DHCP服务器已启动 (用户空间端口: ${userPort})`);
                    console.log('⚠️  注意: ESP32需要配置为使用非标准DHCP端口');
                    resolve();
                });

                this.server!.on('error', reject);
            });

            this.server.on('message', this.handleMessage.bind(this));
            this.startLeaseCleanup();

            return true;

        } catch (error) {
            console.error('❌ 用户空间DHCP服务器启动失败:', error);
            return false;
        }
    }

    // 处理DHCP消息
    private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
        try {
            // 简单的DHCP解析
            const mac = this.extractMAC(msg);
            if (!mac) return;

            console.log(`📨 收到DHCP请求来自 ${mac}`);

            // 检查是否有现有租约
            let lease = this.leases.get(mac);

            if (!lease) {
                // 分配新IP
                const ip = this.allocateIP(mac);
                if (!ip) {
                    console.error(`❌ IP池耗尽，无法为 ${mac} 分配IP`);
                    return;
                }

                lease = {
                    mac,
                    ip,
                    lastSeen: Date.now(),
                };

                this.leases.set(mac, lease);
                console.log(`✅ 分配IP ${ip} 给设备 ${mac}`);

                this.emit('device-registered', { mac, ip });
            } else {
                // 更新租约时间
                lease.lastSeen = Date.now();
                console.log(`🔄 更新设备 ${mac} 的租约`);
            }

            // 发送DHCP响应
            this.sendDHCPResponse(mac, lease.ip, rinfo);

        } catch (error) {
            console.error('处理DHCP消息时出错:', error);
        }
    }

    // 发送DHCP响应
    private sendDHCPResponse(mac: string, ip: string, rinfo: dgram.RemoteInfo): void {
        if (!this.server) return;

        // 构建简单的DHCP响应
        const response = this.buildSimpleResponse(mac, ip);

        // 发送响应
        this.server.send(response, this.CLIENT_PORT, rinfo.address, (err) => {
            if (err) {
                console.error('发送DHCP响应失败:', err);
            } else {
                console.log(`📤 发送DHCP响应到 ${rinfo.address}: ${mac} -> ${ip}`);
            }
        });
    }

    // 构建简单的DHCP响应
    private buildSimpleResponse(mac: string, ip: string): Buffer {
        const macBytes = mac.split(':').map(hex => parseInt(hex, 16));
        const ipBytes = ip.split('.').map(Number);
        const gatewayBytes = this.GATEWAY.split('.').map(Number);
        const maskBytes = this.NETMASK.split('.').map(Number);

        // 简单响应包
        const buffer = Buffer.alloc(300);

        // BOOTP header
        buffer[0] = 0x02; // 回复
        buffer[1] = 0x01; // 以太网
        buffer[2] = 0x06; // 硬件地址长度
        buffer[4] = 0x12; // 事务ID
        buffer[5] = 0x34;
        buffer[6] = 0x56;
        buffer[7] = 0x78;

        // 分配的IP
        for (let i = 0; i < 4; i++) {
            buffer[16 + i] = ipBytes[i];
        }

        // 服务器IP（网关）
        for (let i = 0; i < 4; i++) {
            buffer[20 + i] = gatewayBytes[i];
        }

        // 客户端MAC地址
        buffer[28] = 0x01; // 以太网
        buffer[29] = 0x06; // MAC地址长度
        for (let i = 0; i < 6; i++) {
            buffer[30 + i] = macBytes[i];
        }

        // DHCP选项
        let offset = 240;

        // Magic cookie
        buffer[offset++] = 99;
        buffer[offset++] = 130;
        buffer[offset++] = 83;
        buffer[offset++] = 99;

        // Message type: DHCPACK
        buffer[offset++] = 53;
        buffer[offset++] = 1;
        buffer[offset++] = 5;

        // Subnet mask
        buffer[offset++] = 1;
        buffer[offset++] = 4;
        for (let i = 0; i < 4; i++) {
            buffer[offset++] = maskBytes[i];
        }

        // Router (gateway)
        buffer[offset++] = 3;
        buffer[offset++] = 4;
        for (let i = 0; i < 4; i++) {
            buffer[offset++] = gatewayBytes[i];
        }

        // DNS
        buffer[offset++] = 6;
        buffer[offset++] = 8;
        for (const dns of this.DNS) {
            const dnsBytes = dns.split('.').map(Number);
            for (let i = 0; i < 4; i++) {
                buffer[offset++] = dnsBytes[i];
            }
        }

        // IP lease time (24小时)
        buffer[offset++] = 51;
        buffer[offset++] = 4;
        buffer.writeUInt32BE(86400, offset); // 24小时
        offset += 4;

        // Server identifier
        buffer[offset++] = 54;
        buffer[offset++] = 4;
        for (let i = 0; i < 4; i++) {
            buffer[offset++] = gatewayBytes[i];
        }

        // End option
        buffer[offset++] = 255;

        return buffer.slice(0, offset);
    }

    // 分配IP地址
    private allocateIP(mac: string): string | null {
        // 轮询分配IP
        for (let i = 0; i < this.IP_POOL.length; i++) {
            const ip = this.IP_POOL[this.ipIndex];
            this.ipIndex = (this.ipIndex + 1) % this.IP_POOL.length;

            // 检查IP是否已分配
            let isUsed = false;
            for (const lease of this.leases.values()) {
                if (lease.ip === ip) {
                    isUsed = true;
                    break;
                }
            }

            if (!isUsed) {
                return ip;
            }
        }

        return null;
    }

    // 启动租约清理
    private startLeaseCleanup(): void {
        setInterval(() => {
            const now = Date.now();
            const timeout = 24 * 60 * 60 * 1000; // 24小时

            for (const [mac, lease] of this.leases.entries()) {
                if (now - lease.lastSeen > timeout) {
                    this.leases.delete(mac);
                    console.log(`🔄 清理过期租约: ${mac} (${lease.ip})`);
                }
            }
        }, 60000); // 每分钟检查一次
    }

    // 获取所有租约
    getLeases(): SimpleLease[] {
        return Array.from(this.leases.values());
    }

    // 获取设备IP
    getDeviceIP(mac: string): string | null {
        const lease = this.leases.get(mac.toUpperCase());
        return lease ? lease.ip : null;
    }

    // 停止服务器
    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            console.log('DHCP服务器已停止');
        }
    }

    // 工具方法
    private extractMAC(buffer: Buffer): string | null {
        if (buffer.length < 30) return null;

        const macBytes = [];
        for (let i = 0; i < 6; i++) {
            macBytes.push(buffer[28 + i].toString(16).padStart(2, '0'));
        }

        return macBytes.join(':').toUpperCase();
    }

    private generateIPPool(start: string, end: string): string[] {
        const startNum = this.ipToNumber(start);
        const endNum = this.ipToNumber(end);
        const pool: string[] = [];

        for (let i = startNum; i <= endNum; i++) {
            pool.push(this.numberToIP(i));
        }

        return pool;
    }

    private ipToNumber(ip: string): number {
        const parts = ip.split('.').map(Number);
        return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
    }

    private numberToIP(num: number): string {
        return [
            (num >>> 24) & 0xFF,
            (num >>> 16) & 0xFF,
            (num >>> 8) & 0xFF,
            num & 0xFF,
        ].join('.');
    }

    private getLocalIP(): string {
        const interfaces = os.networkInterfaces();

        for (const [name, addrs] of Object.entries(interfaces)) {
            // 跳过虚拟接口
            if (name.includes('Virtual') || name.includes('vEthernet')) {
                continue;
            }

            for (const addr of addrs || []) {
                if (addr.family === 'IPv4' && !addr.internal) {
                    return addr.address;
                }
            }
        }

        return '192.168.100.1'; // 默认网关
    }
}