import { useCallback, useEffect, useState } from 'react'

export type Language = 'zh-CN' | 'en'

const translations: Record<string, { 'zh-CN': string; en: string }> = {
  'AI Config Hub': { 'zh-CN': 'AI 配置助手', en: 'AI Config Hub' },
  '统一安装、配置与管理本地 AI 应用': { 'zh-CN': '统一安装、配置与管理本地 AI 应用', en: 'Install, configure, and manage local AI apps' },
  '检测运行环境': { 'zh-CN': '检测运行环境', en: 'Check runtime' },
  '配置 API 模型': { 'zh-CN': '配置 API 模型', en: 'Configure API models' },
  '配置微信连接': { 'zh-CN': '配置微信连接', en: 'Configure WeChat' },
  '安装技能': { 'zh-CN': '安装技能', en: 'Install skills' },
  '完成安装': { 'zh-CN': '完成安装', en: 'Setup complete' },
  '技术支持': { 'zh-CN': '技术支持', en: 'Support' },
  '刷新': { 'zh-CN': '刷新', en: 'Refresh' },
  '保存全局': { 'zh-CN': '保存全局', en: 'Save global' },
  '系统环境写入': { 'zh-CN': '系统环境写入', en: 'System environment' },
  '保存后会按平台同步运行时环境': { 'zh-CN': '保存后会按平台同步运行时环境', en: 'Runtime environment is synced for this platform after saving' },
  '已启用': { 'zh-CN': '已启用', en: 'Enabled' },
  '未启用': { 'zh-CN': '未启用', en: 'Disabled' },
  '共享 API 默认写入全局 config.yaml，应用文件可单独在线编辑。': { 'zh-CN': '共享 API 默认写入全局 config.yaml，应用文件可单独在线编辑。', en: 'Shared APIs are saved to config.yaml by default; app files can be edited online.' },
  '正在读取启动配置...': { 'zh-CN': '正在读取启动配置...', en: 'Loading startup configuration...' },
  '已安装': { 'zh-CN': '已安装', en: 'Installed' },
  '已停止': { 'zh-CN': '已停止', en: 'Stopped' },
  '启动': { 'zh-CN': '启动', en: 'Start' }, '停止': { 'zh-CN': '停止', en: 'Stop' },
  '安装': { 'zh-CN': '安装', en: 'Install' }, '下载': { 'zh-CN': '下载', en: 'Download' },
  '卸载': { 'zh-CN': '卸载', en: 'Uninstall' },
  '添加本地 Skill': { 'zh-CN': '添加本地 Skill', en: 'Add local Skill' },
  '上传文件夹': { 'zh-CN': '上传文件夹', en: 'Upload folder' },
  '上传压缩包': { 'zh-CN': '上传压缩包', en: 'Upload archive' },
  '打开桌面端': { 'zh-CN': '打开桌面端', en: 'Open desktop app' }, '未安装': { 'zh-CN': '未安装', en: 'Not installed' },
  'Hermes Agent 桌面端已打开': { 'zh-CN': 'Hermes Agent 桌面端已打开', en: 'Hermes desktop app opened' },
  '重启': { 'zh-CN': '重启', en: 'Restart' }, '更新': { 'zh-CN': '更新', en: 'Update' },
  '打开终端': { 'zh-CN': '打开终端', en: 'Open terminal' }, '编辑配置': { 'zh-CN': '编辑配置', en: 'Edit config' },
  '打开入口': { 'zh-CN': '打开入口', en: 'Open app' }, '就绪': { 'zh-CN': '就绪', en: 'Ready' },
  '当前步骤已完成': { 'zh-CN': '当前步骤已完成', en: 'Current step complete' },
  '当前步骤未完成': { 'zh-CN': '当前步骤未完成', en: 'Current step incomplete' },
  '网页服务': { 'zh-CN': '网页服务', en: 'Web service' },
  'CLI 应用，无网页服务': { 'zh-CN': 'CLI 应用，无网页服务', en: 'CLI app, no web service' },
  '检查更新': { 'zh-CN': '检查更新', en: 'Check for updates' }, '下载更新': { 'zh-CN': '下载更新', en: 'Download update' },
  '自动安装更新': { 'zh-CN': '自动安装更新', en: 'Install update automatically' },
  'runtime 可用': { 'zh-CN': 'runtime 可用', en: 'Runtime available' },
  '全局 API 已配置': { 'zh-CN': '全局 API 已配置', en: 'Global API configured' },
  'OpenClaw 微信单入口已配置': { 'zh-CN': 'OpenClaw 微信单入口已配置', en: 'OpenClaw WeChat entry configured' },
  '网页入口就绪': { 'zh-CN': '网页入口就绪', en: 'Web entry ready' },
  '未配置外部入口': { 'zh-CN': '未配置外部入口', en: 'No external entry configured' },
  '请通过终端运行交互式命令': { 'zh-CN': '请通过终端运行交互式命令', en: 'Run interactive commands in the terminal' },
  '读取中': { 'zh-CN': '读取中', en: 'Loading' }, '更新中': { 'zh-CN': '更新中', en: 'Updating' },
  '启动中': { 'zh-CN': '启动中', en: 'Starting' }, '停止中': { 'zh-CN': '停止中', en: 'Stopping' },
  '启动失败': { 'zh-CN': '启动失败', en: 'Start failed' }, '运行中': { 'zh-CN': '运行中', en: 'Running' },
}

