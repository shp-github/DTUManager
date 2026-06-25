// ========== 信号强度 & 通用格式化工具 ==========

export interface SignalLevel {
  level: string
  description: string
  bars: number
  color: string
}

export function getSignalLevel(rssi: number): SignalLevel {
  if (rssi >= -30) return { level: '超近极值信号', description: '距离路由器极近，几乎贴天线，极少出现，信号顶格溢出', bars: 6, color: '#FF1744' }
  if (rssi >= -50) return { level: '极强（满格顶配）', description: '信号质量顶级，网速拉满、延迟极低', bars: 5, color: '#00C853' }
  if (rssi >= -67) return { level: '良好', description: '日常最优区间，游戏、高清视频稳定流畅', bars: 4, color: '#64DD17' }
  if (rssi >= -70) return { level: '临界合格', description: '基础上网够用，高带宽业务偶有波动', bars: 3, color: '#FFD600' }
  if (rssi >= -80) return { level: '偏弱', description: '刷微信、浏览网页尚可，网速不稳定', bars: 2, color: '#FF9100' }
  if (rssi >= -90) return { level: '很差', description: '卡顿明显，容易断流，不适合视频下载', bars: 1, color: '#FF6D00' }
  return { level: '微弱 / 几乎无信号', description: '连接困难，频繁掉线', bars: 0, color: '#D50000' }
}

export function getSignalColor(rssi: number): string {
  return getSignalLevel(rssi).color
}

export function getSignalBars(rssi: number): string {
  const { bars } = getSignalLevel(rssi)
  return '●'.repeat(bars) + '○'.repeat(6 - bars)
}

export function getWifiLevel(rssi: number): number {
  const { bars } = getSignalLevel(rssi)
  if (bars >= 5) return 3
  if (bars >= 3) return 2
  if (bars >= 1) return 1
  return 0
}

export function getWifiIcon(rssi: number): string {
  const level = getWifiLevel(rssi)
  if (level === 0) return ''
  return `/wifi/${level}.svg`
}

export function getNetworkIcon(networkType: string): string {
  const map: Record<string, string> = {
    ETH: '/network/ethernet.svg',
    WiFi: '/network/wifi.svg',
  }
  return map[networkType] || ''
}

export function getSignalTooltip(rssi: number): string {
  const { level, description } = getSignalLevel(rssi)
  return `<div style="line-height:1.8">
    <div><b>信号强度：</b>${rssi} dBm</div>
    <div><b>等级：</b>${level}</div>
    <div style="color:#aaa;font-size:12px">${description}</div>
  </div>`
}

export function formatRuntime(seconds: number): string {
  const days = Math.floor(seconds / (24 * 3600))
  const hours = Math.floor((seconds % (24 * 3600)) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const sec = seconds % 60
  return `${days}天 ${hours}小时 ${minutes}分钟 ${sec}秒`
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
