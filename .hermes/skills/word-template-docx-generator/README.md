# word-template-docx-generator

This skill now contains a fully migrated, self-contained Word generation workflow in the current project.

Bundled assets:

- `assets/templates`: DOCX templates
- `assets/json`: sample JSON data
- `assets/source`: source snapshot for code document generation

- JSON data + fixed DOCX templates
- deterministic output naming
- optional source-code document generation

## Files

- `SKILL.md`: invocation rules and workflow
- `scripts/render_word_templates.py`: executable generator script

## Quick Run

```bash
python ".claude/skills/word-template-docx-generator/scripts/render_word_templates.py" batch \
  --output-dir ".claude/skills/word-template-docx-generator/output"
```

## Auto-pick JSON by system name

```bash
python ".claude/skills/word-template-docx-generator/scripts/render_word_templates.py" batch-auto \
  --system-name "民族舞蹈文化传承辅助教学系统" \
  --output-dir ".claude/skills/word-template-docx-generator/output"
```

If only one valid pair (`*操作手册.json` + `*系统说明.json`) exists, `--system-name` can be omitted.

## Optional external mode

You can still point to another project root:

```bash
python ".claude/skills/word-template-docx-generator/scripts/render_word_templates.py" batch \
  --project-root "E:/mywroks/project/copyrights-auto-codes/demo3/格式工具"
```
