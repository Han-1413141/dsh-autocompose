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
| `autoDiscover` | `true` | 能力不足时补充查询 npm 候选 |
| `timeoutMs` | `600000` | 单次临时任务超时，单位毫秒，范围 `1000`–`7200000` |
| `provider` | `deepseek-official` | 临时运行使用的 provider |
| `model` | `deepseek-v4-flash` | 临时运行使用的模型 |
| `envKeys` | `[DEEPSEEK_API_KEY]` | 在基础环境变量之外额外转发的变量名，填写名称而非凭据值 |

`root` 控制 AutoCompose 的数据目录，包括记录、备份和临时运行环境。主环境安装始终使用当前宿主提供的 profile 目录，不通过配置或浏览器参数选择另一个安装目标。

## 模型与凭据

生成方案、发现插件和安装到主环境都不调用模型。临时运行通过官方 SDK 启动独立子进程，复用现有 DSH `0.2.0-rc.2` 的程序文件，同时使用独立的 `DSH_HOME` 与 `sdk` profile。

默认 provider 读取 `DEEPSEEK_API_KEY`。该变量必须存在于启动宿主的进程环境中，才能转发给子进程；只在另一个终端中设置变量，不会改变已经运行的 Desktop 进程。AutoCompose 不复制原 DSH 的凭据文件或登录状态。

`provider` 和 `model` 只选择本次临时环境中实际存在的 provider 与模型。每次运行都会新建环境，当前没有导入宿主 provider 配置或指定已有临时环境的选项。没有可用模型时，仍可生成方案和安装到主环境。

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

任务识别使用中文和英文关键词，支持 `pdf / web / code / git / browser / vision / memory / shell`。CLI 的 `--capabilities` 和 DSH 工具的 `capabilities` 可以覆盖关键词推断。自动发现最多搜索四种缺失能力，每种能力最多检查五个候选；搜索说明不等于功能验证。

## 命令行

查看已发布版本的帮助：

```powershell
npx --yes --package=dsh-autocompose@0.3.0 dsh-autocompose --help
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
| `plan` | `task`，可选 `capabilities` | 返回方案，其中 `id` 在后续调用中作为 `planId` |
| `discover` | `task` 填写英文能力名 | 返回候选，不安装 |
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
| `runs` | 正在使用或主动保留的临时环境 |
| `installations` | 主环境安装进度、每个插件的状态和重启要求 |
| `install-backups` | 主环境变更前的包清单、锁文件和配置文本 |

安装备份只保存相关配置文件，不包含插件代码或整个 DSH 目录，也不自动整体回滚成功的安装。配置文件中可能包含私有内容，排障时不要直接把备份公开上传。

正常结束的临时环境默认删除；主动保留、清理失败或无法确认子进程退出时会保留目录并记录原因。主环境中已经成功安装的插件持续保留，可在 DSH 插件管理中停用或卸载。安装中断后重新预览，会依据当时实际状态区分新增、版本替换、启用与复用。
