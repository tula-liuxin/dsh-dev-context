import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { generate, resolvePaths, status } from '../lib/context.mjs'

const FILES = {
  'dsh-agent-preset/skills/cordis-plugin-development/SKILL.md': '# plugin authoring\n',
  'dsh-agent-preset/skills/cordis-plugin-development/references/host-plugin.md': '# host\n',
  'dsh-agent-preset/skills/cordis-plugin-development/references/ui-plugin.md': '# ui\n',
  'dsh-agent-preset/skills/cordis-plugin-development/references/mcp-bundle.md': '# mcp\n',
  'dsh-agent-preset/skills/cordis-plugin-development/references/practices.md': '# practices\n',
  'dsh-agent-preset/skills/cordis-plugin-development/references/verification.md': '# verification\n',
  'dsh-agent-preset/skills/cordis-plugin-development/references/user-actions.md': '# user actions\n',
  'dsh-agent-preset/skills/cordis-plugin-development/templates/decoration/package.json': '{}\n',
  'dsh-agent-preset/skills/cordis-plugin-development/templates/mcp/package.json': '{}\n',
  'dsh-agent-preset/skills/editing-cordis-compositions/SKILL.md': '# compositions\n',
  'dsh-agent-preset/skills/cordis-composition-reference/SKILL.md': '# reference\n',
  'dsh-agent-preset/skills/cordis-composition-reference/references/packages.md': '# packages\n',
  'dsh-plugin-manager/README.md': '---\nkind: "package-reference"\n---\n# manager\n',
  'dsh-skill/README.md': '---\nkind: "package-reference"\n---\n# skill\n',
  'dsh-skill-filesystem/README.md': '---\nkind: "package-reference"\n---\n# skill fs\n',
  'dsh-agent-instructions/README.md': '---\nkind: "package-reference"\n---\n# instructions\n',
  'dsh-harness-dev-context/README.md': '---\nkind: "package-reference"\n---\n# dev context\n',
}

async function fixture(desktopVersion = '1.2.3', cliVersion = '1.2.3') {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dev-context-'))
  const dshHome = join(root, 'home')
  const cliRoot = join(root, 'cli')
  const runtimeDir = join(dshHome, 'dsh-runtimes', 'dsh-primary-runtime')
  await mkdir(runtimeDir, { recursive: true })
  await writeFile(join(runtimeDir, 'runtime.json'), JSON.stringify({ desktopVersion }))
  await mkdir(cliRoot, { recursive: true })
  await writeFile(join(cliRoot, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh', version: cliVersion }))
  const scope = join(cliRoot, 'node_modules', '@deepseek-ai')
  for (const [relative, body] of Object.entries(FILES)) {
    const file = join(scope, relative)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, body)
  }
  const paths = resolvePaths({ DSH_HOME: dshHome }, { cliRoot })
  return { root, dshHome, cliRoot, scope, paths }
}

test('generate writes a stamped index and status reports fresh', async () => {
  const { root, paths } = await fixture()
  try {
    await generate(paths, { now: new Date('2026-01-02T03:04:05Z') })
    assert.ok(existsSync(join(paths.contextDir, 'INDEX.md')))
    assert.ok(existsSync(join(paths.contextDir, 'SOURCES.json')))
    assert.ok(existsSync(join(paths.contextDir, 'STAMP.json')))
    assert.ok(existsSync(join(paths.contextDir, 'SKILL.md')))

    const current = await status(paths)
    assert.equal(current.state, 'fresh')
    assert.deepEqual(current.reasons, [])

    const index = await import('node:fs/promises').then((fs) => fs.readFile(join(paths.contextDir, 'INDEX.md'), 'utf8'))
    assert.match(index, /桌面运行时 1\.2\.3/)
    assert.match(index, /可读安装 1\.2\.3/)
    assert.doesNotMatch(index, /\| MISSING \|/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a version change makes the index stale', async () => {
  const { root, paths } = await fixture()
  try {
    await generate(paths)
    await writeFile(join(paths.dshHome, 'dsh-runtimes', 'dsh-primary-runtime', 'runtime.json'), JSON.stringify({ desktopVersion: '1.3.0' }))
    const current = await status(paths)
    assert.equal(current.state, 'stale')
    assert.ok(current.reasons.some((reason) => reason.includes('1.2.3') && reason.includes('1.3.0')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a removed referenced file is reported by status', async () => {
  const { root, paths, scope } = await fixture()
  try {
    await generate(paths)
    await rm(join(scope, 'dsh-skill', 'README.md'))
    const current = await status(paths)
    assert.equal(current.state, 'stale')
    assert.ok(current.reasons.some((reason) => reason.includes('pkg.skill') && reason.includes('引用失效')))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a missing index is reported, not silently generated', async () => {
  const { root, paths } = await fixture()
  try {
    const current = await status(paths)
    assert.equal(current.state, 'missing')
    assert.ok(current.reasons.length > 0)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('generation without a readable install stays honest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-dev-context-empty-'))
  try {
    const dshHome = join(root, 'home')
    await mkdir(join(dshHome, 'dsh-runtimes', 'dsh-primary-runtime'), { recursive: true })
    await writeFile(join(dshHome, 'dsh-runtimes', 'dsh-primary-runtime', 'runtime.json'), JSON.stringify({ desktopVersion: '9.9.9' }))
    const paths = resolvePaths({ DSH_HOME: dshHome }, { cliRoot: join(root, 'absent') })
    await generate(paths)
    const index = await import('node:fs/promises').then((fs) => fs.readFile(join(paths.contextDir, 'INDEX.md'), 'utf8'))
    assert.match(index, /未找到可读安装/)
    assert.match(index, /\| MISSING \|/)
    const current = await status(paths)
    assert.equal(current.state, 'fresh')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
