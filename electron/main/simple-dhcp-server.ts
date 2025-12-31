// simple-dhcp-server.ts
import dgram from 'dgram';
import { EventEmitter } from 'events';
import os from 'os';

export interface SimpleLease {
    mac: string;
    ip: string;
    deviceId?: string;
    lastSeen: number;
    xid?: string;
    transactionStart?: number;
    offerCount?: number;
}

export interface DHCPServerConfig {
    interfaceName?: string;
    interfaceIP?: string;
    gateway?: string;
    subnet?: string;
    netmask?: string;
    dns?: string[];
    ipPoolStart?: string;
    ipPoolEnd?: string;
    port?: number;
    leaseTime?: number;
}

export class SimpleDHCPServer extends EventEmitter {
    private server: dgram.Socket | null = null;
    private leases = new Map<string, SimpleLease>();
    private ipIndex = 0;
    private pendingTransactions = new Map<string, {
        ip: string;
        xid: string;
        timestamp: number;
        offerSent: boolean;
        retryCount: number;
    }>();

    // 配置
    private SUBNET: string;
    private NETMASK: string;
    private GATEWAY: string;
    private DNS: string[];
    private IP_POOL: string[];
    private LEASE_TIME: number;
    private PORT: number;

    // 网络接口
    private selectedInterface: string = '';
    private interfaceIP: string = '';
    private BROADCAST_ADDRESS = '255.255.255.255';
    private CLIENT_PORT = 68;

    // 统计
    private stats = {
        totalDiscover: 0,
        totalOffer: 0,
        totalRequest: 0,
        totalAck: 0,
        totalNak: 0,
        startTime: Date.now()
    };

    constructor(config?: DHCPServerConfig) {
        super();

        // 设置配置
        this.SUBNET = config?.subnet || '192.168.100.0';
        this.NETMASK = config?.netmask || '255.255.255.0';
        this.PORT = config?.port || 67;
        this.DNS = config?.dns || ['8.8.8.8', '8.8.4.4'];
        this.LEASE_TIME = config?.leaseTime || 7200; // 2小时

        // 网络接口配置
        if (config?.interfaceName && config?.interfaceIP) {
            this.selectedInterface = config.interfaceName;
            this.interfaceIP = config.interfaceIP;
            this.GATEWAY = config.gateway || config.interfaceIP;
            this.BROADCAST_ADDRESS = this.calculateBroadcast(this.interfaceIP, this.NETMASK);
        } else {
            this.autoSelectInterface();
        }

        // 生成IP池
        const gatewayParts = this.GATEWAY.split('.');
        const ipPoolStart = config?.ipPoolStart || `${gatewayParts[0]}.${gatewayParts[1]}.${gatewayParts[2]}.100`;
        const ipPoolEnd = config?.ipPoolEnd || `${gatewayParts[0]}.${gatewayParts[1]}.${gatewayParts[2]}.200`;
        this.IP_POOL = this.generateIPPool(ipPoolStart, ipPoolEnd);

        console.log('🔧 DHCP服务器配置:');
        console.log(`   接口: ${this.selectedInterface}`);
        console.log(`   服务器IP: ${this.interfaceIP}`);
        console.log(`   网关: ${this.GATEWAY}`);
        console.log(`   掩码: ${this.NETMASK}`);
        console.log(`   广播: ${this.BROADCAST_ADDRESS}`);
        console.log(`   端口: ${this.PORT}`);
        console.log(`   IP池: ${this.IP_POOL[0]} - ${this.IP_POOL[this.IP_POOL.length-1]} (${this.IP_POOL.length}个)`);
    }

