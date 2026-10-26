#!/usr/bin/env node
/**
 * 轻量检查器：不启动 DSH，只比对版本戳与引用路径。
 *
 *   node scripts/check.mjs             # 只读检查（默认）
 *   node scripts/check.mjs --update    # 重建索引
 *   node scripts/check.mjs --json      # 机器可读输出
 *
 * 退出码：0 = 索引可用 / 已重建；1 = 索引缺失或过期；2 = 参数或运行错误。
 */
import { generate, resolvePaths, status } from '../lib/context.mjs'

const HELP = `dsh-dev-context check

用法：
  node scripts/check.mjs [--status|--update] [--json]
                         [--dsh-home <dir>] [--context-dir <dir>] [--cli-root <dir>]

默认 --status：只读检查，不写文件。
--update：重建索引（INDEX.md / SOURCES.json / STAMP.json / SKILL.md）。
退出码：0 可用；1 缺失或过期；2 出错。`

function parseArgs(argv) {
  const options = { mode: 'status', json: false, dshHome: '', contextDir: '', cliRoot: '', help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--status') options.mode = 'status'
    else if (arg === '--update') options.mode = 'update'
    else if (arg === '--json') options.json = true
    else if (arg === '--dsh-home') options.dshHome = argv[(index += 1)] ?? ''
    else if (arg === '--context-dir') options.contextDir = argv[(index += 1)] ?? ''
    else if (arg === '--cli-root') options.cliRoot = argv[(index += 1)] ?? ''
    else if (arg === '--help' || arg === '-h') options.help = true
    else {
      console.error(`未知参数：${arg}`)
      process.exitCode = 2
      options.help = true
    }
  }
  return options
}

function describe(versions) {
  const desktop = versions.desktop?.version ?? '未检测到'
  const cli = versions.cliVersion ?? '未检测到'
  return `桌面运行时 ${desktop} · 可读安装 ${cli}`
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(HELP)
    return process.exitCode ?? 0
  }
  const paths = resolvePaths(process.env, options)
  if (options.mode === 'update') {
    const result = await generate(paths)
    if (options.json) {
      console.log(JSON.stringify({
        state: 'updated',
        contextDir: paths.contextDir,
        cliRoot: paths.cliRoot,
        desktopVersion: result.versions.desktop?.version ?? null,
        cliVersion: result.versions.cliVersion ?? null,
        missing: result.stamp.missing,
      }, null, 2))
    } else {
      console.log(`dsh-dev-context: updated`)
      console.log(`  ${paths.contextDir}`)
      console.log(`  ${describe(result.versions)}`)
      if (result.stamp.missing.length) console.log(`  MISSING: ${result.stamp.missing.join(', ')}`)
    }
    return 0
  }
  const current = await status(paths)
  if (options.json) {
    console.log(JSON.stringify({
      state: current.state,
      contextDir: paths.contextDir,
      cliRoot: paths.cliRoot,
      desktopVersion: current.versions.desktop?.version ?? null,
      cliVersion: current.versions.cliVersion ?? null,
      reasons: current.reasons,
    }, null, 2))
  } else {
    console.log(`dsh-dev-context: ${current.state}`)
    console.log(`  ${paths.contextDir}`)
    console.log(`  ${describe(current.versions)}`)
    for (const reason of current.reasons) console.log(`  - ${reason}`)
  }
  return current.state === 'fresh' ? 0 : 1
}

main().then(
  (code) => {
    process.exitCode = code
  },
  (error) => {
    console.error(`dsh-dev-context: ${String(error?.stack ?? error)}`)
    process.exitCode = 2
  },
)