// Keep UI copy translated even when a component uses a literal Chinese label.
// This table intentionally covers the full control surface (API, WeChat, skills,
// runtime and update dialogs), including labels introduced outside the original
// navigation set.
const extraEnglish: Record<string, string> = {
  '简体中文': 'Simplified Chinese', '选择模型供应商': 'Choose model provider', '模型': 'Model', '配置': 'Configuration',
  '配置文件': 'Configuration file', '默认写入全局': 'Saved to global config by default', '选择后自动填充': 'Selecting a provider fills this automatically',
  '与常用模型': 'and common models', '无需逐项拼接': 'No need to assemble each field manually', '保存并同步': 'Save and sync', '保存文件': 'Save file',
  '保存全局配置失败': 'Failed to save global configuration', '保存文件失败': 'Failed to save file', '配置已保存': 'Configuration saved',
  '配置已同步到全部应用': 'Configuration synced to all applications', '全局 API 配置，保存后同步到全部应用': 'Global API configuration; sync to all applications after saving', '保存后会同步到': 'After saving, synced to', '保存后同步到全部应用': 'After saving, sync to all applications',
  '保存后会同步到 OpenClaw、Hermes、Claude Code、Codex 和 DeepSeek Harness 的实际配置；DeepSeek 使用 web/desktop Profile Patch，不写入 settings.yaml。': 'Saving syncs the effective configuration to OpenClaw, Hermes, Claude Code, Codex, and DeepSeek Harness. DeepSeek uses a web/desktop profile patch and does not write settings.yaml.',
  '在线编辑': 'Edit online', '同步全局 API': 'Sync global API', '同步全局': 'Sync global', '同步失败': 'Sync failed',
  '已同步到全部应用': 'Synced to all applications', '已同步东创': 'Synced to Dongchuang AI', '东创': 'Dongchuang AI', '登录东创': 'Sign in to Dongchuang AI',
  '浏览器已打开东创 AI 授权页面。完成授权后，此处会自动同步 API 配置。': 'The Dongchuang AI authorization page is open. API settings will sync here after authorization.',
  '无法打开浏览器？前往授权页面': 'Browser did not open? Go to authorization page', '授权码': 'Authorization code', '授权页面': 'Authorization page',
  '授权': 'Authorization', '重新授权': 'Authorize again', '授权完成': 'Authorization complete', '授权启动失败': 'Failed to start authorization',
  '读取授权状态失败': 'Failed to read authorization status', '授权状态接口返回': 'Authorization status API returned', '已授权': 'Authorized', '已退出东创': 'Signed out of Dongchuang AI',
  '取消': 'Cancel', '完成': 'Done', '关闭授权窗口': 'Close authorization dialog', '正在发起授权': 'Starting authorization',
  'OpenClaw 微信单入口': 'OpenClaw WeChat entry', '仅 OpenClaw 保存并使用微信 bot 凭据': 'Only OpenClaw stores and uses WeChat bot credentials',
  '消息路由': 'Message routing', '每条带前缀的消息均为单次执行': 'Each prefixed message runs once', '不加前缀直接发送': 'Send directly without a prefix',
  '微信路由暂未支持': 'WeChat routing is not supported yet', '扫码连接微信': 'Scan to connect WeChat', '重置微信连接': 'Reset WeChat connection',
  '重置微信连接失败': 'Failed to reset WeChat connection', '微信登录二维码': 'WeChat login QR code', '打开二维码链接': 'Open QR code link',
  '输入微信显示的验证码': 'Enter the verification code shown in WeChat', '提交验证码': 'Submit code', '提交验证码失败': 'Failed to submit code',
  '请使用手机微信扫描二维码': 'Scan the QR code with WeChat on your phone', '已扫码，请在手机微信中确认': 'Scanned. Confirm in WeChat on your phone',
  '请输入手机微信显示的验证码': 'Enter the verification code shown in WeChat', '二维码已刷新，请重新扫描': 'QR code refreshed. Scan again',
  '技能市场': 'Skill marketplace', '搜索技能': 'Search skills', '全部': 'All', '添加本地 Skill': 'Add local Skill', '添加本地': 'Add local',
  '上传文件夹': 'Upload folder', '上传压缩包': 'Upload archive', '技能市场分页': 'Skill marketplace pagination', '正在读取技能市场': 'Loading skill marketplace',
  '读取技能市场失败': 'Failed to load skill marketplace', '技能市场返回': 'Skill marketplace response', '没有匹配的技能': 'No matching skills', '暂无技能说明': 'No skill description',
  '启用技能': 'Enable skill', '停用技能': 'Disable skill', '卸载技能': 'Uninstall skill', '补齐到全部应用': 'Sync to all applications', '补齐': 'Sync',
  '技能操作失败': 'Skill operation failed', '重试': 'Retry', '上一页': 'Previous', '下一页': 'Next', '已补齐应用目录': 'Application directories synced',
  '输入模型名称…': 'Enter model name…', '列表选择': 'Choose from list', '自定义': 'Custom', '刷新': 'Refresh', '更新': 'Update', '下载更新': 'Download update',
  '发现新版本': 'New version available', '发布日期': 'Release date', '可下载新的软件版本': 'A new software version is available', '检查更新': 'Check for updates',
  '正在检查更新': 'Checking for updates', '检查更新失败': 'Update check failed', '当前已是最新版本': 'Already up to date', '更新成功': 'Update successful',
  '自动安装更新': 'Install update automatically', '自动安装更新失败': 'Automatic update failed', '正在准备安装': 'Preparing installation', '正在下载并校验更新包': 'Downloading and verifying update package',
  '关闭更新窗口': 'Close update dialog', '安装包大小': 'Package size', '页面即将刷新': 'The page will refresh shortly', '更新程序已打开': 'Updater opened', '安装程序已打开': 'Installer opened',
  '写入系统环境变量': 'Write system environment variables', '写入系统环境变量 PATH': 'Write system environment variables to PATH', '当前平台不支持自动写入系统环境变量': 'Automatic system environment setup is not supported on this platform',
  '勾选后再点击右上角': 'Check this, then click the top-right button', '保存全局': 'Save global', '系统环境写入': 'System environment',
  '勾选后再点击右上角“保存全局”，会把这套运行环境持久化到当前用户或系统环境中。': 'After checking this option, click “Save global” in the top-right to persist this runtime environment for the current user or system.',
  '统一安装、配置与管理本地 AI 应用': 'Install, configure, and manage local AI apps', '为您的智能体提供预封装且可重复的最佳实践与工具': 'Prepackaged, repeatable best practices and tools for your agents',
  '通义千问': 'Qwen', '豆包': 'Doubao', '火山引擎': 'Volcengine', '硅基流动': 'SiliconFlow', '智谱': 'Zhipu',
}

