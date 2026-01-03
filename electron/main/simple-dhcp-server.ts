// simple-dhcp-server.ts
import dhcp, {createServer, Server} from 'dhcp';
import {EventEmitter} from 'events';
import os from 'os';

export interface SimpleLease {
    mac: string;
    ip: string;
    lastSeen: number;
    leaseStart?: number;
    leaseEnd?: number;
    hostname?: string;
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
    domain?: string;
}

export class SimpleDHCPServer extends EventEmitter {
    private dhcpServer: Server | null = null;
    private leases = new Map<string, SimpleLease>();
    private ipIndex = 0;
    private pendingTransactions = new Map<string, {
        ip: string;
        xid: string;
        timestamp: number;
        state: 'offer' | 'request';
    }>();

    private SUBNET: string;
    private NETMASK: string;
    private GATEWAY: string;
    private DNS: string[];
    private IP_POOL: string[];
    private LEASE_TIME: number;
    private PORT: number;
    private selectedInterface: string = '';
    private interfaceIP: string = '';
    private BROADCAST_ADDRESS = '255.255.255.255';
    private CLIENT_PORT = 68;

    private isRunning: boolean = false;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(config?: DHCPServerConfig) {
        super();

        // 设置配置
        this.SUBNET = config?.subnet || '192.168.100.0';
        this.NETMASK = config?.netmask || '255.255.255.0';
        this.PORT = config?.port || 67;
        this.DNS = config?.dns || ['8.8.8.8', '8.8.4.4'];
        this.LEASE_TIME = config?.leaseTime || 7200;

        // 网络接口配置
        if (config?.interfaceName && config?.interfaceIP) {
            this.selectedInterface = config.interfaceName;
            this.interfaceIP = config.interfaceIP;
            this.GATEWAY = config.gateway || config.interfaceIP;
            this.BROADCAST_ADDRESS = this.calculateBroadcast(this.interfaceIP, this.NETMASK);
        } else {
            const result = this.autoSelectInterface();
            this.selectedInterface = result.name;
            this.interfaceIP = result.ip;
            this.GATEWAY = config?.gateway || result.ip;
            this.BROADCAST_ADDRESS = result.broadcast;
        }

        // 生成IP池
        const gatewayParts = this.GATEWAY.split('.');
        const ipPoolStart = config?.ipPoolStart || `${gatewayParts[0]}.${gatewayParts[1]}.${gatewayParts[2]}.100`;
        const ipPoolEnd = config?.ipPoolEnd || `${gatewayParts[0]}.${gatewayParts[1]}.${gatewayParts[2]}.200`;
        this.IP_POOL = this.generateIPPool(ipPoolStart, ipPoolEnd);

        console.log(`✅ DHCP服务器配置完成:`);
        console.log(`   接口: ${this.selectedInterface}`);
        console.log(`   服务器IP: ${this.interfaceIP}`);
        console.log(`   网关: ${this.GATEWAY}`);
        console.log(`   子网: ${this.SUBNET}`);
        console.log(`   掩码: ${this.NETMASK}`);
        console.log(`   广播地址: ${this.BROADCAST_ADDRESS}`);
        console.log(`   IP池: ${this.IP_POOL[0]} - ${this.IP_POOL[this.IP_POOL.length-1]} (${this.IP_POOL.length}个地址)`);
        console.log(`   租约时间: ${this.LEASE_TIME}秒`);
        console.log(`   DNS: ${this.DNS.join(', ')}`);
    }

    // 获取所有可用网卡
    static getAvailableInterfaces(): Array<{
        name: string;
        ip: string;
        mac: string;
        netmask: string;
        broadcast: string;
        internal: boolean;
    }> {
        const interfaces = os.networkInterfaces();
        const result: Array<{
            name: string;
            ip: string;
            mac: string;
            netmask: string;
            broadcast: string;
            internal: boolean;
        }> = [];

        for (const [name, addrs] of Object.entries(interfaces)) {
            for (const addr of addrs || []) {
                if (addr.family === 'IPv4') {
                    result.push({
                        name,
                        ip: addr.address,
                        mac: addr.mac || '00:00:00:00:00:00',
                        netmask: addr.netmask,
                        broadcast: this.calculateBroadcastForInterface(addr.address, addr.netmask),
                        internal: addr.internal
                    });
                }
            }
        }

        return result;
    }