    // 获取所有可用网卡 - 修复版本
    static getAvailableInterfaces(): Array<{
        name: string;
        ip: string;
        mac: string;
        internal: boolean;
        netmask?: string;
        broadcast?: string;
        family: string;
    }> {
        const interfaces = os.networkInterfaces();
        const result = [];

        for (const [name, addrs] of Object.entries(interfaces)) {
            for (const addr of addrs || []) {
                if (addr.family === 'IPv4') {
                    result.push({
                        name,
                        ip: addr.address,
                        mac: addr.mac || '00:00:00:00:00:00',
                        internal: addr.internal,
                        netmask: addr.netmask,
                        broadcast: this.calculateBroadcastForInterface(addr.address, addr.netmask),
                        family: addr.family
                    });
                }
            }
        }

        return result;
    }

    // 为接口计算广播地址
    private static calculateBroadcastForInterface(ip: string, netmask: string): string {
        const ipParts = ip.split('.').map(Number);
        const maskParts = netmask.split('.').map(Number);
        const broadcastParts = [];

        for (let i = 0; i < 4; i++) {
            broadcastParts.push((ipParts[i] & maskParts[i]) | (~maskParts[i] & 255));
        }

        return broadcastParts.join('.');
    }

    // 重新配置网卡 - 修复版本
    reconfigure(config: { interfaceName: string; interfaceIP: string; gateway?: string }): void {
        this.selectedInterface = config.interfaceName;
        this.interfaceIP = config.interfaceIP;
        this.GATEWAY = config.gateway || config.interfaceIP;
        this.BROADCAST_ADDRESS = this.calculateBroadcast(this.interfaceIP, this.NETMASK);

        console.log(`🔄 重新配置网卡: ${this.selectedInterface} (${this.interfaceIP})`);
        console.log(`   新网关: ${this.GATEWAY}`);
        console.log(`   新广播地址: ${this.BROADCAST_ADDRESS}`);

        // 重启服务器
        this.restart();
    }

    // 重启服务器 - 修复版本
    private restart(): void {
        if (this.server) {
            console.log('🔄 正在重启DHCP服务器...');
            this.stop();
            setTimeout(() => {
                this.start().catch(err => {
                    console.error('重启DHCP服务器失败:', err);
                    this.emit('restart-error', err);
                });
            }, 2000);
        }
    }

    // 计算广播地址
    private calculateBroadcast(ip: string, netmask: string): string {
        const ipParts = ip.split('.').map(Number);
        const maskParts = netmask.split('.').map(Number);
        const broadcastParts = [];

        for (let i = 0; i < 4; i++) {
            broadcastParts.push((ipParts[i] & maskParts[i]) | (~maskParts[i] & 255));
        }

        return broadcastParts.join('.');
    }

    private autoSelectInterface(): void {
        const interfaces = os.networkInterfaces();

        console.log('🔍 扫描网络接口:');
        for (const [name, addrs] of Object.entries(interfaces)) {
            console.log(`   ${name}:`);
            for (const addr of addrs || []) {
                if (addr.family === 'IPv4') {
                    const internalStr = addr.internal ? '内部' : '外部';
                    console.log(`     ${addr.address}/${addr.netmask} (${internalStr})`);

                    if (!addr.internal && !addr.address.startsWith('127.')) {
                        this.selectedInterface = name;
                        this.interfaceIP = addr.address;
                        this.GATEWAY = addr.address;
                        this.BROADCAST_ADDRESS = this.calculateBroadcast(addr.address, this.NETMASK);

                        console.log(`✅ 选择网卡: ${name} (${addr.address})`);
                        console.log(`   掩码: ${addr.netmask}, 广播: ${this.BROADCAST_ADDRESS}`);
                        return;
                    }
                }
            }
        }

        // 回退
        this.selectedInterface = 'eth0';
        this.interfaceIP = '192.168.100.1';
        this.GATEWAY = '192.168.100.1';
        this.BROADCAST_ADDRESS = '192.168.100.255';
        console.warn('⚠️  未找到合适网卡，使用默认配置');
    }

