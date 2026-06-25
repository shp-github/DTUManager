import { ref, h, defineComponent } from 'vue'
import { ElMessage, ElMessageBox, ElSelect, ElOption } from 'element-plus'

// 选择网卡IP（多个IP时弹框让用户选择，只有一个则自动使用）
export async function ensureIPSelected(): Promise<boolean> {
  try {
    const ips: string[] = await window.electronAPI.getAvailableIPs()
    if (!ips || ips.length === 0) {
      ElMessage.error('未检测到可用的网络接口')
      return false
    }
    // 只有一个IP，直接使用
    if (ips.length === 1) {
      await window.electronAPI.setSelectedIP(ips[0])
      return true
    }
    // 多个IP，弹框让用户选择
    const selectedIP = ref(ips[0])
    const SelectIPComponent = defineComponent({
      setup() {
        return () => h('div', { style: 'padding: 10px 0' }, [
          h('p', { style: 'margin-bottom: 10px; color: #606266' }, '检测到多个网络接口，请选择要使用的IP地址：'),
          h(ElSelect, {
            modelValue: selectedIP.value,
            'onUpdate:modelValue': (val: string) => { selectedIP.value = val },
            placeholder: '请选择网卡IP',
            style: 'width: 100%'
          }, () => ips.map(ip => h(ElOption, { key: ip, label: ip, value: ip })))
        ])
      }
    })
    await ElMessageBox({
      title: '选择网卡',
      message: h(SelectIPComponent),
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      showCancelButton: true,
    })
    await window.electronAPI.setSelectedIP(selectedIP.value)
    return true
  } catch {
    return false // 用户取消
  }
}
