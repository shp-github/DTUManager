import { createRouter, createWebHashHistory } from 'vue-router'
import LogView from './views/LogView.vue'
import DtuConfig from './views/DtuConfig.vue'
import ResourceMonitor from './views/ResourceMonitor.vue'
import DeviceList from './views/DeviceList.vue'

const routes = [
    { path: '/', redirect: '/devices' },
    { path: '/devices', name: 'DeviceList', component: DeviceList },
    { path: '/config/:deviceId', name: 'DtuConfig', component: DtuConfig, props: true },
    { path: '/log', component: LogView },
    {
        path: '/dtu',
        component: DtuConfig,
        children: [

        ],
    },
    { path: '/resource', component: ResourceMonitor },
    { path: '/', redirect: '/log' },
]

const router = createRouter({
    history: createWebHashHistory(),
    routes,
})

export default router
