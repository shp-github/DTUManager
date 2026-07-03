import {createRouter, createWebHashHistory, RouteLocationNormalized} from 'vue-router'
import LogView from './views/LogView.vue'
import DtuConfig from './views/DtuConfig.vue'
import ResourceMonitor from './views/ResourceMonitor.vue'
import DeviceList from './views/DeviceList.vue'
import DataMonitoring from './views/DataMonitoring.vue'
import LocationInfo from './views/LocationInfo.vue'
import SystemMonitor from './views/SystemMonitor.vue'
import DeviceResource from './views/DeviceResource.vue'
import CommonTools from './views/CommonTools.vue'
import UpgradeView from './views/UpgradeView.vue'
import LocalSettings from './views/LocalSettings.vue'

const routes = [
    { path: '/', redirect: '/devices' },
    { path: '/devices', name: 'DeviceList', component: DeviceList },
    {
        path: '/config',
        name: 'DtuConfig',
        component: DtuConfig,
        props: (route: RouteLocationNormalized) => {
            if (route.query.device) {
                try {
                    return { device: JSON.parse(route.query.device as string) }
                } catch {
                    return { device: null }
                }
            }
            return { device: null }
        }
    },
    { path: '/log', component: LogView },
    { path: '/resource', component: ResourceMonitor },
    { path: '/monitoring', name: 'DataMonitoring', component: DataMonitoring },
    { path: '/local-info', name: 'LocationInfo', component: LocationInfo },
    { path: '/system-monitor', name: 'SystemMonitor', component: SystemMonitor },
    { path: '/device-resource', name: 'DeviceResource', component: DeviceResource },
    { path: '/tools', name: 'CommonTools', component: CommonTools },
    { path: '/upgrade', name: 'UpgradeView', component: UpgradeView },
    { path: '/local-settings', name: 'LocalSettings', component: LocalSettings },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

export default router
