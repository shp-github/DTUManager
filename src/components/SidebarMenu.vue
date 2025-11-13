<template>
  <el-container style="height: 100vh">
    <!-- 左侧菜单 -->
    <el-aside width="200px" style="background-color: #001529; color: #fff">
      <el-menu
          :default-active="activeMenu"
          class="el-menu-vertical-demo"
          background-color="#001529"
          text-color="#fff"
          active-text-color="#409EFF"
          router
          @select="handleMenuSelect"
      >
        <el-menu-item index="/dtu">DTU 配置</el-menu-item>
        <el-menu-item index="/resource">资源监控</el-menu-item>
        <el-menu-item index="/log">日志</el-menu-item>

      </el-menu>
    </el-aside>

    <!-- 右侧内容 -->
    <el-main style="padding: 20px; background-color: #f5f5f5">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const activeMenu = ref(route.path)

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
  font-size: 20px;       /* 字体更大 */
  font-weight: 600;      /* 加粗 */
}

.el-menu-vertical-demo .el-menu-item {
  height: 60px;          /* 高度加大 */
  line-height: 60px;     /* 文字垂直居中 */
}

.el-menu-vertical-demo .el-sub-menu__title {
  font-size: 20px;
  font-weight: 600;
}

.el-menu-vertical-demo .el-menu-item.is-active {
  color: #409EFF !important; /* 高亮颜色 */
}
</style>