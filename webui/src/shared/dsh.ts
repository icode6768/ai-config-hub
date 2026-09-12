import { copyFile, mkdir, access, lstat, mkdtemp, readdir, rename, rmdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { dshConfigPath, dshHomePath, rootPath } from './paths'

async function statIfPresent(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function mergeLegacyDshHome(): Promise<void> {
  const legacy = join(rootPath(), 'dsh')
  const target = dshHomePath()
  const legacyStat = await statIfPresent(legacy)
  if (!legacyStat) return
  if (!legacyStat.isDirectory() || legacyStat.isSymbolicLink()) {
    throw new Error(`Cannot migrate non-directory or linked DSH home: ${legacy}`)
  }
  let backup: string | undefined
  const merge = async (relative: string): Promise<void> => {
    const source = join(legacy, relative)
    const destination = join(target, relative)
    const destinationStat = await statIfPresent(destination)
    if (!destinationStat) {
      await rename(source, destination)
      return
    }
    const sourceStat = await lstat(source)
    if (sourceStat.isDirectory() && !sourceStat.isSymbolicLink()
      && destinationStat.isDirectory() && !destinationStat.isSymbolicLink()) {
      for (const name of await readdir(source)) await merge(join(relative, name))
      await rmdir(source)
      return
    }
    // Keep the active .dsh data; archive the legacy side without overwriting it.
    backup ??= await mkdtemp(join(target, 'legacy-dsh-'))
    const archived = join(backup, relative)
    await mkdir(dirname(archived), { recursive: true })
    await rename(source, archived)
  }
  for (const name of await readdir(legacy)) await merge(name)
  await rmdir(legacy)
  console.log(`[DeepSeek Harness] Merged dsh into .dsh${backup ? `; legacy conflicts saved in ${backup}` : ''}`)
}

export async function migrateLegacyDshConfig(targetPath: string, legacyPath: string): Promise<boolean> {
  if (resolve(targetPath) === resolve(legacyPath)) return false

  try {
    await access(targetPath, constants.F_OK)
    return false
  } catch {
    // The portable config does not exist yet, so a legacy copy may be used.
  }

  try {
    await access(legacyPath, constants.F_OK | constants.R_OK)
  } catch {
    return false
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await copyFile(legacyPath, targetPath)
  return true
}

export async function ensureDshHome(): Promise<void> {
  const targetPath = dshConfigPath()
  await mkdir(dshHomePath(), { recursive: true })
  await mergeLegacyDshHome()

  const legacyHome = process.platform === 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME
  if (!legacyHome) return

  await migrateLegacyDshConfig(targetPath, resolve(legacyHome, '.dsh', 'settings.yaml'))
}
