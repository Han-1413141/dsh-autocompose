# 故障覆盖表

本表将官方仓库中的公开故障记录转为可重复的测试。检索与运行日期：2026-09-30；实际宿主版本：DSH 0.2.0-rc.2。历史讨论描述当时的版本，不代表今天仍有同一故障，也不代表本项目逐项复现了原帖的全部环境。

0.3.0 新增的主环境安装、部分失败和 Windows 文件占用测试见[验证记录](validation.md#030-主环境安装与文档更新)。以下公开案例部分保留最初两个插件联合验证的范围。

## 从公开案例补充的测试

| 公开情况与来源 | 本项目对应验证 | 已覆盖范围与结果 |
| --- | --- | --- |
| 设置服务移除导出，插件 import 失败：[讨论 #5599](https://github.com/deepseek-ai/deepseek-harness/discussions/5599) | `missing-export` 夹具实际导入 `settingsNamespace` | 真实 DSH 导入失败；当前版本允许宿主降级启动，离线停用后正常 |
| latest/next 依赖接口不一致：[讨论 #5864](https://github.com/deepseek-ai/deepseek-harness/discussions/5864) | `old-api`、版本范围与旧核心直接依赖测试 | 声明不兼容会阻止组合并进入隔离计划；实际错误接口也有加载失败验证，未逐版本复现原帖 |
| 配置验证在容错设置前失败：[讨论 #4145](https://github.com/deepseek-ai/deepseek-harness/discussions/4145) | `invalid-config` 使用错误字段类型 | 真实 Schema 校验失败及离线修复；没有假定任意配置都能自动改写 |
| 一个插件加载失败影响 profile：[讨论 #6134](https://github.com/deepseek-ai/deepseek-harness/discussions/6134) | 加载抛错、进程退出、async apply 挂起三个夹具 | 在线观察连续失败；宿主退出/挂起时，终止临时进程后离线停用，再次启动成功 |
| 热更新后重复注册工具：[讨论 #1610](https://github.com/deepseek-ai/deepseek-harness/discussions/1610) | 重复工具/服务/顶层 ID 检查，两个真实 Cordis 服务提供者竞争 | 实际服务冲突可隔离，保留已运行的一方；没有声称复现旧版模块缓存问题 |
| 本地 link 路径移动、包结构变化：[讨论 #8032](https://github.com/deepseek-ai/deepseek-harness/discussions/8032) | 创建真实链接后移走源目录；损坏 manifest、patch、client 文件 | 定位缺失或错误内容；离线停用保存原文，恢复前重新校验 |
| 严格 RPC 编解码声明缺少工厂：[讨论 #7891](https://github.com/deepseek-ai/deepseek-harness/discussions/7891) | 调用真实 Typert 验证器分别验证新旧描述 | 旧声明被拒绝，本插件严格描述通过；真实 Web RPC 交互成功 |
| 注入依赖未就绪导致页面空白：[讨论 #7891](https://github.com/deepseek-ai/deepseek-harness/discussions/7891) | 真实依赖插件等待；本插件远程服务子作用域 | 等待状态不算崩溃；前置 bundle 隔离后联动处理；修正本插件注入作用域 |
| 非平铺依赖或构建阶段解析失败：[讨论 #5683](https://github.com/deepseek-ai/deepseek-harness/discussions/5683)、[#2710](https://github.com/deepseek-ai/deepseek-harness/discussions/2710) | 正式安装使用官方 CLI；扫描支持安装锚点，缺失资源有文件测试 | 不自行拼装依赖树；未对所有 pnpm 布局逐一实测 |
| 依赖生命周期脚本被忽略：[讨论 #2230](https://github.com/deepseek-ai/deepseek-harness/discussions/2230) | 安装保留 `--ignore-scripts`，失败写入运行记录 | 明确记录边界；未授权或自动运行第三方构建脚本，也未实测所有原生模块 |
| 写入冲突、占用等 Windows 问题：[讨论 #8032](https://github.com/deepseek-ai/deepseek-harness/discussions/8032) | 真实占用官方共享锁，救援写入被拒绝，释放后成功 | 覆盖跨进程锁，未模拟系统杀毒锁定、磁盘损坏或全部 EBUSY 情况 |
| Desktop 卸载阶段异常：[讨论 #6132](https://github.com/deepseek-ai/deepseek-harness/discussions/6132) | 真实 Web 卸载 + 管理接口失败/重启状态替身 | Web 卸载确认；失败时保留隔离和恢复资料，不冒报成功；Desktop 原帖未复现 |

## 额外覆盖的失败和恢复路径

| 类别 | 已实现的检查或测试 | 验证方式 |
| --- | --- | --- |
| 版本与平台 | 预发布范围、Node/系统限制、非法范围、旧核心重复依赖 | 自动测试 |
| 未声明兼容性 | 只警告，不凭未知状态停用 | 自动测试、Web |
| 插件依赖 | 缺失依赖、依赖版本、循环依赖、隔离后的连带停用 | 自动测试、真实 Web |
| 正常对照 | 合法 ID 定向覆盖、完整前端产物、正常服务提供者不被误报 | 自动测试、真实 Web |
| 插件包损坏 | 缺失/非法 package.json、包名不符、缺失/非法 patch、越界路径、缺失 client | 真实临时文件 |
| 处理次序 | 备份先于停用、停用失败不得卸载、确认卸载结果 | 自动测试、真实 Web |
| 受保护组件 | 官方组件与管理插件不能自动移除，故障作为未解决问题返回 | 自动测试 |
| 暂态故障 | 连续两次才隔离；升级后失败次数重算 | 自动测试、真实 Web |
| 检查后发生变化 | 旧检查指纹拒绝执行；外部更新结束旧隔离记录 | 自动测试 |
| 恢复 | 冲突仍在拒绝恢复；修复后启用；版本不符拒绝；保留后续配置编辑 | 自动测试、真实 Web |
| 操作中断 | prepared 状态恢复、重复恢复、伪造记录、下一次启动继续待卸载 | 自动测试 |
| 元数据请求 | 404、网络异常、无效 JSON、身份变化、无 bundle、缺失完整性字段 | 受控 fetch 替身 |
| 制品变化 | 精确版本元数据再次查询的完整性值发生变化 | 元数据比较测试；执行器在安装前比对并拒绝变化，未做真实 npm 篡改实验 |
| 执行参数 | 拒绝安装指令混入包名、非精确版本和非法能力名 | 自动测试 |
| 组合规划 | 缺失能力不能运行、被改写的计划拒绝执行、换任务后预设重新规划 | 自动测试、Web |
| 任务取消 | 终止普通子进程和正在请求模型的真实 SDK，清理所有权目录 | 自动测试、真实 SDK |
| 运行历史 | 完成、取消、中断、其他进程仍在执行、损坏历史文件 | 自动测试、Web |
| 主环境安装 | 新增、替换、启用、复用、过期预览、会话归属、声明变化、依赖顺序、部分失败、构建授权和取消 | 自动测试、真实 Plugin Manager、Web |
| 安装后冲突 | 实际包声明与方案不一致、重复条目，均停止后续启用 | 自动测试、真实 Plugin Manager |
| Windows 文件占用 | 记录文件被读取者占用时，保留完整临时文件并有限重试原子替换 | 真实 Windows 文件句柄、Windows CI |
| 清理边界 | 检查路径归属与所有权标记，不传入未授权凭据变量 | 自动测试 |
| 页面错误 | 恢复错误提示持续可见、原生 RPC 调用、页面错误边界 | Web 交互、代码实现；未穷举所有 React 异常 |
| 升级预检 | 只读；假设基础组件同步升级，保留附加插件约束 | 自动测试、Web |

## 尚不能自动解决的情况

- **第三方浏览器代码的任意错误**：旧图标或被移除前端接口可能只在打开某页面时触发。扫描能发现缺失产物，不能证明每个业务界面可运行。[讨论 #8032](https://github.com/deepseek-ai/deepseek-harness/discussions/8032)
- **用户数据格式迁移**：会话序列化格式升级需要对应迁移逻辑；不会通过卸载插件擅自改写会话。[讨论 #7556](https://github.com/deepseek-ai/deepseek-harness/discussions/7556)
- **宿主核心存储损坏**：工作区字段校验错误属于宿主数据问题，受保护组件不能当普通插件自动卸载。[讨论 #6781](https://github.com/deepseek-ai/deepseek-harness/discussions/6781)
- **任意原生崩溃、内存耗尽、CPU 死循环**：Host 插件同进程运行，Guardian 不能在进程已退出后继续工作。本次验证退出与异步挂起后的离线救援，未实现操作系统级监护。
- **所有未来版本和所有平台**：声明检查可提前发现已知约束，但未知 API 改动需要新的真实加载测试。本次运行环境为 Windows，未将 CI 配置当作 Linux/macOS 通过证据。

## 复现入口

以下记录来自两个插件的联合验证。AutoCompose 仓库提供 `test:host`，Compatibility Guardian 仓库提供 `test:conflicts` 和 `test:startup`；两者均提供 `test` 与 `preview`。在对应仓库先安装依赖并构建，再运行相应命令：

```powershell
npm test
npm run test:host
npm run test:conflicts
npm run test:startup
npm run preview
```

九个故障与对照插件见[插件说明](https://github.com/Han-1413141/dsh-compat-guardian/blob/master/tests/fixtures/plugins/README.md)，本次结果见[验证记录](validation.md)。所有真实故障实验使用单独临时 profile，模型调用使用本地替身。

## 独立仓库

本仓库为 dsh-autocompose。另一插件及对应测试见 [dsh-compat-guardian](https://github.com/Han-1413141/dsh-compat-guardian)；两个仓库的共享检查测试有重叠，不将测试总数简单相加作为新增覆盖。
