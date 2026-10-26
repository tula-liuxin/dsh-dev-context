# dsh-dev-context

把**本机安装的 DSH** 投影成一份带版本戳的小索引，供任何 AI harness 在开发 DSH 插件前读取。索引不复制文档，只记录「当前版本里权威文件在哪」；DSH 升级后版本戳失配，插件下次启动时自动重建。

## 解决什么问题

别的 AI（或者未来的自己）不知道 DSH 的私有词汇和文档位置，而 GUI 的 `app.asar` 普通工具又读不了。于是：

- **不写文档，写指针**：索引只存绝对路径、版本键和少量不变量，正文永远读安装里的原文。
- **升级不会静默腐化**：版本变化或引用文件消失时标记 `MISSING` 并重建，而不是继续用旧内容。
- **零依赖、零常驻**：生成器是纯 Node 脚本，插件只在激活时比对一次版本戳。

## 生成物

生成到 `~/.dsh/dev-context/`（可用 `contextDir` 覆盖）：

| 文件 | 作用 |
|---|---|
| `INDEX.md` | 约 60 行：版本键、五个心智模型、「任务 → 权威文件」表、刷新命令绝对路径、验证命令、边界 |
| `SKILL.md` | 给非 DSH harness 的薄入口（与包内 `skills/dsh-dev-context/SKILL.md` 一致） |
| `STAMP.json` | 版本戳与引用 hash，用于漂移检测 |
| `SOURCES.json` | 本机包清单、技能清单、解析结果（供脚本/调试，不建议模型整读） |

## 安装

DSH 内（推荐）：

```
plugin_manager install_bundle  target: <本仓库绝对路径>
```

或由市场安装。安装后无需重启：插件激活时会检查并重建索引。

## 配置

在 profile 的 `cordis.patch.yml` 覆盖 `dsh-dev-context` 行：

```yaml
- id: dsh-dev-context
  config:
    contextDir: ''        # 空 = $DSH_HOME/dev-context
    dshHome: ''           # 空 = $DSH_HOME 或 ~/.dsh
    autoRefresh: true     # false = 只告警不重建
```

## 轻量检查

```
node scripts/check.mjs            # 只读检查；0 = 可用，1 = 缺失/过期
node scripts/check.mjs --update   # 重建
node scripts/check.mjs --json     # 机器可读
```

可覆盖 `--dsh-home`、`--context-dir`、`--cli-root`。脚本不启动 DSH，约一秒内完成。

## 给非 DSH harness

把 `skills/dsh-dev-context/SKILL.md` 装进该 harness 的技能/指令目录即可。Skill 会告诉它：读 `~/.dsh/dev-context/INDEX.md`，必要时跑 `check.mjs --update`，然后只读索引点名的文件。整个接口就是「文件 + 一条 node 命令」。

## 版本与触发

版本键同时记录两项，任一变化即重建：

- **桌面运行时版本**：`~/.dsh/dsh-runtimes/*/runtime.json` 的 `desktopVersion`
- **可读安装版本**：npm `dsh` 包的 `version`

索引只引用可读安装；`app.asar` 只作为版本键，不作为引用目标。

## 卸载

```
plugin_manager remove_bundle  target: dsh-dev-context
```

索引目录 `~/.dsh/dev-context/` 可保留，删除即可。

## 隐私

生成物只用于**本机**：`INDEX.md` / `SOURCES.json` / `STAMP.json` 含本机绝对路径和包清单，不要提交到公开仓库或随插件分发。插件源码里没有这些内容。

## 开发

```
npm test        # node --test tests/*.test.mjs
npm run check   # 三个入口文件的语法检查
```

设计约束：生成是确定性的；`status()` 只读不写；任何解析失败都表现为 `MISSING`，不静默降级。

## 变更记录

- **0.1.1** — 索引因以下任一项重建：插件生成器版本、DSH 版本、可读安装位置、引用文件内容 hash、生成物缺失。INDEX 里写入 `check.mjs` 绝对路径与同目录 `SKILL.md` 说明。
- **0.1.0** — 首个版本：版本键（桌面运行时 + 可读安装）、17 条任务→文件解析、`MISSING` 漂移标记、零依赖检查脚本、内嵌 skill。
