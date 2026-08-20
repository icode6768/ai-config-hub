import { copyFile, mkdir, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { dshConfigPath, dshHomePath } from './paths'

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

  const legacyHome = process.platform === 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME
  if (!legacyHome) return

  await migrateLegacyDshConfig(targetPath, resolve(legacyHome, '.dsh', 'settings.yaml'))
}
