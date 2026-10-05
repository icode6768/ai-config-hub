import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const source = join(root, '.hermes', 'hermes-agent')
const windows = process.platform === 'win32'
const relativePython = windows ? 'Scripts/python.exe' : 'bin/python'
const candidates = [join(root, '.hermes', 'venvs', `${process.platform}-${process.arch}`), join(source, 'venv'), join(source, '.venv')]
const venv = candidates.find(path => existsSync(join(path, relativePython)))
if (!venv) throw new Error(`Hermes Python environment missing for ${process.platform}-${process.arch}: ${candidates[0]}`)
const configPath = join(venv, 'pyvenv.cfg')
const config = readFileSync(configPath, 'utf8')
const version = /^(?:version_info|version)\s*=\s*(\d+\.\d+)/m.exec(config)?.[1]
const versions = join(root, 'runtime', windows ? 'windows/python/versions' : 'macos/pyenv/versions')
const installed = existsSync(versions) ? readdirSync(versions).filter(name => !version || name.startsWith(`${version}.`)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).reverse() : []
const base = installed.map(name => join(versions, name, windows ? 'python.exe' : 'bin/python3')).find(path => existsSync(path))
if (base) {
  const home = dirname(base)
  const updated = config.replace(/^home\s*=.*$/m, `home = ${home}`).replace(/^executable\s*=.*$/m, `executable = ${base}`)
  if (updated !== config) writeFileSync(configPath, updated)
}

// Load credentials inside Python so terminal commands and shell history contain no API key.
const bootstrap = `import os, sys, runpy, shutil, re
import yaml
from pathlib import Path
from urllib.parse import urlparse
import hermes_constants
# Restrict Hermes' managed-runtime lookup to this launcher's platform.
# Otherwise Windows npm shims can trigger auto-repair on a macOS USB launch.
hermes_constants.iter_hermes_node_dirs = lambda home=None: [Path(os.environ['HERMES_PORTABLE_NODE_BIN'])]
# The panel owns this runtime; Hermes must not replace it after a slow USB
# health probe times out. Resolve the already-pinned PATH without auto-healing.
def portable_node_executable(command):
    # Pin Node tools to the launcher's toolchain, never provision via Hermes PM.
    name = str(command)
    if '/' in name or chr(92) in name:
        return shutil.which(name)
    base = name.lower()
    for suffix in ('.cmd', '.exe', '.ps1'):
        base = base.removesuffix(suffix)
    if base in ('node', 'npm', 'npx'):
        return shutil.which(base, path=os.environ['HERMES_PORTABLE_NODE_BIN'])
    return shutil.which(name)
hermes_constants.find_node_executable = portable_node_executable
root = sys.argv.pop(1)
config_file = os.path.join(root, 'config.yaml')
if os.path.isfile(config_file):
    with open(config_file, encoding='utf-8') as handle:
        config = yaml.safe_load(handle) or {}
    key = config.get('global', {}).get('api', {}).get('apiKey')
    if key:
        os.environ['DONGCHUANGAI_API_KEY'] = str(key)
        base_url = str(config.get('global', {}).get('api', {}).get('baseUrl') or '')
        hostname = urlparse(base_url).hostname or ''
        if hostname:
            hostname = re.sub(r'^api\.', '', hostname, flags=re.IGNORECASE)
            key_env = 'HERMES_CUSTOM_API_' + re.sub(r'[^A-Z0-9]+', '_', hostname.upper()).strip('_') + '_API_KEY'
            os.environ[key_env] = str(key)
os.environ.pop('DONGCHUANGAI_KEY', None)
sys.argv[0] = 'hermes'
runpy.run_module('hermes_cli.main', run_name='__main__')
`
// npm uses /usr/bin/env node on macOS. Preserve the launcher's Node in all
// descendants, including Python -> npm -> lifecycle scripts.
const inheritedPath = Object.entries(process.env).find(([key]) => windows ? key.toLowerCase() === 'path' : key === 'PATH')?.[1] ?? ''
const env = { ...process.env, HERMES_HOME: join(root, '.hermes'), VIRTUAL_ENV: venv,
  HERMES_PORTABLE_NODE_BIN: dirname(process.execPath),
  PATH: [join(venv, windows ? 'Scripts' : 'bin'), dirname(process.execPath), inheritedPath].join(windows ? ';' : ':'),
  PYTHONPATH: source }
// Windows environment keys are case-insensitive; do not pass both Path and PATH.
if (windows) for (const key of Object.keys(env)) if (key !== 'PATH' && key.toLowerCase() === 'path') delete env[key]
delete env.PYTHONHOME
delete env.DONGCHUANGAI_KEY
const child = spawn(join(venv, relativePython), ['-c', bootstrap, root, ...process.argv.slice(2)], { cwd: source, env, stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1) })
