import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { AddressInfo } from 'net';
import os from 'os';

export interface UpgradeRequest {
    deviceId: string;
    firmwarePath: string;
}

export interface UpgradeResponse {
    success: boolean;
    downloadUrl?: string;
    error?: string;
    message?: string;
    status?: string;
    progress?: number;
}

export interface UpgradeHandlerParams {
    deviceId: string;
    deviceIp: string;
    fileName: string;
    fileSize: number;
}

export type UpgradeHandler = (request: UpgradeHandlerParams) => Promise<UpgradeResponse>;

class FileServer {
    private server: any = null;
    private app: express.Express | null = null;
    private port: number = 8080;
    private isRunning: boolean = false;
    private upgradeHandler: UpgradeHandler | null = null;
    private filesDir: string = '';

    // HTTP 升级开关 & 密码
    private upgradeEnabled: boolean = true;
    private upgradePassword: string = '';

    // 配置 HTTP 升级开关和密码
    setUpgradeConfig(enabled: boolean, password: string): void {
        this.upgradeEnabled = enabled;
        this.upgradePassword = password || '';
        console.log(`🔧  HTTP升级配置已更新: enabled=${enabled}, hasPassword=${!!this.upgradePassword}`);
    }

    // 获取 HTTP 升级配置
    getUpgradeConfig(): { enabled: boolean; password: string } {
        return {
            enabled: this.upgradeEnabled,
            password: this.upgradePassword
        };
    }

    // 注册外部升级处理器
    setUpgradeHandler(handler: UpgradeHandler): void {
        this.upgradeHandler = handler;
        console.log('✅ 升级API处理器已注册');
    }

