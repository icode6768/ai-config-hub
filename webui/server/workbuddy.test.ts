import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { appSkillDirectories, installLocalSkillForTarget, listSkillsForTarget, syncInstalledSkillsToTargets, uninstallSkillForTarget } from './skill-store'
import { workBuddySkillsCandidates } from './workbuddy'

assert.deepEqual(workBuddySkillsCandidates(), [join(homedir(), '.workbuddy', 'skills')])
assert.equal(appSkillDirectories().workbuddy, join(homedir(), '.workbuddy', 'skills'))
assert.deepEqual(workBuddySkillsCandidates('win32', 'C:\\Users\\Alice'), ['C:\\Users\\Alice\\.workbuddy\\skills'])
assert.deepEqual(workBuddySkillsCandidates('win32', 'D:\\Users\\Alice'), ['D:\\Users\\Alice\\.workbuddy\\skills'])
assert.deepEqual(workBuddySkillsCandidates('darwin', '/Users/alice'), ['/Users/alice/.workbuddy/skills'])

const previousUserProfile = process.env.USERPROFILE
try {
  process.env.USERPROFILE = 'C:\\Users\\测试用户'
  assert.deepEqual(workBuddySkillsCandidates('win32'), ['C:\\Users\\测试用户\\.workbuddy\\skills'])
} finally {
  if (previousUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = previousUserProfile
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'workbuddy-skill-sync-'))
const previousHome = process.env.HOME
const previousRoot = process.env.USB_LOBSTER_ROOT
try {
  process.env.USB_LOBSTER_ROOT = temporaryRoot
  process.env.HOME = join(temporaryRoot, 'user')
  process.env.USERPROFILE = join(temporaryRoot, 'user')
  const source = join(temporaryRoot, '.openclaw', 'skills', 'sync-test')
  const destination = join(homedir(), '.workbuddy', 'skills', 'sync-test')
  await mkdir(source, { recursive: true })
  await mkdir(destination, { recursive: true })
  const document = '---\nname: sync-test\ndescription: test\n---\n'
  await writeFile(join(source, 'SKILL.md'), document)
  await writeFile(join(destination, 'SKILL.md'), 'old content')
  await writeFile(join(destination, 'stale.txt'), 'obsolete')
  const skills = await syncInstalledSkillsToTargets(['workbuddy'])
  assert.equal(await readFile(join(destination, 'SKILL.md'), 'utf8'), document)
  await assert.rejects(readFile(join(destination, 'stale.txt')), { code: 'ENOENT' })
  assert.equal(skills.find(skill => skill.id === 'sync-test')?.targets.workbuddy, true)

  const targetSkill = join(temporaryRoot, '.claude', 'skills', 'target-test')
  await mkdir(targetSkill, { recursive: true })
  await writeFile(join(targetSkill, 'SKILL.md'), 'old target')
  await assert.rejects(
    installLocalSkillForTarget({ target: 'claude', files: [{ path: 'target-test/SKILL.md', contentBase64: Buffer.from(document).toString('base64') }] }),
    (error: unknown) => error instanceof Error && error.message.includes('已存在'),
  )
  await installLocalSkillForTarget({ target: 'claude', overwrite: true, files: [{ path: 'target-test/SKILL.md', contentBase64: Buffer.from(document).toString('base64') }] })
  assert.equal((await listSkillsForTarget('claude')).find(skill => skill.id === 'target-test')?.targets.claude, true)
  await uninstallSkillForTarget('claude', 'target-test')
  assert.equal((await listSkillsForTarget('claude')).some(skill => skill.id === 'target-test'), false)
} finally {
  if (previousHome === undefined) delete process.env.HOME
  else process.env.HOME = previousHome
  if (previousRoot === undefined) delete process.env.USB_LOBSTER_ROOT
  else process.env.USB_LOBSTER_ROOT = previousRoot
  if (previousUserProfile === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = previousUserProfile
  await rm(temporaryRoot, { recursive: true, force: true })
}

console.log('WorkBuddy skill directory and sync tests passed')