    // 计算广播地址
    private static calculateBroadcastForInterface(ip: string, netmask: string): string {
        const ipParts = ip.split('.').map(Number);
        const maskParts = netmask.split('.').map(Number);
        const broadcastParts: number[] = [];

        for (let i = 0; i < 4; i++) {
            broadcastParts.push((ipParts[i] & maskParts[i]) | (~maskParts[i] & 255));
        }

        return broadcastParts.join('.');
    }

    // 自动选择网卡
    private autoSelectInterface(): { name: string; ip: string; broadcast: string } {
        const interfaces = SimpleDHCPServer.getAvailableInterfaces();

        console.log('🔍 扫描可用网络接口:');
        interfaces.forEach(iface => {
            console.log(`   ${iface.name}: ${iface.ip}/${iface.netmask} (${iface.internal ? '内部' : '外部'})`);
        });

        // 优先选择第一个非内部、非回环的接口
        for (const iface of interfaces) {
            if (iface.name.includes('以太网')) {
                console.log(`包含以太网 ${iface}`)
                return {
                    name: iface.name,
                    ip: iface.ip,
                    broadcast: iface.broadcast
                };
            }
        }

        for (const iface of interfaces) {
            if (!iface.internal && !iface.ip.startsWith('127.') && iface.ip !== '0.0.0.0') {
                console.log(`✅ 选择接口: ${iface.name} (${iface.ip})`);
                return {
                    name: iface.name,
                    ip: iface.ip,
                    broadcast: iface.broadcast
                };
            }
        }


        // 如果没有找到外部接口，选择第一个IPv4接口
        for (const iface of interfaces) {
            if (!iface.ip.startsWith('127.')) {
                console.log(`⚠️  回退选择接口: ${iface.name} (${iface.ip})`);
                return {
                    name: iface.name,
                    ip: iface.ip,
                    broadcast: iface.broadcast
                };
            }
        }

        // 最后的回退
        console.warn('⚠️  未找到合适网卡，使用默认配置');
        return {
            name: 'eth0',
            ip: '192.168.100.1',
            broadcast: '192.255.255.255'
        };
    }