    // 启动文件服务器
    async start(port: number = 8080): Promise<{ success: boolean; port?: number; addresses?: string[]; error?: string }> {
        return new Promise((resolve) => {
            try {
                // 如果服务器已经在运行，先停止
                if (this.isRunning) {
                    this.stop();
                }

                this.app = express();
                this.filesDir = path.join(process.cwd(), 'files');

                // JSON 请求体解析中间件
                this.app.use(express.json());

                // 确保文件目录存在
                if (!fs.existsSync(this.filesDir)) {
                    fs.mkdirSync(this.filesDir, { recursive: true });
                    console.log(`📁 创建文件目录: ${this.filesDir}`);
                }

                // 文件下载路由
                this.app.get('/download/:filename', (req: Request, res: Response) => {
                    const filename = req.params.filename;
                    const filePath = path.join(this.filesDir, filename);

                    if (fs.existsSync(filePath)) {
                        console.log(`📥 下载文件: ${filename}`);
                        res.download(filePath);
                    } else {
                        console.log(`❌ 文件不存在: ${filename}`);
                        res.status(404).send('文件不存在');
                    }
                });

                // 文件列表路由
                this.app.get('/files', (req: Request, res: Response) => {
                    fs.readdir(this.filesDir, (err, files) => {
                        if (err) {
                            res.status(500).json({ error: '无法读取目录' });
                            return;
                        }
                        res.json({ files });
                    });
                });

                // ========== 固件升级 API ==========
                // POST /api/upgrade
                // Body: { "deviceId": "abc123", "firmwarePath": "D:\\work\\firmware.bin" }
                this.app.post('/api/upgrade', async (req: Request, res: Response) => {
                    try {
                        // 检查 HTTP 升级是否已启用
                        if (!this.upgradeEnabled) {
                            res.status(403).json({
                                success: false,
                                error: 'HTTP升级功能未启用，请在本地设置中开启'
                            } as UpgradeResponse);
                            return;
                        }

                        // 校验访问密码（如已设置）
                        if (this.upgradePassword) {
                            const { password } = req.body;
                            if (!password || password !== this.upgradePassword) {
                                res.status(403).json({
                                    success: false,
                                    error: '密码错误或未提供'
                                } as UpgradeResponse);
                                return;
                            }
                        }

                        const { deviceId, firmwarePath } = req.body as UpgradeRequest;

                        // 参数校验
                        if (!deviceId) {
                            res.status(400).json({
                                success: false,
                                error: '缺少必填参数: deviceId'
                            } as UpgradeResponse);
                            return;
                        }
                        if (!firmwarePath) {
                            res.status(400).json({
                                success: false,
                                error: '缺少必填参数: firmwarePath'
                            } as UpgradeResponse);
                            return;
                        }

                        // 检查本地固件文件是否存在
                        if (!fs.existsSync(firmwarePath)) {
                            res.status(404).json({
                                success: false,
                                error: `固件文件不存在: ${firmwarePath}`
                            } as UpgradeResponse);
                            return;
                        }

                        // 提取文件名
                        const fileName = path.basename(firmwarePath);

                        // 拷贝固件到 files/ 目录供设备下载
                        const destPath = path.join(this.filesDir, fileName);
                        fs.copyFileSync(firmwarePath, destPath);
                        console.log(`📋 [API] 固件已拷贝: ${firmwarePath} -> ${destPath}`);

                        // 获取文件大小
                        const fileSize = fs.statSync(destPath).size;

                        // 检查是否有升级处理器
                        if (!this.upgradeHandler) {
                            res.status(500).json({
                                success: false,
                                error: '升级服务未就绪，请稍后再试'
                            } as UpgradeResponse);
                            return;
                        }

                        console.log(`📡 [API] 收到升级请求: deviceId=${deviceId}, firmwarePath=${firmwarePath}, fileName=${fileName}, fileSize=${fileSize}`);

                        // 调用升级处理器（传入 deviceId，让处理器去查找设备IP）
                        const result = await this.upgradeHandler({
                            deviceId,
                            deviceIp: '', // 由处理器通过 deviceId 查找
                            fileName,
                            fileSize
                        });

                        if (result.success) {
                            console.log(`✅ [API] 升级成功: deviceId=${deviceId} -> ${fileName}`);
                            res.json(result);
                        } else {
                            console.error(`❌ [API] 升级失败: ${result.error}`);
                            res.status(500).json(result);
                        }
                    } catch (error: any) {
                        console.error('❌ [API] 处理升级请求异常:', error);
                        res.status(500).json({
                            success: false,
                            error: error.message || '服务器内部错误'
                        } as UpgradeResponse);
                    }
                });

                // 获取升级API状态
                this.app.get('/api/status', (req: Request, res: Response) => {
                    // 列出 files/ 目录中可用的固件文件
                    let firmwareFiles: string[] = [];
                    try {
                        firmwareFiles = fs.readdirSync(this.filesDir).filter(f => f.endsWith('.bin'));
                    } catch {}

                    res.json({
                        fileServer: this.isRunning,
                        upgradeHandler: this.upgradeHandler !== null,
                        port: this.port,
                        filesDir: this.filesDir,
                        firmwareFiles
                    });
                });

                // 根路径显示信息
                this.app.get('/', (req: Request, res: Response) => {
                    res.send(`
            <h1>文件服务器正在运行</h1>
            <p>访问 <a href="/files">/files</a> 查看文件列表</p>
            <p>下载文件: /download/文件名</p>
            <hr>
            <h2>API 接口</h2>
            <p><b>POST /api/upgrade</b> - 触发设备固件升级（仅需设备号和本地固件路径）</p>
            <pre>Content-Type: application/json
{
  "deviceId": "abc123",
  "firmwarePath": "D:\\work\\firmware.bin"
}</pre>
            <p><b>GET /api/status</b> - 查看服务状态</p>
          `);
                });

                // 启动服务器
                this.server = this.app.listen(port, '0.0.0.0', () => {
                    this.port = (this.server.address() as AddressInfo).port;
                    this.isRunning = true;

                    const addresses = this.getNetworkAddresses();

                    console.log('🚀 文件服务器已启动!');
                    console.log(`📍 本地访问: http://localhost:${this.port}`);
                    console.log('🌐 局域网访问地址:');
                    addresses.forEach(addr => {
                        console.log(`   http://${addr}:${this.port}`);
                    });
                    console.log(`📁 文件目录: ${this.filesDir}`);
                    console.log('💡 下载文件: http://IP:端口/download/文件名');
                    console.log('🔧 升级API: POST http://IP:端口/api/upgrade');

                    resolve({
                        success: true,
                        port: this.port,
                        addresses: addresses
                    });
                });

                this.server.on('error', (err: Error) => {
                    resolve({
                        success: false,
                        error: `端口 ${port} 被占用，请尝试其他端口`
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

    // 停止文件服务器
    stop(): boolean {
        if (this.server) {
            this.server.close();
            this.server = null;
            this.isRunning = false;
            console.log('🛑 文件服务器已停止');
            return true;
        }
        return false;
    }

    // 获取服务器状态
    getStatus() {
        return {
            isRunning: this.isRunning,
            port: this.port,
            addresses: this.isRunning ? this.getNetworkAddresses() : []
        };
    }

    // 获取本机网络地址
    private getNetworkAddresses(): string[] {
        const networkInterfaces = os.networkInterfaces(); // 使用导入的 os 模块
        const addresses: string[] = [];

        for (const interfaceName of Object.keys(networkInterfaces)) {
            for (const netInterface of networkInterfaces[interfaceName]!) {
                // 使用 netInterface 而不是 interface
                if (netInterface.family === 'IPv4' && !netInterface.internal) {
                    addresses.push(netInterface.address);
                }
            }
        }

        return addresses;
    }
}

export default new FileServer();