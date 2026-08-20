#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PII 数据脱敏 / 还原 —— 单文件自包含版（pii-masking skill 自带，可独立运行）

本文件不依赖本仓库的任何其它模块，仅用 Python 标准库（json/re/csv/os/shutil/argparse）。
把它单独拷到任何机器、任何目录，装个 Python 3.7+ 就能直接跑：

  # 表格按列脱敏（工资表）：指定 列名:类型
  python pii_mask.py mask --in salary.csv --out salary.masked.csv \
      --columns "姓名:姓名,公司:公司,手机号:手机,工资:金额"

  # 自由文本脱敏（强正则字段自动识别 + 姓名/公司词表）
  python pii_mask.py mask --in note.txt --out note.masked.txt \
      --names "张三,李四" --orgs "北京华信科技有限公司"

  # 整个文件夹批量脱敏（递归，另存为新目录，整批共用一份映射表）
  python pii_mask.py mask --in ./hr_data --out ./hr_data_masked \
      --columns "姓名:姓名,公司:公司,工资:金额" --names "张三" --orgs "华信科技"

  # 还原（单文件或目录都支持）
  python pii_mask.py restore --in ./llm_results --out ./final \
      --map ./hr_data_masked/_maskmap.json

设计：每个唯一真实值 -> 一个稳定唯一令牌（如 【脱敏_姓名_001】），同值全篇复用同一令牌，
本地保存双向映射表；大模型只看令牌，处理完成后用映射表把令牌精确还原为真实值。
映射表（.maskmap.json）只留本地，绝不能发给大模型。
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import xml.sax.saxutils as _xss
import zipfile
from typing import Any, Dict, List, Optional, Tuple

# ===========================================================================
# 字段类型常量
# ===========================================================================
FIELD_NAME = "姓名"        # 中文人名
FIELD_PHONE = "手机"       # 手机号
FIELD_IDCARD = "身份证"    # 身份证号
FIELD_BANKCARD = "银行卡"  # 银行卡号
FIELD_EMAIL = "邮箱"       # 邮箱
FIELD_ORG = "公司"         # 公司/组织名称
FIELD_SALARY = "金额"      # 工资/金额

ALL_FIELDS = [
    FIELD_NAME, FIELD_PHONE, FIELD_IDCARD,
    FIELD_BANKCARD, FIELD_EMAIL, FIELD_ORG, FIELD_SALARY,
]

# 令牌前缀，全角方括号 + 固定前缀，模型一般会原样保留
TOKEN_PREFIX = "脱敏"
# 令牌正则：匹配 【脱敏_姓名_001】，方括号容错（允许 [] 或 【】）
TOKEN_RE = re.compile(r"[【\[]\s*脱敏_([^_\]】\s]+)_(\d{3,})\s*[】\]]")

# ---------------------------------------------------------------------------
# 正则检测器（强规则字段）
# ---------------------------------------------------------------------------
_PHONE_RE = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
_IDCARD_RE = re.compile(r"(?<![0-9Xx])\d{17}[\dXx](?![0-9Xx])")
_BANKCARD_RE = re.compile(r"(?<!\d)\d{16,19}(?!\d)")
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

# 检测顺序很重要：邮箱在前（避免邮箱内数字被误判），身份证(18位) 必须在 银行卡(16-19位) 之前
_REGEX_DETECTORS: List[Tuple[str, "re.Pattern[str]"]] = [
    (FIELD_EMAIL, _EMAIL_RE),
    (FIELD_IDCARD, _IDCARD_RE),
    (FIELD_BANKCARD, _BANKCARD_RE),
    (FIELD_PHONE, _PHONE_RE),
]

# 可选启发式：公司/组织后缀（默认关闭，精度有限）
_ORG_HEURISTIC_RE = re.compile(
    r"[一-龥]{2,}(?:股份有限公司|有限责任公司|有限公司|集团|公司|研究院|"
    r"事务所|工作室|中心|工厂|厂|商店|店)"
)


