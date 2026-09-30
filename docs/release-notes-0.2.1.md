# dsh-autocompose 0.2.1

修复 GitHub 源码安装因缺少编译文件、需要运行构建脚本而被 pnpm 拒绝的问题。仓库现在直接提供编译后的插件，安装不需要添加构建白名单。

SDK 客户端随插件编译，执行任务时复用已有 DSH 0.2.0-rc.2，避免安装插件时传递下载整套宿主并触发依赖构建限制。独立 CLI 增加 `--install-anchor` 参数。

在 DSH 插件管理页输入 `dsh-autocompose@0.2.1`，或粘贴仓库地址。Desktop 命令行：

```powershell
dsh plugin --profile desktop add dsh-autocompose@0.2.1 --save-exact --ignore-scripts
```

Web 用户将 `desktop` 改为 `web`。
