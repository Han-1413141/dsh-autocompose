# 配置与命令行

首次使用和主环境安装步骤见 [README](../README.md)。本文说明候选来源、模型配置、命令行和数据保存位置。

## DSH 插件配置

在当前 profile 的 `cordis.patch.yml` 中覆盖需要调整的字段：

```yaml
- id: autocompose
  config:
    timeoutMs: 600000
    autoDiscover: true
    # catalog: C:/path/to/catalog.json
    envKeys: [DEEPSEEK_API_KEY]
```

| 字段 | 默认值 | 用途 |
| --- | --- | --- |
| `root` | `$DSH_HOME/autocompose` | 保存记录、备份与临时运行环境 |
| `catalog` | 未设置 | 固定候选目录 JSON 文件路径 |
| `autoDiscover` | `true` | 能力不足时查询 npm；陌生任务使用原文搜索 |
| `timeoutMs` | `600000` | 后台任务或独立窗口准备阶段的超时，单位毫秒，范围 `1000`–`7200000`；已就绪窗口持续运行 |
| `windowMode` | `auto` | Desktop 宿主打开客户端，Web 宿主打开网页；可指定 `desktop` 或 `web` |
| `desktopExecutable` | 当前 Desktop 程序 | 从 Web 宿主启动客户端时，填写官方 DSH 可执行文件的完整路径 |
| `provider` | `deepseek-official` | 临时运行使用的 provider |
| `model` | `deepseek-v4-flash` | 临时运行使用的模型 |
| `envKeys` | `[DEEPSEEK_API_KEY]` | 在基础环境变量之外额外转发的变量名，填写名称而非凭据值 |

`root` 控制 AutoCompose 的数据目录，包括记录、备份和临时运行环境。主环境安装始终使用当前宿主提供的 profile 目录，不通过配置或浏览器参数选择另一个安装目标。

## 客户端窗口

在官方 DSH Desktop 中无需额外配置。默认 `windowMode: auto` 会复用当前客户端的可执行文件，清除子进程的 Electron Node 模式，并使用各自的 `DSH_HOME`、`desktop-data` 目录和动态端口。

从 Web 宿主打开本机客户端时，填写实际安装路径：

```yaml
- id: autocompose
  config:
    windowMode: desktop
    desktopExecutable: C:/实际安装目录/DeepSeek Harness.exe
```

macOS 填写 `.app/Contents/MacOS/` 下的可执行文件，而非 `.app` 目录。Windows 官方客户端已做实际集成验证；macOS 客户端尚未实测。指定 `desktop` 后，找不到客户端或版本不符会报错，不会退回网页。客户端必须与本插件适配的 DSH 版本一致。

右上角关闭按钮遵循 DSH 的托盘行为；“重新打开”通过相同的客户端数据目录唤回对应实例，不会创建重复环境。“关闭环境”停止它及其子进程。独立客户端退出后，当前记录不再提供唤回入口。

## 模型与凭据

生成方案、发现插件和安装到主环境都不调用模型。后台一次性任务通过官方 SDK 启动 `sdk` profile；独立客户端启动 `desktop` profile，网页窗口启动 `web` profile，并将输入的任务提交到一个可继续对话的会话中。两者均复用现有 DSH `0.2.0-rc.2` 的程序文件，使用独立的 `DSH_HOME`。

默认 provider 读取 `DEEPSEEK_API_KEY`。该变量必须存在于启动宿主的进程环境中，才能转发给子进程；只在另一个终端中设置变量，不会改变已经运行的 Desktop 进程。AutoCompose 不复制原 DSH 的凭据文件或登录状态。

`provider` 和 `model` 选择独立环境中实际存在的 provider 与模型。独立窗口缺少模型凭据时，可以在其 DSH 设置中配置，然后继续对话；主环境的自定义 provider 不会自动复制。每次启动创建新环境，正在运行的环境可重新打开；已关闭的保留目录目前不能直接恢复运行。没有可用模型时，仍可生成方案和安装到主环境。

任务目录的只读或允许修改模式通过 DSH 工具权限控制；独立配置目录不等于操作系统安全沙箱。

## 固定候选目录

创建 JSON 文件，在插件配置中设置 `catalog`，或向 CLI 传入 `--catalog <path>`。以下包名是占位符，需替换成实际发布到 npm 的 DSH 插件：

```json
{
  "schemaVersion": 1,
  "plugins": [
    { "name": "your-pdf-plugin", "version": "1.0.0", "capabilities": ["pdf"] }
  ]
}
```

版本必须精确，包必须声明 DSH bundle。目录中的能力由维护者声明，AutoCompose 仍会从 npm 核对包元数据和兼容性。

严格限定候选范围时，设置 `autoDiscover: false`，或传入 CLI 的 `--no-discovery`。这会关闭补充搜索，仍会读取固定目录中指定 npm 包的元数据。未提供目录且关闭发现时，只使用内置能力，规划过程不联网。

任务识别支持 `pdf / web / code / git / browser / vision / memory / shell / math / research / latex / data-analysis / spreadsheet / writing / presentation`。例如“我要进行数学研究”会搜索 `math` 和 `research`。无法识别的任务按原文搜索，找不到时保留 `task-specific` 缺项。CLI 的 `--capabilities` 和 DSH 工具的 `capabilities` 可以覆盖推断。