    async start(): Promise<boolean> {
        if (this.isRunning) {
            console.log('ℹ️  DHCP服务器已经在运行');
            return true;
        }

        console.log('🚀 正在启动DHCP服务器...');

        try {
            // 计算广播地址
            const broadcastAddr = this.calculateBroadcast(this.interfaceIP, this.NETMASK);

            // 配置 node-dhcp 服务器 - 关键配置！
            const dhcpConfig: dhcp.ServerConfiguration = {
                // 核心配置：服务器IP和范围
                server: this.interfaceIP,  // 必须：绑定到指定网卡IP
                range: [
                    this.IP_POOL[0],
                    this.IP_POOL[this.IP_POOL.length - 1]
                ],

                // 强制发送所有必需的选项
                forceOptions: [
                    'subnetMask',
                    'router',
                    'dns',
                    'domainName',
                    'broadcast',
                    'serverIdentifier',
                    'ntp'
                ],

                // 网络配置
                subnetMask: this.NETMASK,
                router: [this.GATEWAY],
                broadcast: broadcastAddr,

                // DNS服务器
                dns: this.DNS,

                // 租约时间（秒）
                leaseTime: this.LEASE_TIME,

                // 域名
                domainName: 'local',

                // 启用随机IP分配
                randomIP: true,

                // 静态IP绑定（可选）
                static: {},

                // 调试选项
                logLevel: 'debug',

                // 消息处理钩子 - 用于记录和事件处理
                message: (req: any, res: any) => {
                    try {
                        // 直接访问原始数据，避免依赖不存在的属性
                        const messageType = req.options?.[53];
                        const typeNames: {[key: string]: string} = {
                            '1': 'DISCOVER',
                            '2': 'OFFER',
                            '3': 'REQUEST',
                            '5': 'ACK',
                            '6': 'NAK',
                            '8': 'INFORM'
                        };

                        // 尝试多种方式获取MAC地址
                        let mac = 'unknown';
                        if (req.chaddr && Buffer.isBuffer(req.chaddr)) {
                            mac = this.extractMACFromBuffer(req.chaddr);
                        } else if (req.chaddr && typeof req.chaddr === 'string') {
                            mac = this.cleanMAC(req.chaddr);
                        } else if (req.macAddress) {
                            mac = this.cleanMAC(req.macAddress);
                        } else if (req.options?.chaddr) {
                            if (Buffer.isBuffer(req.options.chaddr)) {
                                mac = this.extractMACFromBuffer(req.options.chaddr);
                            } else if (typeof req.options.chaddr === 'string') {
                                mac = this.cleanMAC(req.options.chaddr);
                            }
                        }

                        console.log(`📨 ${typeNames[messageType] || messageType} from ${mac}`);

                        // 记录详细的请求信息用于调试
                        console.log('🔍 DHCP请求详情:', {
                            hasChaddr: !!req.chaddr,
                            chaddrType: req.chaddr ? typeof req.chaddr : 'none',
                            chaddrLength: Buffer.isBuffer(req.chaddr) ? req.chaddr.length : 'N/A',
                            options: Object.keys(req.options || {}),
                            messageType: messageType
                        });
                    } catch (err) {
                        console.error('处理DHCP消息时出错:', err);
                        console.error('请求对象:', req);
                    }
                }
            };

            console.log('📋 DHCP服务器配置:');
            console.log(`   - 服务器IP: ${dhcpConfig.server}`);
            console.log(`   - IP池: ${dhcpConfig.range?.[0]} - ${dhcpConfig.range?.[1]}`);
            console.log(`   - 网关: ${dhcpConfig.router}`);
            console.log(`   - 掩码: ${dhcpConfig.subnetMask}`);
            console.log(`   - 广播: ${dhcpConfig.broadcast}`);
            console.log(`   - DNS: ${dhcpConfig.dns?.join(', ')}`);

            // 创建DHCP服务器
            this.dhcpServer = createServer(dhcpConfig);

            // 设置事件监听 - 修复版
            this.setupEventListeners();

            // 启动服务器 - 使用Promise包装回调
            await new Promise<void>((resolve, reject) => {
                if (!this.dhcpServer) {
                    reject(new Error('DHCP服务器创建失败'));
                    return;
                }

                this.dhcpServer.listen(this.PORT, (err?: Error) => {
                    if (err) {
                        console.error('❌ 启动DHCP服务器失败:', err);
                        reject(err);
                        return;
                    }

                    console.log(`✅ DHCP服务器启动成功！`);
                    console.log(`   监听地址: ${this.interfaceIP}:${this.PORT}`);
                    console.log(`   绑定网卡: ${this.selectedInterface}`);

                    this.isRunning = true;

                    // 启动清理任务
                    this.startCleanupTasks();

                    // 触发启动事件
                    this.emit('started', this.getStatus());
                    this.emit('status-changed', { running: true });

                    resolve();
                });
            });

            return true;

        } catch (error: any) {
            console.error('❌ 启动DHCP服务器失败:', error);

            // 检查权限问题
            if (error.code === 'EACCES' && this.PORT < 1024) {
                console.error('⚠️  端口67需要root权限！');
                console.error('   请使用: sudo npm run electron:dev 或设置端口>1024');
            }

            // 清理资源
            this.dhcpServer = null;
            this.isRunning = false;

            // 触发错误事件
            this.emit('error', error);
            this.emit('status-changed', { running: false });

            return false;
        }
    }

