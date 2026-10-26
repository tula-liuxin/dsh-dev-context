/**
 * dsh-dev-context — 把「本机安装的 DSH」投影成一份小索引。
 *
 * 设计约束（也是它能在升级后保持稳定的原因）：
 *  - 索引不存 DSH 正文，只存**解析后的绝对路径** + 版本戳 + 少量不变量；
 *  - 路径失效时标记 MISSING，而不是拿旧内容顶替；
 *  - 生成是确定性的：同一份安装 + 同一份代码 → 同一份索引。
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const INDEX_FORMAT = 1
export const GENERATOR = 'dsh-dev-context/0.1.0'

const SCOPE = join('node_modules', '@deepseek-ai')
export const SKILL_RELATIVE = join('skills', 'dsh-dev-context', 'SKILL.md')

/**
 * 「任务 → 权威文件」的解析表。`paths` 相对安装内的 `@deepseek-ai` 目录，
 * 按顺序取第一个存在的；全部不存在就标记 MISSING（DSH 可能改了布局）。
 */
export const RESOLVERS = [
  {
    id: 'skill.plugin-authoring',
    title: '插件开发总入口（技能）',
    paths: ['dsh-agent-preset/skills/cordis-plugin-development/SKILL.md'],
    note: '先读这个，再按需读下面的 references；不要凭记忆写插件',
  },
  {
    id: 'skill.host-plugin',
    title: 'Host 插件：清单、patch、导出形式、安装观察',
    paths: ['dsh-agent-preset/skills/cordis-plugin-development/references/host-plugin.md'],
  },
  {
    id: 'skill.ui-plugin',
    title: 'Web UI 插件：Client 清单、模块加载、slot 注册',
    paths: ['dsh-agent-preset/skills/cordis-plugin-development/references/ui-plugin.md'],
  },
  {
    id: 'skill.mcp-bundle',
    title: 'MCP：用配置型 bundle 接一个 MCP server',
    paths: ['dsh-agent-preset/skills/cordis-plugin-development/references/mcp-bundle.md'],
  },
  {
    id: 'skill.practices',
    title: '扩展点选择、状态/性能、升级稳定性',
    paths: ['dsh-agent-preset/skills/cordis-plugin-development/references/practices.md'],
  },
  {
    id: 'skill.verification',
    title: '页面/面板验证；无浏览器控制时怎么检查',
    paths: ['dsh-agent-preset/skills/cordis-plugin-development/references/verification.md'],
  },
  {
    id: 'skill.user-actions',
    title: 'UI 动作与 agent tool 共享操作',
    paths: ['dsh-agent-preset/skills/cordis-plugin-development/references/user-actions.md'],
  },
  {
    id: 'templates.decoration',
    title: 'UI 插件模板（可直接抄的 package/patch/client）',
    paths: ['dsh-agent-preset/skills/cordis-plugin-development/templates/decoration/package.json'],
  },
  {
    id: 'templates.mcp',
    title: 'MCP bundle 模板',
    paths: ['dsh-agent-preset/skills/cordis-plugin-development/templates/mcp/package.json'],
  },
  {
    id: 'composition.editing',
    title: '改 agent preset / Cordis 组合',
    paths: ['dsh-agent-preset/skills/editing-cordis-compositions/SKILL.md'],
  },
  {
    id: 'composition.reference',
    title: 'Loader YAML 方言；可安装插件包清单的入口',
    paths: ['dsh-agent-preset/skills/cordis-composition-reference/SKILL.md'],
  },
  {
    id: 'composition.packages',
    title: '全部可安装插件包（较大，按需读）',
    paths: ['dsh-agent-preset/skills/cordis-composition-reference/references/packages.md'],
  },
  {
    id: 'pkg.plugin-manager',
    title: '插件安装/启用/移除的真实行为',
    paths: ['dsh-plugin-manager/README.md'],
  },
  {
    id: 'pkg.skill',
    title: 'Skill registry 与注册 API',
    paths: ['dsh-skill/README.md'],
  },
  {
    id: 'pkg.skill-filesystem',
    title: '本地技能目录的扫描规则与优先级',
    paths: ['dsh-skill-filesystem/README.md'],
  },
  {
    id: 'pkg.agent-instructions',
    title: 'AGENTS.md / CLAUDE.md 如何进入 DSH 上下文',
    paths: ['dsh-agent-instructions/README.md'],
  },
  {
    id: 'pkg.harness-dev-context',
    title: 'DSH checkout / GUI URL 的运行时上下文',
    paths: ['dsh-harness-dev-context/README.md'],
  },
]

