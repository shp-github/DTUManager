import {createRouter, createWebHashHistory, RouteLocationNormalized} from 'vue-router'
import LogView from './views/LogView.vue'
import DtuConfig from './views/DtuConfig.vue'
import ResourceMonitor from './views/ResourceMonitor.vue'
import DeviceList from './views/DeviceList.vue'

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
]

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

export default router