    async start(): Promise<boolean> {
        try {
            if (this.server) {
                console.log('🔄 DHCP服务器已经在运行');
                return true;
            }

            this.server = dgram.createSocket('udp4');

            // 绑定前设置重用地址
            this.server.on('listening', () => {
                try {
                    this.server!.setBroadcast(true);
                    // 设置重用地址，避免"地址已使用"错误
                    this.server!.setOption(dgram.SocketOptions.SO_REUSEADDR, 1);

                    const address = this.server!.address();
                    console.log(`✅ DHCP服务器监听在 ${address.address}:${address.port}`);
                    console.log(`   广播功能: 已启用`);

                    // 尝试绑定到特定接口（Linux）
                    if (process.platform === 'linux' && this.selectedInterface) {
                        try {
                            const SO_BINDTODEVICE = 25;
                            this.server!.setOption(SO_BINDTODEVICE, this.selectedInterface);
                            console.log(`   绑定到接口: ${this.selectedInterface}`);
                        } catch (err: any) {
                            console.log(`   ⚠️ 无法绑定到接口: ${err.message}`);
                        }
                    }
                } catch (err: any) {
                    console.error('❌ 设置socket选项失败:', err);
                }
            });

            // 绑定
            await new Promise<void>((resolve, reject) => {
                this.server!.bind(this.PORT, '0.0.0.0', () => {
                    resolve();
                });

                this.server!.on('error', (err: any) => {
                    console.error('❌ 绑定失败:', err);
                    if (err.code === 'EACCES' && this.PORT < 1024) {
                        console.error('   ⚠️ 端口67需要root权限！');
                        console.error('   请使用: sudo node ... 或设置端口>1024');
                    }
                    reject(err);
                });
            });

            // 消息处理
            this.server.on('message', this.handleMessage.bind(this));

            // 清理任务
            this.startCleanupTasks();

            this.emit('started');
            this.stats.startTime = Date.now();

            console.log('🎉 DHCP服务器启动完成');
            console.log(`   配置摘要:`);
            console.log(`     - 接口: ${this.selectedInterface}`);
            console.log(`     - 服务器IP: ${this.interfaceIP}`);
            console.log(`     - 网关: ${this.GATEWAY}`);
            console.log(`     - 广播: ${this.BROADCAST_ADDRESS}`);
            console.log(`     - 掩码: ${this.NETMASK}`);
            console.log(`     - 端口: ${this.PORT}`);

            return true;

        } catch (error: any) {
            console.error('❌ 启动失败:', error);
            this.server = null;
            return false;
        }
    }

    private startCleanupTasks(): void {
        // 清理过期事务
        setInterval(() => {
            const now = Date.now();
            for (const [mac, trans] of this.pendingTransactions.entries()) {
                // 30秒超时
                if (now - trans.timestamp > 30000) {
                    this.pendingTransactions.delete(mac);
                    console.log(`🗑️  清理超时事务: ${mac}`);
                }
            }
        }, 10000);

        // 清理过期租约
        setInterval(() => {
            const now = Date.now();
            for (const [mac, lease] of this.leases.entries()) {
                if (now - lease.lastSeen > this.LEASE_TIME * 1000) {
                    this.leases.delete(mac);
                    console.log(`🗑️  清理过期租约: ${mac} (${lease.ip})`);
                    this.emit('lease-expired', { mac, ip: lease.ip });
                }
            }
        }, 60000);
    }

