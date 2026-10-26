window.__ModuleLoader__.load({
  id: 'dsh-dev-context',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-dev-context'

    // 生成物里已经有一份 SKILL.md；这两行是给用户复制、贴给其他 AI harness 的稳定路径。
    const WINDOWS_PATH = '%USERPROFILE%\\.dsh\\dev-context\\SKILL.md'
    const POSIX_PATH = '~/.dsh/dev-context/SKILL.md'
    const REMOTE_URL =
      'https://raw.githubusercontent.com/tula-liuxin/dsh-dev-context/main/skills/dsh-dev-context/SKILL.md'

    const DICTS = {
      en: {
        title: 'Skill for other AI harnesses',
        hint: 'Paste this path into another AI. It reads the file, installs the skill, and learns how to develop for DSH.',
        copy: 'Copy for AI',
        copied: 'Copied',
        posix: 'macOS / Linux',
        remote: 'Remote copy',
        instruct:
          'Read {path} (macOS/Linux: {posix}) and follow it to install the dsh-dev-context skill into this harness. Then use it as the entry point for any DSH development work.',
      },
      zh: {
        title: '给其他 AI harness 的 skill',
        hint: '把这个路径贴给别的 AI：它读取该文件就能装好 skill，并据此了解如何为 DSH 开发。',
        copy: '复制给 AI',
        copied: '已复制',
        posix: 'macOS / Linux',
        remote: '远程版本',
        instruct:
          '请读取 {path}（macOS/Linux：{posix}），按文件里的说明把 dsh-dev-context skill 装到你当前的 AI harness，并把它作为了解 DSH 开发上下文的入口。',
      },
    }

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text)
      return new Promise((resolve, reject) => {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        try {
          if (document.execCommand('copy')) resolve()
          else reject(new Error('copy failed'))
        } catch (error) {
          reject(error)
        } finally {
          document.body.removeChild(area)
        }
      })
    }

    function CopyButton(props) {
      const [copied, setCopied] = React.useState(false)
      const timer = React.useRef()
      React.useEffect(() => () => clearTimeout(timer.current), [])
      const onClick = () => {
        copyText(props.text).then(
          () => {},
          () => {},
        )
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1800)
      }
      return h(
        'button',
        {
          type: 'button',
          onClick,
          style: {
            flex: '0 0 auto',
            height: 32,
            padding: '0 12px',
            borderRadius: 8,
            border: '1px solid var(--dsw-alias-border-l2)',
            background: copied ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-bg-layer-1)',
            color: copied ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-primary)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          },
        },
        copied ? props.copiedLabel : props.copyLabel,
      )
    }

    function codeStyle() {
      return {
        margin: 0,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.5,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        userSelect: 'all',
      }
    }

    function buildSection(t) {
      function SkillSection(props) {
        const subject = props && props.subject
        if (!subject || subject.kind === 'item') return null
        const pkg = subject.pkg
        if (!pkg || pkg.name !== 'dsh-dev-context') return null
        const instruct = t('instruct').replaceAll('{path}', WINDOWS_PATH).replaceAll('{posix}', POSIX_PATH)
        return h(
          'section',
          { style: { marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--dsw-alias-border-l1)' } },
          h(
            'div',
            { style: { fontSize: 13, fontWeight: 600, color: 'var(--dsw-alias-label-primary)', marginBottom: 6 } },
            t('title'),
          ),
          h(
            'div',
            { style: { fontSize: 12, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)', marginBottom: 12 } },
            t('hint'),
          ),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('code', { style: { ...codeStyle(), flex: '1 1 auto', minWidth: 0 } }, WINDOWS_PATH),
            h(CopyButton, { text: instruct, copyLabel: t('copy'), copiedLabel: t('copied') }),
          ),
          h(
            'div',
            { style: { marginTop: 10, fontSize: 12, lineHeight: 1.6, color: 'var(--dsw-alias-label-secondary)' } },
            t('posix'),
            ' ',
            h('code', { style: { ...codeStyle(), display: 'inline-block', padding: '2px 6px' } }, POSIX_PATH),
            ' · ',
            t('remote'),
            ' ',
            h(
              'a',
              {
                href: REMOTE_URL,
                target: '_blank',
                rel: 'noreferrer',
                style: { color: 'var(--dsw-alias-brand-primary)', wordBreak: 'break-all' },
              },
              REMOTE_URL,
            ),
          ),
        )
      }
      return SkillSection
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, 'en', DICTS.en))
        ctx.effect(() => ctx.locale.register(NS, 'zh', DICTS.zh))
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('plugins.detail.section', () =>
          ctx.slots.register(
            { name: 'plugins.detail.section', id: 'dsh-dev-context-skill', order: 40, label: () => t('title') },
            buildSection(t),
          ),
        )
      },
    }
  },
})
