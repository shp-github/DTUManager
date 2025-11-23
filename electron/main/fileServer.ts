import express from 'express';
import path from 'path';
import fs from 'fs';
import { AddressInfo } from 'net';
import os from 'os'; // 导入 os 模块而不是使用 require

class FileServer {
    private server: any = null;
    private port: number = 8080;
    private isRunning: boolean = false;

    // 启动文件服务器
    async start(port: number = 8080): Promise<{ success: boolean; port?: number; addresses?: string[]; error?: string }> {
        return new Promise((resolve) => {
            try {
                // 如果服务器已经在运行，先停止
                if (this.isRunning) {
                    this.stop();
                }

                const app = express();
                const filesDir = path.join(process.cwd(), 'files');

                // 确保文件目录存在
                if (!fs.existsSync(filesDir)) {
                    fs.mkdirSync(filesDir, { recursive: true });
                    console.log(`📁 创建文件目录: ${filesDir}`);
                }

                // 文件下载路由
                app.get('/download/:filename', (req, res) => {
                    const filename = req.params.filename;
                    const filePath = path.join(filesDir, filename);

                    if (fs.existsSync(filePath)) {
                        console.log(`📥 下载文件: ${filename}`);
                        res.download(filePath);
                    } else {
                        console.log(`❌ 文件不存在: ${filename}`);
                        res.status(404).send('文件不存在');
                    }
                });

                // 文件列表路由
                app.get('/files', (req, res) => {
                    fs.readdir(filesDir, (err, files) => {
                        if (err) {
                            res.status(500).json({ error: '无法读取目录' });
                            return;
                        }
                        res.json({ files });
                    });
                });

                // 根路径显示信息
                app.get('/', (req, res) => {
                    res.send(`
            <h1>文件服务器正在运行</h1>
            <p>访问 <a href="/files">/files</a> 查看文件列表</p>
            <p>下载文件: /download/文件名</p>
          `);
                });

                // 启动服务器
                this.server = app.listen(port, '0.0.0.0', () => {
                    this.port = (this.server.address() as AddressInfo).port;
                    this.isRunning = true;

                    const addresses = this.getNetworkAddresses();

                    console.log('🚀 文件服务器已启动!');
                    console.log(`📍 本地访问: http://localhost:${this.port}`);
                    console.log('🌐 局域网访问地址:');
                    addresses.forEach(addr => {
                        console.log(`   http://${addr}:${this.port}`);
                    });
                    console.log(`📁 文件目录: ${filesDir}`);
                    console.log('💡 下载文件: http://IP:端口/download/文件名');

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