    // 设置事件监听器 - 修复版
    private setupEventListeners(): void {
        if (!this.dhcpServer) return;

        // 监听分配事件 - 修复：node-dhcp库返回的对象是以MAC为键的
        this.dhcpServer.on('bound', (state: any) => {
            try {
                console.log('🔍 bound事件触发，state对象:', state);

                // 修复：state对象是以MAC地址为键的对象
                // 例如：{ "B4-8A-0A-B2-E3-F3": { address: "192.168.100.193", ... } }
                const stateKeys = Object.keys(state || {});

                if (stateKeys.length === 0) {
                    console.warn('⚠️  bound事件中state对象为空');
                    return;
                }

                // 遍历所有MAC地址（理论上只有一个）
                stateKeys.forEach((rawMac: string) => {
                    try {
                        const leaseInfo = state[rawMac];
                        if (!leaseInfo) {
                            console.warn(`⚠️  找不到MAC地址 ${rawMac} 的租约信息`);
                            return;
                        }

                        // 清理和格式化MAC地址
                        const mac = this.cleanMAC(rawMac);
                        const ip = leaseInfo.address || 'unknown';
                        const leaseTime = leaseInfo.leasePeriod || this.LEASE_TIME;

                        // 尝试获取主机名
                        let hostname = '';
                        if (leaseInfo.hostname) {
                            hostname = leaseInfo.hostname;
                        } else if (leaseInfo.hostName) {
                            hostname = leaseInfo.hostName;
                        }

                        console.log(`🎉 DHCP BOUND: ${mac} -> ${ip} (${hostname || '无主机名'}) 租期: ${leaseTime}秒`);

                        if (mac !== 'unknown' && ip !== 'unknown') {
                            this.updateLease(mac, ip, hostname);

                            // 触发事件
                            this.emit('ip-assigned', {
                                mac,
                                ip,
                                hostname: hostname || undefined,
                                leaseTime
                            });

                            this.emit('device-registered', {
                                mac,
                                ip,
                                hostname: hostname || undefined
                            });
                        } else {
                            console.warn(`⚠️  MAC或IP地址无效: MAC=${mac}, IP=${ip}`);
                        }
                    } catch (err) {
                        console.error(`处理MAC地址 ${rawMac} 的bound事件时出错:`, err);
                    }
                });
            } catch (err) {
                console.error('处理bound事件时出错:', err);
            }
        });

        // 监听ACK事件
        this.dhcpServer.on('ack', (state: any) => {
            try {
                console.log('🔍 ack事件触发:', state);

                // 同样处理：state对象是以MAC为键的
                const stateKeys = Object.keys(state || {});

                stateKeys.forEach((rawMac: string) => {
                    try {
                        const leaseInfo = state[rawMac];
                        if (!leaseInfo) return;

                        const mac = this.cleanMAC(rawMac);
                        const ip = leaseInfo.address || 'unknown';

                        console.log(`✅ DHCP ACK: ${mac} -> ${ip}`);

                        if (mac !== 'unknown' && ip !== 'unknown') {
                            this.updateLease(mac, ip);
                        }
                    } catch (err) {
                        console.error(`处理MAC地址 ${rawMac} 的ack事件时出错:`, err);
                    }
                });
            } catch (err) {
                console.error('处理ack事件时出错:', err);
            }
        });

        // 监听错误
        this.dhcpServer.on('error', (err: Error) => {
            console.error('DHCP服务器错误:', err);
            this.emit('error', err);
        });

        // 监听监听事件
        this.dhcpServer.on('listening', () => {
            console.log('👂 DHCP服务器正在监听...');
            this.emit('listening');
            this.isRunning = true;
            let status = this.getStatus();
            this.emit('status-changed', status);
        });

        // 监听关闭事件
        this.dhcpServer.on('close', () => {
            console.log('🛑 DHCP服务器已关闭');
            this.isRunning = false;
            this.emit('stopped');
            this.emit('status-changed', { running: false });
        });

        // 监听消息事件 - 修复res可能为undefined的问题
        this.dhcpServer.on('message', (req: any, res: any) => {
            try {
                // 直接解析原始请求
                const messageType = req.options?.[53];
                const typeNames: {[key: string]: string} = {
                    '1': 'DISCOVER',
                    '2': 'OFFER',
                    '3': 'REQUEST',
                    '5': 'ACK',
                    '6': 'NAK',
                    '8': 'INFORM'
                };

                // 提取MAC地址
                let mac = 'unknown';
                if (req.chaddr && Buffer.isBuffer(req.chaddr)) {
                    mac = this.extractMACFromBuffer(req.chaddr);
                } else if (req.chaddr && typeof req.chaddr === 'string') {
                    mac = this.cleanMAC(req.chaddr);
                }

                console.log(`📨 收到${typeNames[messageType] || messageType}消息 from ${mac}`);

                // 安全地访问res对象
                if (res && res.yiaddr && mac !== 'unknown') {
                    console.log(`💡 为${mac}分配IP: ${res.yiaddr}`);
                }

                // 记录原始数据用于调试
                if (messageType === '1' || messageType === '3') {
                    console.log('🔍 数据包详情:', {
                        chaddr: req.chaddr ? this.bufferToHex(req.chaddr) : 'none',
                        chaddrType: req.chaddr ? typeof req.chaddr : 'none',
                        chaddrLength: Buffer.isBuffer(req.chaddr) ? req.chaddr.length : 'N/A',
                        yiaddr: res?.yiaddr || 'none',
                        messageType: messageType,
                        optionsCount: Object.keys(req.options || {}).length
                    });
                }
            } catch (err) {
                console.error('处理message事件时出错:', err);
            }
        });

        // 监听DHCP OFFER事件
        this.dhcpServer.on('offer', (state: any) => {
            try {
                console.log('🔍 offer事件触发:', state);

                const stateKeys = Object.keys(state || {});

                stateKeys.forEach((rawMac: string) => {
                    try {
                        const leaseInfo = state[rawMac];
                        if (!leaseInfo) return;

                        const mac = this.cleanMAC(rawMac);
                        const ip = leaseInfo.address || 'unknown';

                        console.log(`📤 DHCP OFFER: 为 ${mac} 提供 ${ip}`);
                    } catch (err) {
                        console.error(`处理MAC地址 ${rawMac} 的offer事件时出错:`, err);
                    }
                });
            } catch (err) {
                console.error('处理offer事件时出错:', err);
            }
        });

        // 监听NAK事件
        this.dhcpServer.on('nak', (state: any) => {
            try {
                console.log('🔍 nak事件触发:', state);

                const stateKeys = Object.keys(state || {});

                stateKeys.forEach((rawMac: string) => {
                    try {
                        const mac = this.cleanMAC(rawMac);
                        console.log(`❌ DHCP NAK: 拒绝 ${mac} 的请求`);
                        this.emit('request-denied', { mac });
                    } catch (err) {
                        console.error(`处理MAC地址 ${rawMac} 的nak事件时出错:`, err);
                    }
                });
            } catch (err) {
                console.error('处理nak事件时出错:', err);
            }
        });
    }

