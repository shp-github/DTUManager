 <template>
  <el-container style="height: 100vh; overflow: hidden;">
    <!-- 左侧菜单 -->
    <el-aside :width="asideWidth" style="background-color: var(--sidebar-bg); color: var(--sidebar-text); transition: width 0.3s;">
      <!-- 折叠按钮 -->
      <div class="collapse-btn" @click="toggleCollapse">
        <el-icon :size="20">
          <component :is="isCollapsed ? 'Expand' : 'Fold'">
            <el-icon v-if="isCollapsed"><Expand  /></el-icon>
            <el-icon v-if="!isCollapsed"><Fold  /></el-icon>
          </component>
        </el-icon>
      </div>

      <el-menu
          :default-active="activeMenu"
          :collapse="isCollapsed"
          :collapse-transition="false"
          class="el-menu-vertical-demo"
          background-color="var(--sidebar-bg)"
          text-color="var(--sidebar-text)"
          active-text-color="var(--sidebar-text-active)"
          router
          @select="handleMenuSelect"
      >
        <el-menu-item index="/devices">
          <el-icon><Monitor /></el-icon>
          <template #title>设备列表</template>
        </el-menu-item>
        <el-menu-item index="/upgrade">
          <el-icon><UploadFilled /></el-icon>
          <template #title>固件升级</template>
        </el-menu-item>
        <el-menu-item index="/resource">
          <el-icon><TrendCharts /></el-icon>
          <template #title>设备统计</template>
        </el-menu-item>
        <el-menu-item index="/device-resource">
          <el-icon><Odometer /></el-icon>
          <template #title>设备资源</template>
        </el-menu-item>
        <el-menu-item index="/monitoring">
          <el-icon><View /></el-icon>
          <template #title>数据监听</template>
        </el-menu-item>

        <el-menu-item index="/dhcp">
          <el-icon><Connection /></el-icon>
          <template #title>DHCP分配</template>
        </el-menu-item>
        <el-menu-item index="/network-tools">
          <el-icon><Position /></el-icon>
          <template #title>网络工具</template>
        </el-menu-item>
        <el-menu-item index="/serial-tools">
          <el-icon><SetUp /></el-icon>
          <template #title>串口工具</template>
        </el-menu-item>
        <el-menu-item index="/log">
          <el-icon><Document /></el-icon>
          <template #title>日志管理</template>
        </el-menu-item>
        <el-menu-item index="/local-info">
          <el-icon><Place /></el-icon>
          <template #title>本地信息</template>
        </el-menu-item>

      </el-menu>

      <!-- 主题切换 -->
      <div class="theme-switcher" v-if="!isCollapsed">
        <div class="theme-title">主题设置</div>
        <el-select v-model="currentTheme" @change="(val: string) => setTheme(val as ThemeType)" size="small" style="width: 100%">
          <el-option v-for="t in themes" :key="t.value" :label="`${t.icon} ${t.label}`" :value="t.value" />
        </el-select>
      </div>
      <div class="theme-switcher-collapsed" v-else>
        <el-dropdown trigger="click" @command="(val: string) => setTheme(val as ThemeType)">
          <el-icon :size="20" style="color: var(--sidebar-text); cursor: pointer;"><Setting /></el-icon>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="t in themes" :key="t.value" :command="t.value">
                {{ t.icon }} {{ t.label }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-aside>

    <!-- 右侧内容 -->
    <el-main :style="mainStyle" style="padding: 20px; background-color: var(--main-bg); overflow: auto; transition: margin-left 0.3s;">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Expand, Fold, Monitor, TrendCharts, Odometer, View, Place, Connection, Document, Position, SetUp, UploadFilled, Setting } from '@element-plus/icons-vue'
import { useTheme } from '../composables/useTheme'
import type { ThemeType } from '../composables/useTheme'

const router = useRouter()
const route = useRoute()
const activeMenu = ref(route.path)
const isCollapsed = ref(true)
const { currentTheme, setTheme, themes } = useTheme()

// 切换菜单折叠状态
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// 计算侧边栏宽度
const asideWidth = computed(() => {
  return isCollapsed.value ? '64px' : '180px'
})

// 计算主内容区域样式
const mainStyle = computed(() => {
  return {
    'height': 'calc(100vh - 20px)',
    'width': `calc(100% - ${asideWidth.value})`,
    'transition': 'margin-left 0.3s'
  }
})

// 切换菜单
const handleMenuSelect = (index: string) => {
  router.push(index)
}

// 监听路由变化，保持菜单高亮
watch(
    () => route.path,
    (newPath) => {
      activeMenu.value = newPath
    }
)
</script>

<style scoped>
.el-menu-vertical-demo {
  height: 100%;
  border-right: 0;
  font-size: 24px;
  font-weight: 700;
  overflow: hidden; /* 防止菜单出现滚动条 */
}

.el-menu-vertical-demo:not(.el-menu--collapse) {
  width: 200px;
}

.el-menu-vertical-demo .el-menu-item {
  height: 60px;
  line-height: 60px;
  overflow: hidden; /* 防止菜单项出现滚动条 */
}

.el-menu-vertical-demo .el-sub-menu__title {
  font-size: 24px;
  font-weight: 700;
  overflow: hidden; /* 防止子菜单标题出现滚动条 */
}

.el-menu-vertical-demo .el-menu-item.is-active {
  color: var(--sidebar-text-active) !important;
}

/* 折叠按钮样式 */
.collapse-btn {
  height: 50px;
  line-height: 50px;
  text-align: center;
  cursor: pointer;
  color: var(--sidebar-text);
  background-color: var(--sidebar-bg-dark);
  border-bottom: 1px solid var(--sidebar-bg);
  transition: background-color 0.3s;
  overflow: hidden;
}

.collapse-btn:hover {
  background-color: var(--sidebar-hover);
}

.collapse-btn .el-icon {
  vertical-align: middle;
}

/* 菜单折叠时的样式 */
.el-menu--collapse .el-menu-item .el-icon,
.el-menu--collapse .el-sub-menu .el-sub-menu__title .el-icon {
  margin-right: 0;
}

.el-menu--collapse .el-menu-item span,
.el-menu--collapse .el-sub-menu span {
  display: none;
}

.el-menu--collapse .el-sub-menu .el-menu {
  position: absolute;
  left: 64px;
  top: 0;
}

/* 隐藏滚动条样式 */
:deep(.el-main) {
  overflow: auto;
}

/* 隐藏所有滚动条 */
:deep(::-webkit-scrollbar) {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}

:deep(*) {
  scrollbar-width: none !important; /* Firefox */
  -ms-overflow-style: none !important; /* IE 10+ */
}

/* 确保主容器没有滚动条 */
:deep(.el-container) {
  overflow: hidden !important;
}

:deep(.el-aside) {
  overflow: hidden !important;
  position: relative;
}

:deep(.el-main::-webkit-scrollbar) {
  display: none !important;
}

/* 主题切换 */
.theme-switcher {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: var(--sidebar-bg-dark);
  border-top: 1px solid rgba(255,255,255,0.1);
}

.theme-title {
  font-size: 13px;
  color: rgba(255,255,255,0.55);
  margin-bottom: 8px;
}

.theme-switcher :deep(.el-input__wrapper) {
  background: rgba(255,255,255,0.1);
  border-color: transparent;
  box-shadow: none;
}

.theme-switcher :deep(.el-input__inner) {
  color: var(--sidebar-text);
}

.theme-switcher-collapsed {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
}
</style>
