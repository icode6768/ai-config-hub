export function resolveEditorDraft(currentDraft: string, diskContent: string, reload: boolean): string {
  return reload ? diskContent : currentDraft
}
