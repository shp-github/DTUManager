import {createRouter, createWebHashHistory, RouteLocationNormalized} from 'vue-router'
import LogView from './views/LogView.vue'
import DhcpView from './views/dhcpView.vue'
import DtuConfig from './views/DtuConfig.vue'
import ResourceMonitor from './views/ResourceMonitor.vue'
import DeviceList from './views/DeviceList.vue'
import DataMonitoring from './views/DataMonitoring.vue'
import LocationInfo from './views/LocationInfo.vue'
import DeviceResource from './views/DeviceResource.vue'
import NetworkTools from './views/NetworkTools.vue'
import SerialTools from './views/SerialTools.vue'

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
    { path: '/dhcp', component: DhcpView },
    { path: '/monitoring', name: 'DataMonitoring', component: DataMonitoring },
    { path: '/local-info', name: 'LocationInfo', component: LocationInfo },
    { path: '/device-resource', name: 'DeviceResource', component: DeviceResource },
    { path: '/network-tools', name: 'NetworkTools', component: NetworkTools },
    { path: '/serial-tools', name: 'SerialTools', component: SerialTools },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

export default router