    // 从Buffer中提取MAC地址
    private extractMACFromBuffer(buffer: Buffer): string {
        try {
            if (!Buffer.isBuffer(buffer)) {
                return 'unknown';
            }

            // DHCP数据包中的MAC地址通常是前6个字节
            if (buffer.length >= 6) {
                const macParts = [];
                for (let i = 0; i < 6; i++) {
                    macParts.push(buffer[i].toString(16).padStart(2, '0'));
                }
                return macParts.join(':').toUpperCase();
            }

            return 'unknown';
        } catch (err) {
            console.error('从Buffer提取MAC地址时出错:', err);
            return 'unknown';
        }
    }

    // 清理MAC地址格式 - 修复版
    private cleanMAC(mac: string): string {
        try {
            if (!mac || typeof mac !== 'string') {
                return 'unknown';
            }

            // 移除所有分隔符（-、:、.等）
            const cleanStr = mac.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();

            // 检查长度
            if (cleanStr.length === 12) {
                // 重新格式化为标准MAC地址格式 (XX:XX:XX:XX:XX:XX)
                return cleanStr.match(/.{2}/g)?.join(':') || cleanStr;
            }

            // 如果已经是标准格式，直接返回
            if (mac.match(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/)) {
                return mac.toUpperCase().replace(/-/g, ':');
            }

            return cleanStr;
        } catch (err) {
            console.error('清理MAC地址时出错:', mac, err);
            return 'unknown';
        }
    }

