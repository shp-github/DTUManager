<template>
  <el-container style="height: 100vh; overflow: hidden;">
    <!-- 左侧菜单 -->
    <el-aside :width="asideWidth" style="background-color: #001529; color: #fff; transition: width 0.3s;">
      <!-- 折叠按钮 -->
      <div class="collapse-btn" @click="toggleCollapse">
        <el-icon :size="20">
          <component :is="isCollapsed ? 'Expand' : 'Fold'"></component>
        </el-icon>
      </div>

      <el-menu
          :default-active="activeMenu"
          :collapse="isCollapsed"
          :collapse-transition="false"
          class="el-menu-vertical-demo"
          background-color="#001529"
          text-color="#fff"
          active-text-color="#409EFF"
          router
          @select="handleMenuSelect"
      >
        <el-menu-item index="/devices">
          <el-icon><Monitor /></el-icon>
          <template #title>设备列表</template>
        </el-menu-item>
        <el-menu-item index="/resource">
          <el-icon><DataLine /></el-icon>
          <template #title>资源监控</template>
        </el-menu-item>
        <el-menu-item index="/log">
          <el-icon><Document /></el-icon>
          <template #title>日志</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 右侧内容 -->
    <el-main :style="mainStyle" style="padding: 20px; background-color: #f5f5f5; overflow: auto; transition: margin-left 0.3s;">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Expand, Fold, Monitor, DataLine, Document } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const activeMenu = ref(route.path)
const isCollapsed = ref(true)

// 切换菜单折叠状态
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// 计算侧边栏宽度
const asideWidth = computed(() => {
  return isCollapsed.value ? '64px' : '200px'
})

// 计算主内容区域样式
const mainStyle = computed(() => {
  return {
    'height': 'calc(100vh - 20px)',
    'margin-left': isCollapsed.value ? '64px' : '200px',
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
  font-size: 20px;
  font-weight: 600;
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
  font-size: 20px;
  font-weight: 600;
  overflow: hidden; /* 防止子菜单标题出现滚动条 */
}

.el-menu-vertical-demo .el-menu-item.is-active {
  color: #409EFF !important;
}

/* 折叠按钮样式 */
.collapse-btn {
  height: 50px;
  line-height: 50px;
  text-align: center;
  cursor: pointer;
  color: #fff;
  background-color: #002140;
  border-bottom: 1px solid #001529;
  transition: background-color 0.3s;
  overflow: hidden; /* 防止按钮出现滚动条 */
}

.collapse-btn:hover {
  background-color: #003366;
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

:deep(html) {
  overflow: -moz-scrollbars-none; /* 旧版 Firefox */
}

/* 确保主容器没有滚动条 */
:deep(.el-container) {
  overflow: hidden !important;
}

:deep(.el-aside) {
  overflow: hidden !important;
}

:deep(.el-main) {
  overflow: auto;
  scrollbar-width: none !important; /* Firefox */
  -ms-overflow-style: none !important; /* IE 10+ */
}

:deep(.el-main::-webkit-scrollbar) {
  display: none !important;
}
</style>