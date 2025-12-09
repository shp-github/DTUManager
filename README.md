



![1.png](image/1.png)
![2.png](image/2.png)
![3.png](image/3.png)
![4.png](image/4.png)
![5.png](image/5.png)






node:18

# 配置 npm 镜像为淘宝镜像（国内）
yarn config set registry https://registry.npmmirror.com

# 配置 Electron 国内镜像
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

yarn config set ELECTRON_MIRROR https://npmmirror.com/mirrors/electron/

# 单独安装
npm install electron@29.4.6 --save-dev


# 安装命令
yarn install


打包桌面程序

electron-builder --win --x64



power-shell运行
npx electron-builder --win --x64



yarn install