    // Buffer转十六进制字符串
    private bufferToHex(buffer: Buffer): string {
        try {
            return buffer.toString('hex').toUpperCase();
        } catch (err) {
            return 'unknown';
        }
    }

    // 更新租约信息
    private updateLease(mac: string, ip: string, hostname?: string): void {
        // 先清理MAC地址
        const cleanMAC = this.cleanMAC(mac);
        if (cleanMAC === 'unknown') {
            console.warn(`⚠️  无法清理MAC地址: ${mac}`);
            return;
        }

        // 验证IP地址格式
        const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        if (!ipRegex.test(ip)) {
            console.warn(`⚠️  无效的IP地址: ${ip}`);
            return;
        }

        const now = Date.now();
        const leaseEnd = now + this.LEASE_TIME * 1000;

        const existingLease = this.leases.get(cleanMAC);
        const lease: SimpleLease = {
            mac: cleanMAC,
            ip,
            lastSeen: now,
            leaseStart: existingLease?.leaseStart || now,
            leaseEnd: existingLease?.leaseEnd || leaseEnd,
            hostname: hostname || existingLease?.hostname
        };

        this.leases.set(cleanMAC, lease);

        const expiryTime = new Date(leaseEnd).toLocaleString();
        console.log(`📝 更新租约: ${cleanMAC} -> ${ip} (${hostname || '无主机名'}) - 租期: ${expiryTime}`);

        this.emit('lease-updated', { mac: cleanMAC, ip, hostname, lease });
    }

