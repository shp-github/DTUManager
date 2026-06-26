# DTU Manager — 物联网设备配置管理工具

> DTU 固件程序：[wt32-arduino-dtu](https://gitee.com/shp-java/wt32-arduino-dtu)

基于 **Electron + Vue 3 + Element Plus** 构建的跨平台桌面应用，用于物联网设备的自动发现、参数配置、状态监控与固件升级。适用于 Modbus、MQTT、RS-485、以太网等多种工业场景。

---

## 界面截图

| 设备管理 | 设备统计 |
|---|---|
| ![设备管理](image/%E8%AE%BE%E5%A4%87%E7%AE%A1%E7%90%86.png) | ![设备统计](image/%E8%AE%BE%E5%A4%87%E7%BB%9F%E8%AE%A1.png) |

| 设备资源 | 数据监听 |
|---|---|
| ![设备资源](image/%E8%AE%BE%E5%A4%87%E8%B5%84%E6%BA%90.png) | ![数据监听](image/%E6%95%B0%E6%8D%AE%E7%9B%91%E5%90%AC.png) |

| 本地信息 | DHCP 分配 |
|---|---|
| ![本地信息](image/%E6%9C%AC%E5%9C%B0%E4%BF%A1%E6%81%AF.png) | ![DHCP分配](image/dhcp%E5%88%86%E9%85%8D.png) |

| 串口工具 | 网络工具 |
|---|---|
| ![串口工具](image/%E4%B8%B2%E5%8F%A3%E5%B7%A5%E5%85%B7.png) | ![网络工具](image/%E7%BD%91%E7%BB%9C%E5%B7%A5%E5%85%B7.png) |

| 固件升级 |
|---|
| ![固件升级](image/%E5%9B%BA%E4%BB%B6%E5%8D%87%E7%BA%A7.png) |

---

## 核心功能

### 设备自动发现
通过 UDP 局域网广播自动搜索设备，零配置接入，无需手动输入 IP。

### Modbus 指令动态配置
支持任意从站地址、寄存器、功能码组合，适配各类传感器与执行器。配置即时下发，无需重启设备。

### 串口参数可视化配置
图形化界面配置波特率、校验位、停止位、数据位等参数，实时生效。

### 网络通道配置管理
一键配置 WiFi / Ethernet / MQTT 服务器参数，支持静态 IP 与 DHCP 模式切换。

### 局域网固件升级（LAN OTA）
内置 HTTP 文件服务器，支持对多个设备批量升级，实时显示升级进度。

### 终端运行状态监控
实时展示设备 CPU 使用率、内存占用、网络状态、Modbus 数据及日志输出。

### 串口 / 网络调试工具
内置串口终端与 TCP/UDP 客户端，支持 HEX、ASCII、Modbus 多种协议模式。

### DHCP 服务
集成 DHCP 服务器，支持 IP 地址池管理、租约监控、设备绑定。

---

## 技术栈

| 层面 | 技术 |
|---|---|
| 框架 | Electron 29 + Vue 3 + TypeScript |
| UI | Element Plus 2.x（三主题：亮色 / 暗夜 / 绿色） |
| 构建 | Vite 5 + electron-builder |
| 通信 | UDP 广播 + MQTT + HTTP |
| 串口 | serialport |
| DHCP | 自研 simple-dhcp-server |

---

## 环境与安装

> 要求 Node.js >= 18

```bash
# 1. 配置国内镜像
yarn config set registry https://registry.npmmirror.com
yarn config set ELECTRON_MIRROR https://npmmirror.com/mirrors/electron/

# 2. 安装依赖
yarn install
```

### 开发运行

```bash
npm run dev
```

### 打包构建

```bash
# 先构建前端
npm run build

# 打包 Windows 安装包（管理员权限运行）
npm run build:win
```

---

## 项目价值

- **降低部署门槛** — 无需工程师介入即可完成基础配置
- **统一配置管理** — 保证设备端参数规范一致，减少出错
- **提升维护效率** — 状态监控 + OTA 升级，降低售后成本
- **强可扩展性** — 适配多类型传感器、执行器和通信协议