自动发现最多搜索六种缺失能力，每种从 npm 的 `dsh-plugin` 和 `deepseek-harness` 标签查询候选，最多检查八个精确版本；相同包只读取一次。过滤无关说明、插件市场、缺少 DSH bundle 的包，并在规划时排除已知版本冲突。候选未声明能力时会根据精确版本说明推断，页面明确标为“搜索候选”。只发布在 GitHub、未发布 npm 包的插件暂不在自动安装范围内。

## 命令行

查看已发布版本的帮助：

```powershell
npx --yes --package=dsh-autocompose@0.5.0 dsh-autocompose --help
```

以下命令在源码仓库中运行，先执行 `npm ci --ignore-scripts` 与 `npm run build`：

```powershell
# 只生成方案；能力不足时补充搜索。
node lib/cli.js plan --task "提取 PDF 内容并检查代码仓库" --cwd C:/work/project

# 仅使用内置能力，不补充搜索。
node lib/cli.js plan --task "检查代码仓库" --no-discovery

# 用实际方案 ID 替换 <planId>，审阅方案后执行。
node lib/cli.js run --id <planId> --yes
node lib/cli.js run --id <planId> --mode workspace-write --yes

# 保存和复用精确版本组合；use-preset 会执行任务。
node lib/cli.js save-preset --id <planId> --preset code-review
node lib/cli.js use-preset --preset code-review --task "检查另一个代码问题" --yes

# 只查询候选，不安装、不调用模型。
node lib/cli.js discover --capability pdf
```

CLI 默认状态目录为当前目录下的 `.dsh-autocompose`，用 `--root` 指定后，后续操作也需使用同一路径。`--cwd` 仅在 `plan` 时指定任务目录。`run` 使用方案保存的目录，`use-preset` 使用预设保存的目录；更换目录需重新生成方案。`--keep` 保留临时运行环境；`--timeout` 默认为 `600000` 毫秒。

DSH 页面与工具自动使用宿主安装目录。单独通过 `npx` 执行任务时，可用 `--install-anchor <现有DSH安装中的package.json>` 指定已有运行时。运行时缺失或版本不匹配时会报错，不会自动下载整套 DSH。查看帮助、规划和发现插件无需这个参数。

**安装到主环境通过 DSH 页面或 `autocompose` 工具操作。** 独立 CLI 不提供主环境安装命令，避免从任意工作目录推断安装目标。

## DSH 工具

工具名：`autocompose`。方案限定在创建它的会话中；页面方案和其他会话的方案不能直接跨会话执行。

| `action` | 主要参数 | 结果 |
| --- | --- | --- |
| `assemble` | `task`，可选 `capabilities`、`destination`、`mode` | 自动搜索、规划并经 DSH 批准安装。默认 `destination: main`；`window` 创建可继续对话的独立环境，Desktop 直接打开客户端并返回环境记录，Web 返回打开链接 |
| `reveal_environment` | `environmentId` | 唤回当前会话的独立客户端；Web 返回打开链接 |
| `close_environment` | `environmentId` | 停止当前会话创建的独立环境，保留文件 |
| `plan` | `task`，可选 `capabilities` | 返回方案，其中 `id` 在后续调用中作为 `planId` |
| `discover` | `task` 填写中英文关键词 | 返回候选，不安装 |
| `run` | `planId`，可选 `mode` | 批准后在临时环境执行任务 |
| `save_preset` | `planId`、`preset` | 批准后保存精确版本组合 |
| `install_preview` | `planId` | 返回目标环境、逐项变更和兼容性结果；返回的 `id` 在安装时作为 `previewId` |
| `install` | `previewId` | 批准后安装并启用到当前环境，返回逐项结果 |

安装预览只能使用一次。宿主重启、预览被使用、主环境插件或配置变化后，需要重新预览；插件发布内容变化后，需要重新生成方案。工具安装使用 DSH 的权限与批准服务，不接受模型自行声明的批准参数。

## 记录与恢复

状态目录包含：

| 子目录 | 内容 |
| --- | --- |
| `plans` | 任务、工作目录、插件版本和方案指纹 |
| `presets` | 可复用的固定版本组合 |
| `history` | 临时运行结果、阶段和清理状态 |
| `environments` | 独立窗口的状态、插件、会话与目录；不保存访问令牌 |
| `runs` | 正在使用或主动保留的临时环境 |
| `installations` | 主环境安装进度、每个插件的状态和重启要求 |
| `install-backups` | 主环境变更前的包清单、锁文件和配置文本 |

安装备份只保存相关配置文件，不包含插件代码或整个 DSH 目录，也不自动整体回滚成功的安装。配置文件中可能包含私有内容，排障时不要直接把备份公开上传。

CLI 的后台临时环境默认删除，传入 `--keep` 后保留。清理失败或无法确认子进程退出时会保留目录并记录原因。主环境中已经成功安装的插件持续保留，可在 DSH 插件管理中停用或卸载。安装中断后重新预览，会依据当时实际状态区分新增、版本替换、启用与复用。

页面默认勾选保留文件与会话；取消后，在“关闭环境”或后台任务结束时清理。退出宿主时停止其独立窗口进程并保留目录。关闭窗口不会停止独立环境，可以通过“重新打开”继续；客户端模式唤回原实例，网页模式返回当前进程的访问链接。