    // 启动清理任务
    private startCleanupTasks(): void {
        // 清理已有的定时器
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // 定期清理过期租约
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            let expiredCount = 0;

            for (const [mac, lease] of this.leases.entries()) {
                if (lease.leaseEnd && now > lease.leaseEnd) {
                    this.leases.delete(mac);
                    expiredCount++;
                    console.log(`🗑️  清理过期租约: ${mac} -> ${lease.ip}`);
                    this.emit('lease-expired', { mac, ip: lease.ip });
                }
            }

            if (expiredCount > 0) {
                console.log(`清理了 ${expiredCount} 个过期租约`);
            }
        }, 60000); // 每分钟检查一次

        console.log('✅ 租约清理任务已启动');
    }

    // 停止服务器
    stop(): void {
        console.log('正在停止DHCP服务器...');

        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        if (this.dhcpServer) {
            this.dhcpServer.close();
            this.dhcpServer = null;
        }

        this.isRunning = false;
        console.log('🛑 DHCP服务器已停止');
        this.emit('stopped');
        this.emit('status-changed', { running: false });
    }

    // 获取所有租约
    getLeases(): SimpleLease[] {
        return Array.from(this.leases.values()).map(lease => ({
            ...lease,
            mac: lease.mac || 'unknown',
            ip: lease.ip || 'unknown',
            lastSeen: lease.lastSeen || Date.now()
        }));
    }

    // 获取服务器状态
    getStatus() {
        const activeLeases = this.leases.size;

        return {
            running: this.isRunning,
            interface: this.selectedInterface,
            ip: this.interfaceIP,
            gateway: this.GATEWAY,
            netmask: this.NETMASK,
            broadcast: this.BROADCAST_ADDRESS,
            port: this.PORT,
            leases: this.getLeases(),
            activeLeases,
            availableIPs: this.getAvailableIPCount(),
            totalIPs: this.IP_POOL.length,
            config: this.getConfigInfo()
        };
    }

    // 获取配置信息
    getConfigInfo() {
        return {
            subnet: this.SUBNET,
            netmask: this.NETMASK,
            gateway: this.GATEWAY,
            dns: this.DNS,
            ipPoolStart: this.IP_POOL[0],
            ipPoolEnd: this.IP_POOL[this.IP_POOL.length - 1],
            port: this.PORT,
            leaseTime: this.LEASE_TIME,
            interface: this.selectedInterface,
            interfaceIP: this.interfaceIP
        };
    }

    // 获取可用IP数量
    getAvailableIPCount(): number {
        const usedIPs = new Set();
        for (const lease of this.leases.values()) {
            if (lease.ip && lease.ip !== 'unknown') {
                usedIPs.add(lease.ip);
            }
        }
        return this.IP_POOL.length - usedIPs.size;
    }

    // 释放IP地址
    releaseIP(mac: string): boolean {
        const cleanMAC = this.cleanMAC(mac);
        const lease = this.leases.get(cleanMAC);
        if (lease) {
            this.leases.delete(cleanMAC);
            this.pendingTransactions.delete(cleanMAC);
            console.log(`🗑️  释放IP: ${cleanMAC} -> ${lease.ip}`);
            this.emit('ip-released', { mac: cleanMAC, ip: lease.ip, lease });
            return true;
        }
        return false;
    }

    // 手动分配IP地址
    assignIP(mac: string, ip: string, hostname?: string): boolean {
        if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(ip)) {
            console.error(`❌ 无效的IP地址: ${ip}`);
            return false;
        }

        // 检查IP是否在池中
        if (!this.isIPInPool(ip)) {
            console.error(`❌ IP ${ip} 不在IP池范围内`);
            return false;
        }

        // 检查IP是否可用
        let available = true;
        for (const lease of this.leases.values()) {
            if (lease.ip === ip && lease.mac !== mac) {
                available = false;
                break;
            }
        }

        if (!available) {
            console.error(`❌ IP ${ip} 已被占用`);
            return false;
        }

        const cleanMAC = this.cleanMAC(mac);
        const now = Date.now();
        const lease: SimpleLease = {
            mac: cleanMAC,
            ip,
            lastSeen: now,
            leaseStart: now,
            leaseEnd: now + this.LEASE_TIME * 1000,
            hostname
        };

        this.leases.set(cleanMAC, lease);
        console.log(`✅ 手动分配IP: ${cleanMAC} -> ${ip} (${hostname || '无主机名'})`);
        this.emit('ip-assigned', { mac: cleanMAC, ip, hostname, manual: true, lease });

        return true;
    }

    // 重新配置服务器
    async reconfigure(config: Partial<DHCPServerConfig>): Promise<boolean> {
        console.log('🔄 重新配置DHCP服务器...');

        // 保存当前状态
        const wasRunning = this.isRunning;
        const oldConfig = this.getConfigInfo();

        // 停止当前服务器
        if (wasRunning) {
            this.stop();
        }

        try {
            // 更新配置
            if (config.interfaceName && config.interfaceIP) {
                this.selectedInterface = config.interfaceName;
                this.interfaceIP = config.interfaceIP;
                this.GATEWAY = config.gateway || config.interfaceIP;
                this.BROADCAST_ADDRESS = this.calculateBroadcast(this.interfaceIP, this.NETMASK);
            }

            if (config.subnet) this.SUBNET = config.subnet;
            if (config.netmask) this.NETMASK = config.netmask;
            if (config.gateway) this.GATEWAY = config.gateway;
            if (config.dns) this.DNS = config.dns;
            if (config.leaseTime) this.LEASE_TIME = config.leaseTime;
            if (config.ipPoolStart && config.ipPoolEnd) {
                this.IP_POOL = this.generateIPPool(config.ipPoolStart, config.ipPoolEnd);
            }
            if (config.port) this.PORT = config.port;

            console.log('✅ 配置已更新');

            // 如果之前是运行状态，重新启动
            if (wasRunning) {
                console.log('正在重新启动服务器...');
                const success = await this.start();

                if (success) {
                    console.log('✅ DHCP服务器重新配置并启动成功');
                    this.emit('reconfigured', this.getConfigInfo());
                    return true;
                } else {
                    console.error('❌ DHCP服务器重新启动失败');
                    this.emit('restart-error', new Error('重新启动失败'));
                    return false;
                }
            } else {
                this.emit('reconfigured', this.getConfigInfo());
                return true;
            }
        } catch (error) {
            console.error('重新配置DHCP服务器失败:', error);
            this.emit('restart-error', error);

            // 回退到旧配置
            Object.assign(this, {
                SUBNET: oldConfig.subnet,
                NETMASK: oldConfig.netmask,
                GATEWAY: oldConfig.gateway,
                DNS: oldConfig.dns,
                LEASE_TIME: oldConfig.leaseTime,
                PORT: oldConfig.port
            });

            return false;
        }
    }

    // 清理所有租约
    clearAllLeases(): number {
        const count = this.leases.size;
        this.leases.clear();
        this.pendingTransactions.clear();
        console.log(`🗑️  清理所有租约: ${count}个`);
        this.emit('all-leases-cleared', { count });
        return count;
    }

    // 续租
    renewLease(mac: string, extendBySeconds?: number): boolean {
        const cleanMAC = this.cleanMAC(mac);
        const lease = this.leases.get(cleanMAC);
        if (!lease) {
            console.log(`❌ 找不到MAC地址 ${cleanMAC} 的租约`);
            return false;
        }

        const extendTime = (extendBySeconds || this.LEASE_TIME) * 1000;
        lease.leaseEnd = Date.now() + extendTime;
        lease.lastSeen = Date.now();

        this.leases.set(cleanMAC, lease);

        console.log(`🔄 续租: ${cleanMAC} -> ${lease.ip} (延长${extendBySeconds || this.LEASE_TIME}秒)`);
        this.emit('lease-renewed', { mac: cleanMAC, ip: lease.ip, lease, extendTime });

        return true;
    }

    // ========== 辅助方法 ==========

    private calculateBroadcast(ip: string, netmask: string): string {
        const ipParts = ip.split('.').map(Number);
        const maskParts = netmask.split('.').map(Number);
        const broadcastParts = [];
        for (let i = 0; i < 4; i++) {
            broadcastParts.push((ipParts[i] & maskParts[i]) | (~maskParts[i] & 255));
        }
        return broadcastParts.join('.');
    }

    private generateIPPool(start: string, end: string): string[] {
        const startNum = this.ipToNumber(start);
        const endNum = this.ipToNumber(end);

        if (startNum > endNum) {
            console.error(`❌ IP池范围无效: ${start} > ${end}`);
            return this.generateIPPool(end, start);
        }

        const pool: string[] = [];
        for (let i = startNum; i <= endNum; i++) {
            pool.push(this.numberToIP(i));
        }

        console.log(`📊 生成IP池: ${pool.length} 个地址 (${start} - ${end})`);
        return pool;
    }

    private ipToNumber(ip: string): number {
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(part => isNaN(part) || part < 0 || part > 255)) {
            console.error(`❌ 无效的IP地址: ${ip}`);
            return 0;
        }
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

    // 检查IP是否在池中
    isIPInPool(ip: string): boolean {
        return this.IP_POOL.includes(ip);
    }



}

export default SimpleDHCPServer;