# ===========================================================================
# 核心脱敏器
# ===========================================================================
class PIIMasker:
    """PII 脱敏器：负责脱敏、还原、映射表读写。

    一个实例维护一份映射表，可用于一篇文档/一次会话。需要隔离时新建实例。
    """

    def __init__(self) -> None:
        self._token_to_value: Dict[str, Dict[str, str]] = {}  # token -> {type, value}
        self._value_to_token: Dict[str, str] = {}             # 真实值 -> token（去重）
        self._counters: Dict[str, int] = {}                   # 每种类型的自增计数器

    # ---- 令牌生成 ----
    def _next_token(self, field_type: str) -> str:
        self._counters[field_type] = self._counters.get(field_type, 0) + 1
        seq = self._counters[field_type]
        return f"【{TOKEN_PREFIX}_{field_type}_{seq:03d}】"

    def _get_or_create_token(self, value: str, field_type: str) -> str:
        value = str(value)
        existing = self._value_to_token.get(value)
        if existing is not None:
            return existing
        token = self._next_token(field_type)
        self._token_to_value[token] = {"type": field_type, "value": value}
        self._value_to_token[value] = token
        return token

    # ---- 文本脱敏 ----
    def mask_text(
        self,
        text: str,
        *,
        fields: Optional[List[str]] = None,
        name_list: Optional[List[str]] = None,
        org_list: Optional[List[str]] = None,
        enable_org_heuristic: bool = False,
    ) -> Tuple[str, Dict[str, Dict[str, str]]]:
        if text is None:
            return text, self.map_dict()
        result = str(text)

        # 1) 词表替换（先长后短，避免子串误替换），姓名 + 公司
        for word, ftype in self._build_wordlist(name_list, org_list):
            if not word:
                continue
            token = self._get_or_create_token(word, ftype)
            result = result.replace(word, token)

        # 2) 强正则字段
        active = fields if fields is not None else [
            FIELD_EMAIL, FIELD_IDCARD, FIELD_BANKCARD, FIELD_PHONE,
        ]
        for ftype, pattern in _REGEX_DETECTORS:
            if ftype not in active:
                continue
            result = pattern.sub(
                lambda m: self._get_or_create_token(m.group(0), ftype), result
            )

        # 3) 可选公司启发式
        if enable_org_heuristic:
            result = _ORG_HEURISTIC_RE.sub(
                lambda m: self._get_or_create_token(m.group(0), FIELD_ORG), result
            )

        return result, self.map_dict()

    @staticmethod
    def _build_wordlist(
        name_list: Optional[List[str]], org_list: Optional[List[str]]
    ) -> List[Tuple[str, str]]:
        words: List[Tuple[str, str]] = []
        for w in (name_list or []):
            words.append((str(w).strip(), FIELD_NAME))
        for w in (org_list or []):
            words.append((str(w).strip(), FIELD_ORG))
        words.sort(key=lambda t: len(t[0]), reverse=True)
        return words

    # ---- 表格按列脱敏 ----
    def mask_records(
        self,
        rows: List[Dict[str, Any]],
        sensitive_columns: Dict[str, str],
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, str]]]:
        masked_rows: List[Dict[str, Any]] = []
        for row in rows:
            new_row = dict(row)
            for col, ftype in sensitive_columns.items():
                if col not in new_row:
                    continue
                value = new_row[col]
                if value is None or str(value).strip() == "":
                    continue
                new_row[col] = self._get_or_create_token(str(value), ftype)
            masked_rows.append(new_row)
        return masked_rows, self.map_dict()

    # ---- 还原 ----
    def restore(
        self, obj: Any, mask_map: Optional[Dict[str, Dict[str, str]]] = None
    ) -> Any:
        token_to_value = self._resolve_map(mask_map)
        if not token_to_value:
            return obj
        return self._restore_any(obj, token_to_value)

    def _restore_any(self, obj: Any, token_to_value: Dict[str, str]) -> Any:
        if isinstance(obj, str):
            return self._restore_text(obj, token_to_value)
        if isinstance(obj, dict):
            return {k: self._restore_any(v, token_to_value) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._restore_any(v, token_to_value) for v in obj]
        return obj

    @staticmethod
    def _restore_text(text: str, token_to_value: Dict[str, str]) -> str:
        result = text
        for token in sorted(token_to_value.keys(), key=len, reverse=True):
            if token in result:
                result = result.replace(token, token_to_value[token])

        def _sub(m: "re.Match[str]") -> str:
            ftype, seq = m.group(1), m.group(2)
            canonical = f"【{TOKEN_PREFIX}_{ftype}_{seq}】"
            return token_to_value.get(canonical, m.group(0))

        return TOKEN_RE.sub(_sub, result)

    def _resolve_map(
        self, mask_map: Optional[Dict[str, Dict[str, str]]]
    ) -> Dict[str, str]:
        source = mask_map if mask_map is not None else self._token_to_value
        flat: Dict[str, str] = {}
        for token, info in source.items():
            if isinstance(info, dict):
                flat[token] = str(info.get("value", ""))
            else:  # 兼容 {token: value} 扁平格式
                flat[token] = str(info)
        return flat

    # ---- 映射表读写 ----
    def map_dict(self) -> Dict[str, Dict[str, str]]:
        return {k: dict(v) for k, v in self._token_to_value.items()}

    def dump_map(self, path: str) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.map_dict(), f, ensure_ascii=False, indent=2)

    @classmethod
    def load_map(cls, path: str) -> "PIIMasker":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return cls.from_map(data)

    @classmethod
    def from_map(cls, mask_map: Dict[str, Dict[str, str]]) -> "PIIMasker":
        inst = cls()
        for token, info in mask_map.items():
            if isinstance(info, dict):
                ftype = info.get("type", "")
                value = str(info.get("value", ""))
            else:
                ftype, value = "", str(info)
            inst._token_to_value[token] = {"type": ftype, "value": value}
            inst._value_to_token[value] = token
            m = TOKEN_RE.match(token)  # 恢复计数器，避免新增令牌与已有令牌冲突
            if m:
                ftype2, seq = m.group(1), int(m.group(2))
                inst._counters[ftype2] = max(inst._counters.get(ftype2, 0), seq)
        return inst