    private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
        try {
            // 提取基本信息
            if (msg.length < 240) {
                console.log(`❓ 消息太短: ${msg.length}字节`);
                return;
            }

            const xid = msg.slice(4, 8);
            const xidHex = xid.toString('hex').toUpperCase();
            const mac = this.extractMAC(msg);

            if (!mac) {
                console.log('❓ 无法提取MAC地址');
                return;
            }

            // 解析消息类型
            const dhcpType = this.extractDHCPType(msg);
            const typeName = this.getDHCPTypeName(dhcpType);

            this.stats.totalDiscover += (dhcpType === 1 ? 1 : 0);
            this.stats.totalRequest += (dhcpType === 3 ? 1 : 0);

            console.log(`📨 ${typeName} from ${mac} [XID:0x${xidHex}]`);

            switch (dhcpType) {
                case 1: // DISCOVER
                    this.handleDiscover(mac, xid, xidHex, rinfo);
                    break;
                case 3: // REQUEST
                    this.handleRequest(mac, xid, xidHex, rinfo);
                    break;
                case 8: // INFORM
                    this.handleInform(mac, xid, rinfo);
                    break;
            }

        } catch (error) {
            console.error('💥 处理消息时出错:', error);
        }
    }


    private extractRequestedIP(buffer: Buffer): string | null {
        const cookie = Buffer.from([0x63, 0x82, 0x53, 0x63]);
        const idx = buffer.indexOf(cookie);
        if (idx === -1) return null;

        let offset = idx + 4;
        while (offset < buffer.length && buffer[offset] !== 0xFF) {
            const option = buffer[offset];
            const len = buffer[offset + 1];

            if (option === 50 && len === 4) {
                return [
                    buffer[offset + 2],
                    buffer[offset + 3],
                    buffer[offset + 4],
                    buffer[offset + 5],
                ].join('.');
            }
            offset += 2 + len;
        }
        return null;
    }


    private handleDiscover(mac: string, xid: Buffer, xidHex: string, rinfo: dgram.RemoteInfo): void {
        let lease = this.leases.get(mac);
        let ip: string;

        if (lease) {
            ip = lease.ip;
            lease.lastSeen = Date.now();
            console.log(`🔄 重用IP: ${ip}`);
        } else {
            ip = this.allocateIP(mac);
            if (!ip) {
                console.error(`❌ 无法分配IP给 ${mac}`);
                return;
            }

            lease = {
                mac,
                ip,
                lastSeen: Date.now(),
                xid: xidHex,
                transactionStart: Date.now(),
                offerCount: 0
            };
            // 不在 DISCOVER 阶段写入 leases
            console.log(`✅ 分配新IP: ${ip}`);
        }

        // 记录待处理事务
        this.pendingTransactions.set(mac, {
            ip,
            xid: xidHex,
            timestamp: Date.now(),
            offerSent: false,
            retryCount: 0
        });

        // 构建 OFFER
        const offerPacket = this.buildDHCPPacket(mac, ip, xid, 2, xidHex);

        // 发送广播
        this.sendToMultipleTargets(offerPacket, `OFFER to ${mac}`);
    }


    private sendOfferWithRetry(mac: string, ip: string, xid: Buffer, xidHex: string, rinfo: dgram.RemoteInfo): void {
        const transaction = this.pendingTransactions.get(mac);
        if (!transaction) return;

        if (transaction.retryCount >= 3) {
            console.error(`❌ ${mac} 重试次数超过限制`);
            this.pendingTransactions.delete(mac);
            return;
        }

        const offerPacket = this.buildDHCPPacket(mac, ip, xid, 2, xidHex);
        this.sendToMultipleTargets(offerPacket, rinfo, `OFFER to ${mac}`);

        transaction.offerSent = true;
        transaction.retryCount++;
        transaction.timestamp = Date.now();

        this.stats.totalOffer++;
        console.log(`📤 发送OFFER: ${mac} -> ${ip} (重试: ${transaction.retryCount}/3)`);
    }


    private handleRequest(mac: string, xid: Buffer, xidHex: string, rinfo: dgram.RemoteInfo): void {
        const requestedIP = this.extractRequestedIP(rinfo.msg ?? Buffer.alloc(0));
        const pending = this.pendingTransactions.get(mac);

        if (!pending || requestedIP !== pending.ip) {
            console.warn(`⚠️ REQUEST 无效或不匹配: ${mac}`);
            this.sendNak(mac, xid, rinfo);
            this.pendingTransactions.delete(mac);
            return;
        }

        // REQUEST 验证成功 → 正式写 lease
        this.leases.set(mac, {
            mac,
            ip: pending.ip,
            lastSeen: Date.now()
        });

        this.pendingTransactions.delete(mac);
        this.sendAck(mac, pending.ip, xid, rinfo);
        console.log(`✅ DHCP 完成: ${mac} -> ${pending.ip}`);
    }


    private sendAck(mac: string, ip: string, xid: Buffer, rinfo: dgram.RemoteInfo): void {
        const ackPacket = this.buildDHCPPacket(mac, ip, xid, 5, xid.toString('hex'));
        this.sendToMultipleTargets(ackPacket, rinfo, `ACK to ${mac}`);
        this.stats.totalAck++;
    }

    private sendNak(mac: string, xid: Buffer, rinfo: dgram.RemoteInfo): void {
        const nakPacket = this.buildDHCPPacket(mac, '0.0.0.0', xid, 6, xid.toString('hex'));
        this.sendToMultipleTargets(nakPacket, rinfo, `NAK to ${mac}`);
        this.stats.totalNak++;
    }

    private handleInform(mac: string, xid: Buffer, rinfo: dgram.RemoteInfo): void {
        const lease = this.leases.get(mac);
        const ip = lease ? lease.ip : '0.0.0.0';
        this.sendAck(mac, ip, xid, rinfo);
        console.log(`ℹ️  响应INFORM: ${mac}`);
    }

