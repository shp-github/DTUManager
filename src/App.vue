<template>
  <el-container style="height: 100vh">
    <!-- 左侧菜单 -->
    <el-aside width="200px" style="background-color: #001529; color: #fff">
      <el-menu
          default-active="/log"
          class="el-menu-vertical-demo"
          background-color="#001529"
          text-color="#fff"
          active-text-color="#409EFF"
          router
      >
        <el-menu-item index="/log">日志</el-menu-item>
        <el-sub-menu index="/dtu">
          <template #title>DTU 配置</template>
          <el-menu-item index="/dtu/net">网络参数</el-menu-item>
          <el-menu-item index="/dtu/serial">串口参数</el-menu-item>
          <el-menu-item index="/dtu/modbus">Modbus 映射</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/resource">资源监控</el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 右侧内容 -->
    <el-main style="padding: 20px; background-color: #f5f5f5">
      <router-view />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
// 这里暂时不需要额外逻辑
</script>

<style>
.el-menu-vertical-demo {
  height: 100%;
  border-right: 0;
}
</style>