# ===========================================================================
# CLI —— 文件 / 文件夹 脱敏 / 还原
# ===========================================================================
DEFAULT_TEXT_EXTS = {
    ".txt", ".csv", ".tsv", ".md", ".markdown", ".json", ".log",
    ".html", ".htm", ".xml", ".yaml", ".yml", ".sql", ".ini", ".conf",
    ".py", ".js", ".ts", ".java", ".go", ".css", ".srt", ".vtt",
}


def _parse_columns(spec: str) -> Dict[str, str]:
    """解析 '列名:类型,列名:类型' 为 {列名: 类型}。"""
    mapping: Dict[str, str] = {}
    for part in (spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            col, ftype = part.split(":", 1)
        else:
            col, ftype = part, part
        mapping[col.strip()] = ftype.strip()
    return mapping


def _split_list(value: str) -> List[str]:
    return [w.strip() for w in (value or "").split(",") if w.strip()]


def _parse_exts(value: str) -> set:
    if not value:
        return set(DEFAULT_TEXT_EXTS)
    out = set()
    for e in value.split(","):
        e = e.strip().lower()
        if e and not e.startswith("."):
            e = "." + e
        if e:
            out.add(e)
    return out


def _is_text_file(path: str, text_exts: set) -> bool:
    return os.path.splitext(path)[1].lower() in text_exts


def _is_docx(path: str) -> bool:
    return path.lower().endswith(".docx")


# ---------------------------------------------------------------------------
# Word .docx 支持（纯标准库 zipfile）：只对 word/*.xml 里 <w:t> 文本节点脱敏，
# 保留排版、图片、表格结构，输出仍是可正常打开的 .docx。
# ---------------------------------------------------------------------------
# 需要处理文本的 XML 部件：正文 / 页眉 / 页脚 / 脚注 / 尾注
_DOCX_PART_RE = re.compile(r"word/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$")
# 匹配一个文本运行 <w:t ...>文本</w:t>，分三组保留首尾标签、只换中间文本
_WT_RE = re.compile(r"(<w:t\b[^>]*>)(.*?)(</w:t>)", re.S)


def _docx_apply(in_path: str, out_path: str, run_transform) -> None:
    """打开 docx(zip)，对正文等 XML 里每个 <w:t> 文本运行 run_transform，重新打包为合法 docx。"""
    with zipfile.ZipFile(in_path, "r") as zin:
        items = zin.infolist()
        data = {it.filename: zin.read(it.filename) for it in items}

    for name in list(data.keys()):
        if not _DOCX_PART_RE.search(name):
            continue
        xml = data[name].decode("utf-8")

        def repl(m):
            inner = m.group(2)
            if not inner:
                return m.group(0)
            raw = _xss.unescape(inner)          # XML 实体 -> 原文
            new = run_transform(raw)            # 脱敏 / 还原
            return m.group(1) + _xss.escape(new) + m.group(3)  # 原文 -> XML 实体

        data[name] = _WT_RE.sub(repl, xml).encode("utf-8")

    # 用原 ZipInfo 重新写，保留每个条目的压缩方式
    with zipfile.ZipFile(out_path, "w") as zout:
        for it in items:
            zout.writestr(it, data[it.filename])


def _mask_docx(masker, in_path, out_path, names, orgs, org_heuristic) -> bool:
    def tf(text):
        masked, _ = masker.mask_text(
            text, name_list=names, org_list=orgs, enable_org_heuristic=org_heuristic
        )
        return masked
    _docx_apply(in_path, out_path, tf)
    return True


def _restore_docx(masker, in_path, out_path) -> bool:
    _docx_apply(in_path, out_path, lambda t: masker.restore(t))
    return True


def _mask_one_file(masker, in_path, out_path, columns_map, names, orgs, org_heuristic) -> bool:
    """脱敏单个文件（文本/CSV/Word）。返回 True 表示已脱敏，False 表示原样复制。"""
    if _is_docx(in_path):
        return _mask_docx(masker, in_path, out_path, names, orgs, org_heuristic)
    is_csv = in_path.lower().endswith(".csv")
    try:
        if is_csv and columns_map:
            with open(in_path, encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                fieldnames = reader.fieldnames
                rows = list(reader)
            masked_rows, _ = masker.mask_records(rows, columns_map)
            with open(out_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(masked_rows)
        else:
            with open(in_path, encoding="utf-8") as f:
                text = f.read()
            masked, _ = masker.mask_text(
                text, name_list=names, org_list=orgs,
                enable_org_heuristic=org_heuristic,
            )
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(masked)
        return True
    except (UnicodeDecodeError, ValueError):
        shutil.copy2(in_path, out_path)  # 非 UTF-8 文本，按二进制原样复制
        return False


def _restore_one_file(masker, in_path, out_path) -> bool:
    """还原单个文件（文本/CSV/Word）。返回 True 表示已还原，False 表示复制。"""
    if _is_docx(in_path):
        return _restore_docx(masker, in_path, out_path)
    try:
        if in_path.lower().endswith(".csv"):
            with open(in_path, encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                fieldnames = reader.fieldnames
                rows = list(reader)
            restored = masker.restore(rows)
            with open(out_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(restored)
        else:
            with open(in_path, encoding="utf-8") as f:
                text = f.read()
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(masker.restore(text))
        return True
    except (UnicodeDecodeError, ValueError):
        shutil.copy2(in_path, out_path)
        return False


def _walk_files(root):
    """递归产出 (绝对路径, 相对 root 的路径)。"""
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root)
            yield full, rel


def cmd_mask(args) -> None:
    masker = PIIMasker()
    columns_map = _parse_columns(args.columns)
    names = _split_list(args.names)
    orgs = _split_list(args.orgs)
    text_exts = _parse_exts(args.ext)

    if os.path.isdir(args.infile):
        os.makedirs(args.outfile, exist_ok=True)
        masked_n = copied_n = 0
        for full, rel in _walk_files(args.infile):
            out_path = os.path.join(args.outfile, rel)
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            if _is_text_file(full, text_exts) or _is_docx(full):
                ok = _mask_one_file(masker, full, out_path, columns_map, names, orgs, args.org_heuristic)
                masked_n += 1 if ok else 0
                copied_n += 0 if ok else 1
            else:
                shutil.copy2(full, out_path)
                copied_n += 1
        map_path = args.map or os.path.join(args.outfile, "_maskmap.json")
        masker.dump_map(map_path)
        print(f"[OK] 文件夹脱敏完成 -> {args.outfile}")
        print(f"     脱敏 {masked_n} 个文本文件，原样复制 {copied_n} 个文件")
    else:
        out_dir = os.path.dirname(os.path.abspath(args.outfile))
        os.makedirs(out_dir, exist_ok=True)
        ok = _mask_one_file(masker, args.infile, args.outfile, columns_map, names, orgs, args.org_heuristic)
        if not ok:
            print("[WARN] 该文件非 UTF-8 文本，已原样复制，未脱敏")
        map_path = args.map or (args.outfile + ".maskmap.json")
        masker.dump_map(map_path)
        print(f"[OK] 脱敏完成 -> {args.outfile}")

    print(f"[OK] 映射表 -> {map_path}  （共 {len(masker.map_dict())} 个令牌，请勿提交给大模型）")


def cmd_restore(args) -> None:
    masker = PIIMasker.load_map(args.map)
    text_exts = _parse_exts(args.ext)

    if os.path.isdir(args.infile):
        os.makedirs(args.outfile, exist_ok=True)
        restored_n = copied_n = 0
        for full, rel in _walk_files(args.infile):
            out_path = os.path.join(args.outfile, rel)
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            if _is_text_file(full, text_exts) or _is_docx(full):
                ok = _restore_one_file(masker, full, out_path)
                restored_n += 1 if ok else 0
                copied_n += 0 if ok else 1
            else:
                shutil.copy2(full, out_path)
                copied_n += 1
        print(f"[OK] 文件夹还原完成 -> {args.outfile}")
        print(f"     还原 {restored_n} 个文本文件，原样复制 {copied_n} 个文件")
    else:
        os.makedirs(os.path.dirname(os.path.abspath(args.outfile)), exist_ok=True)
        _restore_one_file(masker, args.infile, args.outfile)
        print(f"[OK] 还原完成 -> {args.outfile}")


def _demo() -> None:
    """无参数自检：跑一遍文本/表格 round-trip，证明脚本本身可独立运行。"""
    print("== pii_mask.py 自检（独立运行 round-trip）==")
    m = PIIMasker()
    text = "张三的手机是13812345678，身份证110101199003071234，邮箱a@b.com，就职于北京华信科技有限公司。"
    masked, _ = m.mask_text(text, name_list=["张三"], org_list=["北京华信科技有限公司"])
    assert "13812345678" not in masked and "张三" not in masked, "脱敏失败"
    assert m.restore(masked) == text, "文本还原不一致"
    rows = [{"姓名": "张三", "公司": "北京华信科技有限公司", "工资": "18500"}]
    mrows, _ = m.mask_records(rows, {"姓名": FIELD_NAME, "公司": FIELD_ORG, "工资": FIELD_SALARY})
    assert "张三" not in json.dumps(mrows, ensure_ascii=False), "表格脱敏失败"
    assert m.restore(mrows) == rows, "表格还原不一致"
    print("  脱敏示例：", masked)
    print("  还原示例：", m.restore(masked))
    print("[OK] 自检通过：脱敏 / 还原 round-trip 一致。")
    print("用法见 --help：python pii_mask.py mask|restore --in ... --out ...")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="PII 数据脱敏 / 还原（单文件自包含，可独立运行；支持单文件与文件夹）"
    )
    sub = parser.add_subparsers(dest="cmd")

    p_mask = sub.add_parser("mask", help="脱敏文件或文件夹")
    p_mask.add_argument("--in", dest="infile", required=True, help="输入文件或文件夹")
    p_mask.add_argument("--out", dest="outfile", required=True, help="输出脱敏文件或文件夹")
    p_mask.add_argument("--map", dest="map", default=None,
                        help="映射表输出路径（单文件默认 <out>.maskmap.json，目录默认 <out>/_maskmap.json）")
    p_mask.add_argument("--columns", default="", help="CSV 敏感列，格式 '列名:类型,列名:类型'（对所有 CSV 生效）")
    p_mask.add_argument("--names", default="", help="人名词表，逗号分隔")
    p_mask.add_argument("--orgs", default="", help="公司/组织词表，逗号分隔")
    p_mask.add_argument("--ext", default="", help="按文本处理的扩展名（逗号分隔），默认常见文本类型；其余原样复制")
    p_mask.add_argument("--org-heuristic", action="store_true", help="启用公司后缀启发式（精度有限）")
    p_mask.set_defaults(func=cmd_mask)

    p_res = sub.add_parser("restore", help="还原文件或文件夹")
    p_res.add_argument("--in", dest="infile", required=True, help="含令牌的输入文件或文件夹")
    p_res.add_argument("--out", dest="outfile", required=True, help="还原后输出文件或文件夹")
    p_res.add_argument("--map", dest="map", required=True, help="映射表 .maskmap.json")
    p_res.add_argument("--ext", default="", help="按文本处理的扩展名（逗号分隔），默认常见文本类型")
    p_res.set_defaults(func=cmd_restore)

    args = parser.parse_args()
    if not getattr(args, "cmd", None):
        _demo()  # 不带子命令时跑自检，证明可独立运行
        return
    args.func(args)


if __name__ == "__main__":
    main()
