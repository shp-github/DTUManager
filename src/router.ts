import { createRouter, createWebHashHistory } from 'vue-router'
import LogView from './views/LogView.vue'
import DtuConfig from './views/DtuConfig.vue'
import ResourceMonitor from './views/ResourceMonitor.vue'

const routes = [
    { path: '/log', component: LogView },
    {
        path: '/dtu',
        component: DtuConfig,
        children: [
            { path: 'net', component: () => import('./views/dtu/NetConfig.vue') },
            { path: 'serial', component: () => import('./views/dtu/SerialConfig.vue') },
            { path: 'modbus', component: () => import('./views/dtu/ModbusConfig.vue') },
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
