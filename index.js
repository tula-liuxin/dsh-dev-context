import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { generate, resolvePaths, skillFilePath, status } from './lib/context.mjs'

/** Cordis 插件名。 */
export const name = 'dsh-dev-context'

const DEFAULTS = { contextDir: '', dshHome: '', autoRefresh: true }

const SKILL_DESCRIPTION =
  'How to obtain and use the local DeepSeek Harness (DSH) development context before building DSH plugins, presets, or UI. Use whenever a task mentions DSH, DeepSeek Harness, cordis plugins, or extending this harness.'

function settingsOf(config) {
  const input = config && typeof config === 'object' && !Array.isArray(config) ? config : {}
  const merged = { ...DEFAULTS, ...input }
  return {
    contextDir: typeof merged.contextDir === 'string' ? merged.contextDir : '',
    dshHome: typeof merged.dshHome === 'string' ? merged.dshHome : '',
    autoRefresh: merged.autoRefresh !== false,
  }
}

/**
 * 激活时比对版本戳：缺失/过期就重建一次索引。
 * 重建是异步的，失败只记录日志，绝不让插件拖住宿主启动。
 */
export function apply(ctx, config) {
  const settings = settingsOf(config)
  const paths = resolvePaths(process.env, settings)

  ctx.effect(() => {
    let cancelled = false
    void (async () => {
      const current = await status(paths)
      if (cancelled || current.state === 'fresh') return
      if (!settings.autoRefresh) {
        ctx.logger.warn(
          `dsh-dev-context: 索引${current.state === 'missing' ? '缺失' : '过期'}（${current.reasons.join('；')}），autoRefresh 已关闭`,
        )
        return
      }
      await generate(paths)
      if (!cancelled) ctx.logger.info(`dsh-dev-context: 已重建 ${join(paths.contextDir, 'INDEX.md')}`)
    })().catch((error) => {
      ctx.logger.warn(`dsh-dev-context: 重建失败 ${String(error?.message ?? error)}`)
    })
    return () => {
      cancelled = true
    }
  })

  // 可选：把同一份 SKILL.md 内嵌给 DSH 自己的 agent；没有 skills 服务的组合自动跳过。
  ctx.inject(['skills'], (skillsCtx) => {
    let content
    try {
      content = readFileSync(skillFilePath(), 'utf8')
    } catch {
      return
    }
    skillsCtx.effect(() =>
      skillsCtx.skills.register({
        name: 'dsh-dev-context',
        description: SKILL_DESCRIPTION,
        source: 'bundled',
        content,
        invocation: { modelInvocable: true, userInvocable: true },
      }),
    )
  })
}