export function translate(value: string, language: Language): string {
  if (language === 'zh-CN') return value
  if (translations[value]?.en) return translations[value].en
  if (extraEnglish[value]) return extraEnglish[value]
  const skillsReady = value.match(/^(\d+) 个技能已就绪$/)
  if (skillsReady) return `${skillsReady[1]} skills ready`
  const pagination = value.match(/^共\s*(\d+)\s*条\s*·\s*(\d+)\s*\/\s*(\d+)\s*页$/)
  if (pagination) return `${pagination[1]} items · page ${pagination[2]} of ${pagination[3]}`
  const appCount = value.match(/^应用\s*(\d+)\/(\d+)$/)
  if (appCount) return `Apps ${appCount[1]}/${appCount[2]}`
  if (value.startsWith('写入 runtime/windows/')) return `Add the portable runtime folders (${value.slice(5).replace('到系统 PATH', 'to the system PATH').replace('与', 'and').replace('（pip/playwright/uvicorn 等 console scripts 入口）', '(pip/playwright/uvicorn and other console script entry points)')}`
  if (value.startsWith('写入 ~/.bash_profile')) return 'Write ~/.bash_profile to activate the macOS runtime; Python uses pyenv shims'
  const action = value.match(/^(.+) (启动命令已执行|已停止|重启命令已执行|更新完成|终端已打开|桌面端已打开)$/)
  if (action) {
    const suffix: Record<string, string> = { '启动命令已执行': 'start command executed', '已停止': 'stopped', '重启命令已执行': 'restart command executed', '更新完成': 'updated', '终端已打开': 'terminal opened', '桌面端已打开': 'desktop app opened' }
    return `${action[1]} ${suffix[action[2]] ?? action[2]}`
  }
  return value
}

export function useI18n() {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = window.localStorage.getItem('webui-language')
    return saved === 'en' ? 'en' : 'zh-CN'
  })
  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    window.localStorage.setItem('webui-language', next)
    // Reload restores literal JSX text when switching back from the DOM
    // fallback translation used for legacy components.
    window.location.reload()
  }, [])
  useEffect(() => {
    window.localStorage.setItem('webui-language', language)
    document.documentElement.lang = language
    if (language !== 'en') return
    // Some legacy screens still contain literal JSX text. Translate rendered
    // text and common accessibility attributes as a safety net so every page
    // follows the language selector while those components are migrated.
    const translateDom = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let node: Node | null
      while ((node = walker.nextNode())) {
        const text = node.nodeValue ?? ''
        const trimmed = text.trim()
        if (!trimmed) continue
        const translated = translate(trimmed, 'en')
        if (translated !== trimmed) node.nodeValue = text.replace(trimmed, translated)
      }
      document.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label]').forEach(element => {
        for (const attribute of ['placeholder', 'title', 'aria-label']) {
          const value = element.getAttribute(attribute)
          if (value) element.setAttribute(attribute, translate(value, 'en'))
        }
      })
    }
    translateDom()
    const observer = new MutationObserver(translateDom)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [language])
  const t = useCallback((value: string) => translate(value, language), [language])
  return { language, setLanguage, t }
}