function expandHome(value) {
  if (typeof value !== 'string' || value === '') return value
  if (value === '~') return homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2))
  return value
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function readText(file) {
  try {
    return await readFile(file, 'utf8')
  } catch {
    return null
  }
}

async function listDirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  } catch {
    return []
  }
}

/** 候选的「可读安装」根目录，按优先级排列。 */
export function defaultCliRoots(env = process.env) {
  const roots = []
  const push = (value) => {
    if (value && !roots.includes(value)) roots.push(value)
  }
  push(env.DSH_INSTALL_ROOT)
  if (process.platform === 'win32') {
    if (env.APPDATA) push(join(env.APPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh'))
    if (env.LOCALAPPDATA) push(join(env.LOCALAPPDATA, 'npm', 'node_modules', '@deepseek-ai', 'dsh'))
  }
  if (env.HOME) push(join(env.HOME, '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh'))
  if (env.USERPROFILE) push(join(env.USERPROFILE, '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh'))
  return roots
}

function isInstallRoot(root) {
  return Boolean(root) && existsSync(join(root, 'package.json'))
}

/** 解析生成所需的全部路径。完全显式，便于测试注入。 */
export function resolvePaths(env = process.env, config = {}) {
  const dshHome = expandHome(config.dshHome || env.DSH_HOME || join(homedir(), '.dsh'))
  const contextDir = expandHome(config.contextDir || join(dshHome, 'dev-context'))
  let cliRoot = config.cliRoot ? expandHome(config.cliRoot) : null
  if (!cliRoot) cliRoot = defaultCliRoots(env).find(isInstallRoot) ?? null
  if (!isInstallRoot(cliRoot)) cliRoot = null
  return { dshHome, contextDir, cliRoot: cliRoot ?? null }
}

/** 版本键：桌面运行时版本 + 可读安装版本。任一变化都触发重建。 */
export async function readVersions(paths) {
  const desktop = []
  const runtimesRoot = join(paths.dshHome, 'dsh-runtimes')
  for (const name of await listDirs(runtimesRoot)) {
    const runtimePath = join(runtimesRoot, name, 'runtime.json')
    const runtime = await readJson(runtimePath)
    if (runtime?.desktopVersion) desktop.push({ name, version: runtime.desktopVersion, path: runtimePath })
  }
  const primary = desktop.find((entry) => entry.name === 'dsh-primary-runtime') ?? desktop[0] ?? null
  const cliManifest = paths.cliRoot ? await readJson(join(paths.cliRoot, 'package.json')) : null
  return { desktop: primary, allDesktop: desktop, cliVersion: cliManifest?.version ?? null }
}

/** 扫描可读安装：包、技能、README 的 kind 分布。 */
export async function scanInstall(paths) {
  const facts = { packages: [], skills: [], readmeKinds: {}, packageCount: 0, skillCount: 0, kindCount: 0 }
  if (!paths.cliRoot) return facts
  const scopeRoot = join(paths.cliRoot, SCOPE)
  for (const dirName of await listDirs(scopeRoot)) {
    const dir = join(scopeRoot, dirName)
    const manifest = await readJson(join(dir, 'package.json'))
    if (!manifest?.name) continue
    const readmePath = join(dir, 'README.md')
    const head = (await readText(readmePath))?.slice(0, 800) ?? ''
    const kind = /^kind:\s*"?([A-Za-z0-9-]+)"?\s*$/m.exec(head)?.[1] ?? null
    facts.packages.push({
      dirName,
      name: manifest.name,
      version: manifest.version ?? null,
      dir,
      readme: existsSync(readmePath) ? readmePath : null,
      kind,
    })
    if (kind) facts.readmeKinds[kind] = (facts.readmeKinds[kind] ?? 0) + 1
  }
  facts.packageCount = facts.packages.length
  facts.kindCount = Object.values(facts.readmeKinds).reduce((sum, count) => sum + count, 0)
  const skillsRoot = join(scopeRoot, 'dsh-agent-preset', 'skills')
  for (const name of await listDirs(skillsRoot)) {
    const file = join(skillsRoot, name, 'SKILL.md')
    if (existsSync(file)) facts.skills.push({ name, file })
  }
  facts.skillCount = facts.skills.length
  return facts
}

/** 解析每个「任务 → 文件」，记录存在性与内容 hash，供漂移检测。 */
export async function resolveResolvers(paths) {
  const scopeRoot = paths.cliRoot ? join(paths.cliRoot, SCOPE) : null
  const resolved = []
  for (const resolver of RESOLVERS) {
    const hit = scopeRoot
      ? resolver.paths.map((relative) => join(scopeRoot, relative)).find((candidate) => existsSync(candidate))
      : undefined
    const entry = {
      id: resolver.id,
      title: resolver.title,
      note: resolver.note ?? '',
      candidates: resolver.paths,
      path: hit ?? null,
      sha256: null,
    }
    if (hit) entry.sha256 = createHash('sha256').update(await readFile(hit)).digest('hex')
    resolved.push(entry)
  }
  return resolved
}

export function buildStamp({ paths, versions, facts, resolvers, now }) {
  return {
    indexFormat: INDEX_FORMAT,
    generator: GENERATOR,
    generatedAt: now.toISOString(),
    desktopVersion: versions.desktop?.version ?? null,
    desktopRuntime: versions.desktop?.path ?? null,
    cliVersion: versions.cliVersion ?? null,
    cliRoot: paths.cliRoot ?? null,
    contextDir: paths.contextDir,
    counts: {
      packages: facts.packageCount,
      skills: facts.skillCount,
      kindReadmes: facts.kindCount,
      readmeKinds: facts.readmeKinds,
    },
    missing: resolvers.filter((entry) => !entry.path).map((entry) => entry.id),
    resolvers: resolvers.map((entry) => ({ id: entry.id, path: entry.path, sha256: entry.sha256 })),
  }
}

function codeSpan(value) {
  return '`' + String(value).replace(/`/g, "'") + '`'
}

export function renderIndex({ paths, versions, facts, resolvers, now }) {
  const versionLabel = `桌面运行时 ${versions.desktop?.version ?? '未检测到'} · 可读安装 ${versions.cliVersion ?? '未检测到'}`
  const installLabel = paths.cliRoot ? codeSpan(paths.cliRoot) : '未找到可读安装（先安装 dsh CLI，或设置 `DSH_INSTALL_ROOT`）'
  const missing = resolvers.filter((entry) => !entry.path)
  const kinds = Object.entries(facts.readmeKinds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([kind, count]) => `${kind} ${count}`)
    .join(' · ')

  const rows = resolvers.map((entry) => {
    const location = entry.path ? codeSpan(entry.path) : '**MISSING**（DSH 布局可能已变，重新生成后再找）'
    return `| ${entry.title} | ${location} | ${entry.path ? 'OK' : 'MISSING'} |`
  })

  return [
    '# DSH 开发上下文',
    '',
    `> 由 \`dsh-dev-context\` 生成，**勿手改**。索引格式 v${INDEX_FORMAT} · 生成器 ${GENERATOR} · ${now.toISOString()}`,
    `> 版本键：${versionLabel}`,
    `> 可读安装：${installLabel}`,
    '',
    '## 怎么用',
    '',
    '1. 这份文件只是**索引**：正文在下列路径里，随安装升级自动更新；不要把结论当成静态文档背下来。',
    '2. 标 `MISSING` 的行 = 这条假设失效了。重新生成，不要用旧记忆补。',
    '3. 刷新：`node <本插件>/scripts/check.mjs --update`；也可以在 DSH 里删掉本文件后重启，插件会自动重建。',
    '4. 需要 Service / Event / Config / Tool 的精确契约时，读对应包的 `lib/types/*.d.ts`；在 DSH 内还可用 `cordis_inspect_query`。',
    '',
    '## 五个心智模型',
    '',
    '- **profile** — `$DSH_HOME/profiles/<name>/`：按顺序叠加的 bundle 层，最后是用户自己的 patch 层。',
    '- **bundle** — 一个 npm 包；`package.json` 的 `dsh.bundle.patch` 指向 YAML patch。',
    '- **row** — patch 里的 `{ id, name, config }`；`name` 是包入口（可带子路径），`config` 由包的 `Config` 校验。',
    '- **层序** — bundle 依次 → profile 的 `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch`；后层覆盖前层。',
    '- **slot / inspect** — UI 靠 slot 注册；运行中的 Service/Event/Config/Tool/Slot 由 inspect provider 给出精确契约。',
    '',
    '## 任务 → 权威文件',
    '',
    '| 我要… | 读这里 | 状态 |',
    '|---|---|---|',
    ...rows,
    '',
    '## 本机事实',
    '',
    `- 可读包 ${facts.packageCount} 个；技能 ${facts.skillCount} 个；带 \`kind:\` 头的 README ${facts.kindCount} 个（${kinds || '无'}）。`,
    `- profile：\`${process.env.DSH_PROFILE ?? '未知'}\`，目录 \`${process.env.DSH_PROFILE_DIR ?? '未知'}\`。`,
    paths.cliRoot
      ? '- 索引只引用可读安装的路径。GUI 的 `app.asar` 普通文件工具读不了，因此**不作为引用目标**，只作版本键。'
      : '- 当前没有可读安装：GUI 的 `app.asar` 普通文件工具读不了；建议安装 dsh CLI 以便外部 harness 读文档。',
    missing.length ? `- 本次解析有 ${missing.length} 条 MISSING：${missing.map((entry) => entry.id).join('、')}。` : '- 全部引用解析成功。',
    '',
    '## 验证命令',
    '',
    '- 组合树：`dsh --profile web --dump-config`（`desktop` profile 由桌面应用独占，CLI 会拒绝）',
    '- 组合 schema：`dsh --profile web --dump-config-schema`',
    '- 安装/启用包：DSH 内用 `plugin_manager`；不要手改 profile 的 `package.json` / `cordis.patch.yml`',
    '',
  ].join('\n')
}

async function writeAtomic(file, content) {
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temp, content)
  await rename(temp, file)
}

export function skillFilePath() {
  return fileURLToPath(new URL(`../${SKILL_RELATIVE}`, import.meta.url))
}

/** 生成（或重建）索引；返回本次使用的版本与解析结果。 */
export async function generate(paths, options = {}) {
  const now = options.now ?? new Date()
  const versions = await readVersions(paths)
  const facts = await scanInstall(paths)
  const resolvers = await resolveResolvers(paths)
  const stamp = buildStamp({ paths, versions, facts, resolvers, now })
  const index = renderIndex({ paths, versions, facts, resolvers, now })
  const sources = {
    indexFormat: INDEX_FORMAT,
    generator: GENERATOR,
    generatedAt: now.toISOString(),
    cliRoot: paths.cliRoot,
    cliVersion: versions.cliVersion,
    desktopVersion: versions.desktop?.version ?? null,
    packages: facts.packages.map(({ name, version, dir, kind }) => ({ name, version, dir, kind })),
    skills: facts.skills,
    resolvers: resolvers.map(({ id, path, sha256, candidates }) => ({ id, path, sha256, candidates })),
  }
  await mkdir(paths.contextDir, { recursive: true })
  await writeAtomic(join(paths.contextDir, 'INDEX.md'), index)
  await writeAtomic(join(paths.contextDir, 'SOURCES.json'), `${JSON.stringify(sources, null, 2)}\n`)
  await writeAtomic(join(paths.contextDir, 'STAMP.json'), `${JSON.stringify(stamp, null, 2)}\n`)
  const skillFile = skillFilePath()
  if (existsSync(skillFile)) {
    await writeAtomic(join(paths.contextDir, 'SKILL.md'), await readFile(skillFile, 'utf8'))
  }
  return { versions, facts, resolvers, stamp }
}

/** 只读检查：索引是否对得上当前安装。不写任何文件。 */
export async function status(paths) {
  const versions = await readVersions(paths)
  const indexFile = join(paths.contextDir, 'INDEX.md')
  const stampFile = join(paths.contextDir, 'STAMP.json')
  if (!existsSync(indexFile) || !existsSync(stampFile)) {
    return { state: 'missing', reasons: ['索引尚未生成'], versions }
  }
  const stamp = await readJson(stampFile)
  const reasons = []
  if (!stamp) reasons.push('STAMP.json 无法解析')
  if (stamp && stamp.indexFormat !== INDEX_FORMAT) {
    reasons.push(`索引格式 ${String(stamp.indexFormat)} ≠ ${INDEX_FORMAT}`)
  }
  if ((stamp?.desktopVersion ?? null) !== (versions.desktop?.version ?? null)) {
    reasons.push(`桌面运行时版本变化：${stamp?.desktopVersion ?? '未知'} → ${versions.desktop?.version ?? '未知'}`)
  }
  if ((stamp?.cliVersion ?? null) !== (versions.cliVersion ?? null)) {
    reasons.push(`可读安装版本变化：${stamp?.cliVersion ?? '未知'} → ${versions.cliVersion ?? '未知'}`)
  }
  for (const entry of stamp?.resolvers ?? []) {
    if (entry.path && !existsSync(entry.path)) reasons.push(`引用失效：${entry.id} → ${entry.path}`)
  }
  return { state: reasons.length ? 'stale' : 'fresh', reasons, versions, stamp }
}
