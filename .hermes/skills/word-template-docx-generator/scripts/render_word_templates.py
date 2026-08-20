#!/usr/bin/env python3
"""Deterministic DOCX generator for JSON + fixed templates."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any


EXCLUDED_HTML_FILES = {
    "user_management.html",
    "system_logs.html",
    "system_monitoring.html",
    "dashboard.html",
    "base.html",
}

SKILL_ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = SKILL_ROOT / "assets"
BUNDLED_TEMPLATES_DIR = ASSETS_DIR / "templates"
BUNDLED_JSON_DIR = ASSETS_DIR / "json"
BUNDLED_IMAGES_DIR = ASSETS_DIR / "images"
BUNDLED_SOURCE_DIR = ASSETS_DIR / "source"
DEFAULT_OUTPUT_DIR = SKILL_ROOT / "output"
# 项目级输出根:相对项目根的 docs/文档输出/<系统名>/(类似 docs/screenshot/<系统名>/)
PROJECT_OUTPUT_REL = Path("docs") / "文档输出"


def _project_output_dir(project_root: Path, system_name: str | None) -> Path:
    """返回项目级输出目录: <project_root>/docs/文档输出/<系统名>/"""
    name = (system_name or "").strip() or "未命名系统"
    return (project_root / PROJECT_OUTPUT_REL / name).resolve()

BUNDLED_MANUAL_JSON = BUNDLED_JSON_DIR / "智能病历分析与质控系统操作手册.json"
BUNDLED_DESCRIPTION_JSON = BUNDLED_JSON_DIR / "智能病历分析与质控系统系统说明.json"


def _resolve_optional_path(raw: str, fallback: Path, base: Path | None = None) -> Path:
    if not raw:
        return fallback
    path = Path(raw)
    if path.is_absolute():
        return path
    if base is not None:
        return base / path
    return Path.cwd() / path


def _json_candidates(json_dir: Path) -> list[Path]:
    if not json_dir.exists():
        return []
    return [
        p
        for p in sorted(json_dir.glob("*.json"), key=lambda x: x.name)
        if "填写要求" not in p.name and p.name != "manifest.json"
    ]


def _extract_system_name_from_filename(filename: str, marker: str) -> str:
    idx = filename.find(marker)
    if idx == -1:
        return ""
    return filename[:idx].strip("-_ ")


def _build_json_pairs(json_dir: Path) -> dict[str, dict[str, Path]]:
    pairs: dict[str, dict[str, Path]] = {}
    for p in _json_candidates(json_dir):
        name = p.stem
        if "操作手册" in name:
            system_name = _extract_system_name_from_filename(name, "操作手册")
            if system_name:
                pairs.setdefault(system_name, {})["manual"] = p
        if "系统说明" in name:
            system_name = _extract_system_name_from_filename(name, "系统说明")
            if system_name:
                pairs.setdefault(system_name, {})["description"] = p
    return pairs


def _resolve_json_pair(json_dir: Path, system_name: str) -> tuple[str, Path, Path]:
    pairs = _build_json_pairs(json_dir)
    valid = {
        name: files
        for name, files in pairs.items()
        if files.get("manual") is not None and files.get("description") is not None
    }

    if system_name:
        direct = valid.get(system_name)
        if direct:
            return system_name, direct["manual"], direct["description"]

        # Fallback: read "系统名" field from JSON if filename differs.
        for name, files in valid.items():
            try:
                data = _load_json(files["description"])
            except Exception:
                continue
            if str(data.get("系统名", "")).strip() == system_name:
                return name, files["manual"], files["description"]

        raise FileNotFoundError(
            f"No matched JSON pair for system '{system_name}' in {json_dir}"
        )

    if len(valid) == 1:
        only_name, files = next(iter(valid.items()))
        return only_name, files["manual"], files["description"]

    if not valid:
        raise FileNotFoundError(f"No complete JSON pair found in {json_dir}")

    names = ", ".join(sorted(valid.keys()))
    raise RuntimeError(
        f"Multiple JSON pairs found ({names}); please pass --system-name explicitly"
    )


def _load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _is_image_file(filename: str) -> bool:
    suffix = Path(filename).suffix.lower()
    return suffix in {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"}


def _find_image_by_name(image_name: str, image_directory: Path) -> Path | None:
    if not image_directory.exists():
        return None

    clean_name = "".join(ch for ch in image_name if ch not in '<>:"/\\|?*')
    all_images: list[Path] = []
    for root, _, files in os.walk(image_directory):
        for file in files:
            if _is_image_file(file):
                all_images.append(Path(root) / file)

    lower_name = clean_name.lower()
    for candidate in all_images:
        if candidate.name.lower() == lower_name:
            return candidate

    for candidate in all_images:
        if candidate.stem.lower() == lower_name:
            return candidate

    for candidate in all_images:
        if lower_name in candidate.stem.lower():
            return candidate

    for candidate in all_images:
        if candidate.stem.lower() in lower_name:
            return candidate

    return None


def _resolve_image_value(value: str, image_directory: Path) -> Path | None:
    """Resolve a JSON image-field value to an existing file path.

    Resolution order:
      1) Absolute path → use as-is if it exists.
      2) Path containing a directory separator (relative path):
         try as-is (relative to CWD), then relative to image_directory.
      3) Pure basename → fuzzy search in image_directory via _find_image_by_name.
    Empty / blank values return None silently.
    """
    if not value or not value.strip():
        return None
    raw = value.strip()
    looks_like_path = ("/" in raw) or ("\\" in raw)

    if looks_like_path:
        candidate = Path(raw)
        if candidate.is_absolute() and candidate.exists() and candidate.is_file():
            return candidate
        if candidate.exists() and candidate.is_file():
            return candidate.resolve()
        joined = (image_directory / raw).resolve()
        if joined.exists() and joined.is_file():
            return joined
        return None  # 路径写错就直接失败,不再走 basename 搜索

    return _find_image_by_name(raw, image_directory)


def _preprocess_images(data: Any, image_directory: Path) -> Any:
    if isinstance(data, dict):
        out: dict[str, Any] = {}
        for key, value in data.items():
            if isinstance(value, str) and (
                "图片" in key
                or "截图" in key
                or "image" in key.lower()
                or "img" in key.lower()
            ):
                if not value.strip():
                    out[key] = ""  # 空字符串保持为空,模板渲染为空白
                    continue
                found = _resolve_image_value(value, image_directory)
                if found:
                    out[key] = {"__image_path__": str(found)}
                else:
                    # 绝对路径或含分隔符的路径写法:不存在 = 静默空白(用户写的明确位置,不存在多半是没拍)
                    # basename 写法:保留 [图片未找到] 提示(模糊搜索失败有诊断价值)
                    looks_like_path = ("/" in value) or ("\\" in value)
                    out[key] = "" if looks_like_path else f"[图片未找到: {value}]"
            else:
                out[key] = _preprocess_images(value, image_directory)
        return out
    if isinstance(data, list):
        return [_preprocess_images(item, image_directory) for item in data]
    return data


def _attach_inline_images(
    tpl: Any,
    data: Any,
    image_width: float,
    image_height: float,
) -> Any:
    from docx.shared import Inches
    from docxtpl import InlineImage

    if isinstance(data, dict):
        if set(data.keys()) == {"__image_path__"}:
            return InlineImage(
                tpl=tpl,
                image_descriptor=data["__image_path__"],
                width=Inches(image_width),
                height=Inches(image_height),
            )
        return {
            key: _attach_inline_images(tpl, value, image_width, image_height)
            for key, value in data.items()
        }
    if isinstance(data, list):
        return [_attach_inline_images(tpl, item, image_width, image_height) for item in data]
    return data


def _render_template(
    template_path: Path,
    json_path: Path,
    output_path: Path,
    image_directory: Path,
    image_width: float,
    image_height: float,
) -> None:
    from docxtpl import DocxTemplate

    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")
    if not json_path.exists():
        raise FileNotFoundError(f"JSON not found: {json_path}")

    raw_data = _load_json(json_path)
    preprocessed = _preprocess_images(raw_data, image_directory)

    tpl = DocxTemplate(str(template_path))
    payload = _attach_inline_images(tpl, preprocessed, image_width, image_height)
    tpl.render(payload)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    tpl.save(str(output_path))


def _norm_stem(s: str) -> str:
    """归一化文件名 stem:去数字前缀,kebab/camel→snake,小写。"""
    import re as _re
    s = _re.sub(r"^\d+[_\-]", "", s)
    s = _re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", s)
    s = s.replace("-", "_").lower()
    return s


def _feature_stems_from_manual(manual_json_path: Path | None) -> list[str]:
    """按操作手册 JSON 中模块/章节/功能点的顺序,提取每个 feature 的源码标识 stem。
    标识来源:feature.功能截图 路径的 basename → 去后缀 → _norm_stem。
    例: 03_hydro_meteo.png → hydro_meteo
    """
    if not manual_json_path or not manual_json_path.exists():
        return []
    try:
        data = _load_json(manual_json_path)
    except Exception:
        return []
    stems: list[str] = []
    seen: set[str] = set()
    for module in data.get("模块列表", []):
        for sec in module.get("章节列表", []):
            for feat in sec.get("功能点列表", []):
                shot = (feat.get("功能截图") or "").strip()
                if not shot:
                    continue
                base = Path(shot).stem
                norm = _norm_stem(base)
                if norm and norm not in seen:
                    seen.add(norm)
                    stems.append(norm)
    return stems


def _file_feature_key(rel_path: str) -> str:
    """从源码相对路径派生 feature 标识,用于和操作手册的 feature stem 对齐。
    优先级:文件 stem(snake_norm) → 父目录名(snake_norm)。
    例:
      backend/app/api/hydro_meteo.py    → hydro_meteo
      frontend/src/views/hydro-meteo/index.vue → hydro_meteo  (取父目录)
      frontend/src/api/hydroMeteo.ts    → hydro_meteo
    """
    p = Path(rel_path)
    stem = _norm_stem(p.stem)
    if stem and stem not in {"index", "main", "app"}:
        return stem
    parent = p.parent.name
    if parent:
        return _norm_stem(parent)
    return stem


def _scan_source_files(project_root: Path, manual_json_path: Path | None = None) -> list[dict[str, Any]]:
    """扫描源码文件,支持 Flask / FastAPI / Vue 多种项目结构。

    若提供 manual_json_path,则按操作手册的 feature 顺序排列源码:
    同 feature 的 backend/frontend 文件聚到一起,顺序与操作手册章节列表一致。
    每个 feature 内部仍按 backend(api→models→services) → frontend(views→api) 子优先级排。
    """
    results: list[dict[str, Any]] = []
    # feature_stems 用于排序;若为空则按基础类别优先级排
    feature_stems = _feature_stems_from_manual(manual_json_path)
    feature_idx = {stem: i for i, stem in enumerate(feature_stems)}

    def feature_priority(rel_path: str, base: int) -> int:
        """计算文件优先级:有 manual 时按 feature 顺序,base 决定 feature 内部顺序。"""
        if not feature_stems:
            return base
        key = _file_feature_key(rel_path)
        # 1000 + feature_index*100 + base(在 feature 内的子序);未匹配的归到 9999+base
        if key in feature_idx:
            return 1000 + feature_idx[key] * 100 + base
        return 9000 + base

    # ---- Flask 风格(原有逻辑,优先级低于 FastAPI/Vue) ----
    app_path = project_root / "app.py"
    if app_path.exists():
        results.append({"path": "app.py", "content": app_path.read_text(encoding="utf-8"), "priority": 10})

    templates_dir = project_root / "templates"
    if templates_dir.exists() and templates_dir.is_dir():
        for html_path in sorted(templates_dir.glob("*.html"), key=lambda p: p.name):
            if html_path.name in EXCLUDED_HTML_FILES:
                continue
            priority = 20 if html_path.name == "login.html" else 21
            results.append({"path": f"templates/{html_path.name}",
                            "content": html_path.read_text(encoding="utf-8"), "priority": priority})

    # ---- FastAPI 后端(backend/app/) ----
    backend_root = project_root / "backend" / "app"
    if backend_root.exists() and backend_root.is_dir():
        # main.py 永远优先(基础设施类,排在 feature 之前)
        main_py = backend_root / "main.py"
        if main_py.exists():
            results.append({"path": "backend/app/main.py",
                            "content": main_py.read_text(encoding="utf-8", errors="ignore"), "priority": 100})
        # api / models / services / middleware / utils
        # base 决定 feature 内部顺序: api(0) < models(1) < services(2) < middleware(3) < utils(4)
        for sub, base_in_feature, infra_priority in (
            ("api", 0, 110),
            ("models", 1, 120),
            ("services", 2, 130),
            ("middleware", 3, 140),
            ("utils", 4, 150),
        ):
            sub_dir = backend_root / sub
            if not sub_dir.exists():
                continue
            for py in sorted(sub_dir.rglob("*.py"), key=lambda p: p.name):
                if "__pycache__" in py.parts or py.name == "__init__.py":
                    continue
                rel = py.relative_to(project_root).as_posix()
                results.append({
                    "path": rel,
                    "content": py.read_text(encoding="utf-8", errors="ignore"),
                    "priority": feature_priority(rel, base_in_feature) if feature_stems else infra_priority,
                })

    # ---- Vue 前端(frontend/src/) ----
    fe_root = project_root / "frontend" / "src"
    if fe_root.exists() and fe_root.is_dir():
        # main / App / router 永远优先(基础设施)
        for fname, p in (("main.ts", 200), ("main.js", 200), ("App.vue", 201)):
            fpath = fe_root / fname
            if fpath.exists():
                results.append({"path": f"frontend/src/{fname}",
                                "content": fpath.read_text(encoding="utf-8", errors="ignore"), "priority": p})
        if (fe_root / "router").exists():
            for fpath in (fe_root / "router").rglob("*.ts"):
                rel = fpath.relative_to(project_root).as_posix()
                results.append({"path": rel,
                                "content": fpath.read_text(encoding="utf-8", errors="ignore"), "priority": 210})
        # views/**.vue —— feature 路由页(base=5,放在 backend 之后)
        views_dir = fe_root / "views"
        if views_dir.exists():
            for vue in sorted(views_dir.rglob("*.vue"), key=lambda p: p.as_posix()):
                rel = vue.relative_to(project_root).as_posix()
                results.append({
                    "path": rel,
                    "content": vue.read_text(encoding="utf-8", errors="ignore"),
                    "priority": feature_priority(rel, 5) if feature_stems else 220,
                })
        # api/*.ts —— feature 接口封装(base=6)
        api_dir = fe_root / "api"
        if api_dir.exists():
            for ts in sorted(api_dir.rglob("*.ts"), key=lambda p: p.as_posix()):
                rel = ts.relative_to(project_root).as_posix()
                results.append({
                    "path": rel,
                    "content": ts.read_text(encoding="utf-8", errors="ignore"),
                    "priority": feature_priority(rel, 6) if feature_stems else 230,
                })

    results.sort(key=lambda item: item["priority"])
    return results


def _generate_source_doc(
    system_name: str,
    project_root: Path,
    output_path: Path,
    manual_json_path: Path | None = None,
) -> None:
    """用 `代码文档模版.docx` 渲染代码文档,保留页眉 `{{系统名}}` 与分页设置。

    渲染策略:
    1. 用 docxtpl 渲染 `{{系统名}}`(页眉);`{{contents}}` 留空字符串,生成纯净骨架。
    2. 用 python-docx 打开骨架,定位原 `{{contents}}` 所在段落(此时变成空段),
       在该位置之后逐项插入 `<文件路径作为 Heading2> + <文件内容(Courier New)>`,
       最后删除原占位段。
    这样既保留了模板的页眉/页脚/页边距/分页设置,又避免了 docxtpl subdoc 把 XML
    嵌入 `<w:t>` 导致的格式问题。

    源码顺序:若提供 manual_json_path,按操作手册的功能模块顺序排列(同 feature 的
    backend api/models/services + frontend views/api 聚到一起);否则按基础类别排序。
    """
    from docx import Document as _Document
    from docx.shared import Pt as _Pt
    from copy import deepcopy

    template_path = BUNDLED_TEMPLATES_DIR / "代码文档模版.docx"
    if not template_path.exists():
        raise FileNotFoundError(f"Code document template not found: {template_path}")

    source_files = _scan_source_files(project_root, manual_json_path=manual_json_path)
    if not source_files:
        raise RuntimeError("No source files found for code document generation")

    # ---- step 1: 用 docxtpl 渲染页眉的 {{系统名}},正文 {{contents}} 留空字符串 ----
    output_path.parent.mkdir(parents=True, exist_ok=True)
    from docxtpl import DocxTemplate
    tpl = DocxTemplate(str(template_path))
    tpl.render({"系统名": system_name, "contents": ""})
    tpl.save(str(output_path))

    # ---- step 2: 用 python-docx 打开骨架,在 {{contents}} 段后插入源码 ----
    doc = _Document(str(output_path))

    # 定位原 {{contents}} 所在段(渲染后变成空格段或空段)
    # 模板中该段唯一,是正文唯一段
    target_para = None
    body_paragraphs = list(doc.paragraphs)
    if body_paragraphs:
        # 优先选只含空白字符的段(Jinja 渲染 {{contents}}="" 后,留下原段标记+前导空格)
        for p in body_paragraphs:
            if p.text.strip() == "":
                target_para = p
                break
        # 兜底:取第一段
        if target_para is None:
            target_para = body_paragraphs[0]

    target_elem = target_para._p
    parent = target_elem.getparent()
    insert_index = list(parent).index(target_elem)

    # 在 target 之前依次插入,target 留作末尾占位段
    for i, item in enumerate(source_files):
        # 文件路径作为 Heading2
        h = doc.add_paragraph(item["path"], style="Heading 2")
        # 内容段,等宽字体
        c = doc.add_paragraph()
        run = c.add_run(item["content"])
        run.font.name = "Courier New"
        run.font.size = _Pt(9)
        # 把刚加在文档尾部的段移动到 target 之前
        for new_para in (h, c):
            new_elem = new_para._p
            parent.remove(new_elem)
            parent.insert(insert_index, new_elem)
            insert_index += 1
        if i < len(source_files) - 1:
            sep = doc.add_paragraph("")
            sep_elem = sep._p
            parent.remove(sep_elem)
            parent.insert(insert_index, sep_elem)
            insert_index += 1

    # 删除原 {{contents}} 占位空段
    parent.remove(target_elem)

    doc.save(str(output_path))


def _run_batch(args: argparse.Namespace) -> None:
    # 模板/JSON/默认图片始终从 skill 内置取(稳定且无外部依赖)
    # project_root 仅用于:(1) 代码文档读取真实项目源码; (2) 派生默认输出目录 docs/文档输出/<系统名>/
    templates_dir = BUNDLED_TEMPLATES_DIR
    default_images_dir = BUNDLED_IMAGES_DIR
    if args.project_root:
        root = Path(args.project_root).resolve()
        source_dir = root
    else:
        root = None
        source_dir = BUNDLED_SOURCE_DIR

    images_dir = _resolve_optional_path(args.images_dir, default_images_dir, root)

    manual_tpl = templates_dir / "操作手册内置模板2.docx"
    desc_tpl = templates_dir / "系统说明文档内置模板2.docx"

    manual_json = _resolve_optional_path(args.manual_json, BUNDLED_MANUAL_JSON, root)
    desc_json = _resolve_optional_path(args.description_json, BUNDLED_DESCRIPTION_JSON, root)

    system_name = args.system_name
    if not system_name:
        system_name = _load_json(desc_json).get("系统名", "文档系统")

    # 默认输出到 <project_root>/docs/文档输出/<系统名>/;只有用户显式传 --output-dir 才用旧行为
    if args.output_dir:
        output_dir = _resolve_optional_path(args.output_dir, DEFAULT_OUTPUT_DIR, root)
    else:
        output_dir = _project_output_dir(root, system_name) if args.project_root else DEFAULT_OUTPUT_DIR

    manual_out = output_dir / f"{system_name}-操作手册.docx"
    desc_out = output_dir / f"{system_name}-系统说明.docx"
    code_out = output_dir / f"{system_name}-代码文档.docx"

    _render_template(
        template_path=manual_tpl,
        json_path=manual_json,
        output_path=manual_out,
        image_directory=images_dir,
        image_width=args.image_width,
        image_height=args.image_height,
    )

    _render_template(
        template_path=desc_tpl,
        json_path=desc_json,
        output_path=desc_out,
        image_directory=images_dir,
        image_width=args.image_width,
        image_height=args.image_height,
    )

    _generate_source_doc(system_name, source_dir, code_out, manual_json_path=manual_json)

    print("Batch generation completed:")
    print(f"- {manual_out}")
    print(f"- {desc_out}")
    print(f"- {code_out}")


def _run_batch_auto(args: argparse.Namespace) -> None:
    root: Path | None = None
    if args.project_root:
        root = Path(args.project_root).resolve()
        templates_dir = root / "templates"
        source_dir = root
        default_images_dir = root / "images"
        default_json_dir = root
    else:
        templates_dir = BUNDLED_TEMPLATES_DIR
        source_dir = BUNDLED_SOURCE_DIR
        default_images_dir = BUNDLED_IMAGES_DIR
        default_json_dir = BUNDLED_JSON_DIR

    json_dir = _resolve_optional_path(args.json_dir, default_json_dir, root)
    resolved_system_name, manual_json, desc_json = _resolve_json_pair(json_dir, args.system_name)

    proxy = argparse.Namespace(
        project_root=str(root) if root else "",
        images_dir=args.images_dir,
        output_dir=args.output_dir,
        image_width=args.image_width,
        image_height=args.image_height,
        system_name=resolved_system_name,
        manual_json=str(manual_json),
        description_json=str(desc_json),
    )
    _run_batch(proxy)


def _run_render(args: argparse.Namespace) -> None:
    root = Path(args.project_root).resolve() if args.project_root else SKILL_ROOT
    template_path = Path(args.template)
    json_path = Path(args.json)
    images_dir = Path(args.images_dir).resolve() if args.images_dir else root / "images"

    if not template_path.is_absolute():
        template_path = root / template_path
    if not json_path.is_absolute():
        json_path = root / json_path

    # 自动派生输出路径:--output 未指定时,用 <project_root>/docs/文档输出/<系统名>/<JSON-stem>.docx
    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = root / output_path
    else:
        system_name = (_load_json(json_path).get("系统名") or "").strip() or json_path.stem
        output_path = _project_output_dir(root, system_name) / f"{json_path.stem}.docx"

    _render_template(
        template_path=template_path,
        json_path=json_path,
        output_path=output_path,
        image_directory=images_dir,
        image_width=args.image_width,
        image_height=args.image_height,
    )
    print(f"Rendered document: {output_path}")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Render fixed-template DOCX documents from JSON")
    subparsers = parser.add_subparsers(dest="command", required=True)

    render = subparsers.add_parser("render", help="Render a single template + JSON into DOCX")
    render.add_argument("--project-root", default="", help="Project root path")
    render.add_argument("--template", required=True, help="Template .docx path")
    render.add_argument("--json", required=True, help="JSON input path")
    render.add_argument(
        "--output",
        default="",
        help="Output .docx path. 不传时自动派生为 <project-root>/docs/文档输出/<JSON.系统名>/<JSON-stem>.docx",
    )
    render.add_argument("--images-dir", default="", help="Image directory path")
    render.add_argument("--image-width", type=float, default=6.5, help="Image width in inches")
    render.add_argument("--image-height", type=float, default=4.9, help="Image height in inches")
    render.set_defaults(func=_run_render)

    batch = subparsers.add_parser("batch", help="Generate manual/description/code docs")
    batch.add_argument("--project-root", default="", help="Optional external project root path")
    batch.add_argument("--system-name", default="", help="System name for output filenames")
    batch.add_argument("--manual-json", default="", help="Operation manual JSON path")
    batch.add_argument("--description-json", default="", help="System description JSON path")
    batch.add_argument("--images-dir", default="", help="Image directory path")
    batch.add_argument("--output-dir", default="", help="Output directory path")
    batch.add_argument("--image-width", type=float, default=6.5, help="Image width in inches")
    batch.add_argument("--image-height", type=float, default=4.9, help="Image height in inches")
    batch.set_defaults(func=_run_batch)

    batch_auto = subparsers.add_parser(
        "batch-auto",
        help="Auto-detect JSON pair by system name and generate three docs",
    )
    batch_auto.add_argument("--project-root", default="", help="Optional external project root path")
    batch_auto.add_argument("--json-dir", default="", help="Optional JSON directory path")
    batch_auto.add_argument("--system-name", default="", help="System name for JSON pair matching")
    batch_auto.add_argument("--images-dir", default="", help="Image directory path")
    batch_auto.add_argument("--output-dir", default="", help="Output directory path")
    batch_auto.add_argument("--image-width", type=float, default=6.5, help="Image width in inches")
    batch_auto.add_argument("--image-height", type=float, default=4.9, help="Image height in inches")
    batch_auto.set_defaults(func=_run_batch_auto)

    return parser


def main() -> None:
    parser = _build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