// ====== sendToMultipleTargets ======
    private sendToMultipleTargets(packet: Buffer, description: string): void {
        if (!this.server) return;

        this.server.send(packet, this.CLIENT_PORT, this.BROADCAST_ADDRESS, (err) => {
            if (err) {
                console.error(`❌ ${description} 发送失败 (广播):`, err.message);
            } else {
                console.log(`✅ ${description} 发送成功 (广播)`);
            }
        });
    }


    // ====== buildDHCPPacket ======
    private buildDHCPPacket(mac: string, ip: string, xid: Buffer, messageType: number, xidHex: string): Buffer {
        const macBytes = mac.split(':').map(hex => parseInt(hex, 16));
        const ipBytes = ip.split('.').map(Number);
        const serverBytes = this.interfaceIP.split('.').map(Number);
        const maskBytes = this.NETMASK.split('.').map(Number);
        const dns1 = this.DNS[0] ? this.DNS[0].split('.').map(Number) : [8, 8, 8, 8];
        const dns2 = this.DNS[1] ? this.DNS[1].split('.').map(Number) : [8, 8, 4, 4];

        const buffer = Buffer.alloc(300);
        buffer.fill(0);

        // BOOTP头
        buffer[0] = 0x02; // BOOTREPLY
        buffer[1] = 0x01; // Ethernet
        buffer[2] = 6;    // HW addr len
        buffer[3] = 0;    // Hops
        xid.copy(buffer, 4);
        buffer.writeUInt16BE(0, 8);      // secs
        buffer.writeUInt16BE(0x8000, 10); // flags: 广播

        // ciaddr: 0
        ipBytes.forEach((b, i) => buffer[16 + i] = b);   // yiaddr: 客户端IP
        serverBytes.forEach((b, i) => buffer[20 + i] = b); // siaddr: DHCP服务器IP
        // giaddr: 0
        for (let i = 0; i < 6; i++) buffer[28 + i] = macBytes[i]; // chaddr

        // DHCP选项
        let offset = 240;
        buffer[offset++] = 0x63; buffer[offset++] = 0x82; buffer[offset++] = 0x53; buffer[offset++] = 0x63; // Magic cookie

        buffer[offset++] = 53; buffer[offset++] = 1; buffer[offset++] = messageType; // DHCP Message Type
        buffer[offset++] = 54; buffer[offset++] = 4; serverBytes.forEach(b => buffer[offset++] = b); // Server Identifier
        buffer[offset++] = 51; buffer[offset++] = 4; buffer.writeUInt32BE(this.LEASE_TIME, offset); offset += 4; // Lease time
        buffer[offset++] = 1; buffer[offset++] = 4; maskBytes.forEach(b => buffer[offset++] = b); // Subnet Mask
        buffer[offset++] = 3; buffer[offset++] = 4; serverBytes.forEach(b => buffer[offset++] = b); // Router
        buffer[offset++] = 6; buffer[offset++] = 8; dns1.forEach(b => buffer[offset++] = b); dns2.forEach(b => buffer[offset++] = b); // DNS
        buffer[offset++] = 28; buffer[offset++] = 4; const broadcastBytes = this.calculateBroadcastBytes(this.interfaceIP, this.NETMASK); broadcastBytes.forEach(b => buffer[offset++] = b); // Broadcast
        buffer[offset++] = 255; // End

        console.log(`📦 构建包: ${this.getDHCPTypeName(messageType)} for ${mac} (IP: ${ip})`);
        return buffer.slice(0, offset);
    }


    private calculateBroadcastBytes(gateway: string, netmask: string): number[] {
        const gatewayParts = gateway.split('.').map(Number);
        const maskParts = netmask.split('.').map(Number);
        const broadcastParts = [];

        for (let i = 0; i < 4; i++) {
            broadcastParts.push((gatewayParts[i] & maskParts[i]) | (~maskParts[i] & 255));
        }

        return broadcastParts;
    }

    private allocateIP(mac: string): string | null {
        // 先检查是否已有IP
        const existing = this.leases.get(mac);
        if (existing) return existing.ip;

        // 轮询分配
        for (let i = 0; i < this.IP_POOL.length; i++) {
            const ip = this.IP_POOL[this.ipIndex];
            this.ipIndex = (this.ipIndex + 1) % this.IP_POOL.length;

            // 检查是否已使用
            let used = false;
            for (const lease of this.leases.values()) {
                if (lease.ip === ip) {
                    used = true;
                    break;
                }
            }

            if (!used) return ip;
        }

        return null;
    }

    private extractMAC(buffer: Buffer): string | null {
        if (buffer.length < 34) return null;

        const macBytes = [];
        for (let i = 0; i < 6; i++) {
            macBytes.push(buffer[28 + i].toString(16).padStart(2, '0'));
        }

        return macBytes.join(':').toUpperCase();
    }

    private extractDHCPType(buffer: Buffer): number {
        const magicCookie = Buffer.from([0x63, 0x82, 0x53, 0x63]);
        const cookieIndex = buffer.indexOf(magicCookie);

        if (cookieIndex === -1) return 1;

        let offset = cookieIndex + 4;
        while (offset < buffer.length && buffer[offset] !== 0xFF) {
            if (buffer[offset] === 53) {
                return buffer[offset + 2];
            }
            offset += 2 + buffer[offset + 1];
        }

        return 1;
    }

    private getDHCPTypeName(type: number): string {
        const types: {[key: number]: string} = {
            1: 'DISCOVER', 2: 'OFFER', 3: 'REQUEST',
            4: 'DECLINE', 5: 'ACK', 6: 'NAK',
            7: 'RELEASE', 8: 'INFORM'
        };
        return types[type] || `UNKNOWN(${type})`;
    }

    // === 公共方法 ===

    stop(): void {
        if (this.server) {
            this.server.close();
            this.server = null;
            console.log('🛑 DHCP服务器已停止');
            this.emit('stopped');
        }
    }

    getLeases(): SimpleLease[] {
        return Array.from(this.leases.values());
    }

    getDeviceIP(mac: string): string | null {
        const lease = this.leases.get(mac.toUpperCase());
        return lease ? lease.ip : null;
    }

    getStatus() {
        const pendingCount = this.pendingTransactions.size;
        const activeLeases = this.leases.size;

        return {
            running: !!this.server,
            interface: this.selectedInterface,
            ip: this.interfaceIP,
            gateway: this.GATEWAY,
            netmask: this.NETMASK,
            broadcast: this.BROADCAST_ADDRESS,
            port: this.PORT,
            leases: this.getLeases(),
            pendingTransactions: pendingCount,
            activeLeases,
            availableIPs: this.getAvailableIPCount(),
            totalIPs: this.IP_POOL.length,
            stats: { ...this.stats, uptime: Date.now() - this.stats.startTime }
        };
    }

    getAvailableIPCount(): number {
        const usedIPs = new Set();
        for (const lease of this.leases.values()) {
            usedIPs.add(lease.ip);
        }
        return this.IP_POOL.length - usedIPs.size;
    }

    // 获取网络接口配置信息
    getInterfaceInfo() {
        return {
            name: this.selectedInterface,
            ip: this.interfaceIP,
            gateway: this.GATEWAY,
            netmask: this.NETMASK,
            broadcast: this.BROADCAST_ADDRESS,
            subnet: this.SUBNET
        };
    }

    // 获取DHCP配置信息
    getConfigInfo() {
        return {
            subnet: this.SUBNET,
            netmask: this.NETMASK,
            gateway: this.GATEWAY,
            dns: this.DNS,
            ipPoolStart: this.IP_POOL[0],
            ipPoolEnd: this.IP_POOL[this.IP_POOL.length - 1],
            port: this.PORT,
            leaseTime: this.LEASE_TIME
        };
    }

    // 获取待处理事务
    getPendingTransactions() {
        const pending = [];
        for (const [mac, trans] of this.pendingTransactions.entries()) {
            pending.push({
                mac,
                ip: trans.ip,
                xid: trans.xid,
                timestamp: trans.timestamp,
                retryCount: trans.retryCount
            });
        }
        return pending;
    }

    // 强制释放IP地址
    releaseIP(mac: string): boolean {
        const lease = this.leases.get(mac);
        if (lease) {
            this.leases.delete(mac);
            this.pendingTransactions.delete(mac);
            console.log(`🗑️  强制释放IP: ${mac} -> ${lease.ip}`);
            this.emit('ip-released', { mac, ip: lease.ip });
            return true;
        }
        return false;
    }

    // 手动分配IP地址
    assignIP(mac: string, ip: string): boolean {
        // 验证IP格式
        const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        if (!ipRegex.test(ip)) {
            console.error(`❌ 无效的IP地址: ${ip}`);
            return false;
        }

        // 检查IP是否在池中
        const ipInPool = this.IP_POOL.includes(ip);
        if (!ipInPool) {
            console.warn(`⚠️  IP ${ip} 不在IP池中，但继续分配`);
        }

        // 检查IP是否已被使用
        for (const lease of this.leases.values()) {
            if (lease.ip === ip && lease.mac !== mac) {
                console.error(`❌ IP ${ip} 已被 ${lease.mac} 使用`);
                return false;
            }
        }

        // 创建或更新租约
        const lease = this.leases.get(mac) || {
            mac,
            ip,
            lastSeen: Date.now()
        };

        lease.ip = ip;
        lease.lastSeen = Date.now();
        this.leases.set(mac, lease);


        console.log(`✅ 手动分配IP: ${mac} -> ${ip}`);
        this.emit('ip-assigned', { mac, ip, manual: true });

        return true;
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
        return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
    }

    private numberToIP(num: number): string {
        return [
            (num >>> 24) & 0xFF,
            (num >>> 16) & 0xFF,
            (num >>> 8) & 0xFF,
            num & 0xFF
        ].join('.');
    }

    // 验证网络配置
    validateNetworkConfig(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // 验证IP地址格式
        const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

        if (!ipRegex.test(this.interfaceIP)) {
            errors.push(`服务器IP地址格式错误: ${this.interfaceIP}`);
        }

        if (!ipRegex.test(this.GATEWAY)) {
            errors.push(`网关地址格式错误: ${this.GATEWAY}`);
        }

        if (!ipRegex.test(this.NETMASK)) {
            errors.push(`子网掩码格式错误: ${this.NETMASK}`);
        }

        // 验证IP池
        if (this.IP_POOL.length === 0) {
            errors.push('IP池为空');
        }

        // 验证端口
        if (this.PORT < 1 || this.PORT > 65535) {
            errors.push(`端口号无效: ${this.PORT}`);
        }

        // 验证租期
        if (this.LEASE_TIME < 60) {
            errors.push(`租期时间太短: ${this.LEASE_TIME}秒`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}

export default SimpleDHCPServer;