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

export function translate(value: string, language: Language): string {
  if (language === 'zh-CN') return value
  if (translations[value]?.en) return translations[value].en
  const skillsReady = value.match(/^(\d+) 个技能已就绪$/)
  if (skillsReady) return `${skillsReady[1]} skills ready`
  const action = value.match(/^(.+) (启动命令已执行|已停止|重启命令已执行|更新完成|终端已打开|桌面端已打开)$/)
  if (action) {
    const suffix: Record<string, string> = { '启动命令已执行': 'start command executed', '已停止': 'stopped', '重启命令已执行': 'restart command executed', '更新完成': 'updated', '终端已打开': 'terminal opened', '桌面端已打开': 'desktop app opened' }
    return `${action[1]} ${suffix[action[2]] ?? action[2]}`
  }
  return value
}

export function useI18n() {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = window.localStorage.getItem('webui-language')
    return saved === 'en' ? 'en' : 'zh-CN'
  })
  useEffect(() => { window.localStorage.setItem('webui-language', language); document.documentElement.lang = language }, [language])
  const t = useCallback((value: string) => translate(value, language), [language])
  return { language, setLanguage, t }
}
