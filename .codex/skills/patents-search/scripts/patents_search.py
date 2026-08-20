#!/usr/bin/env python3
"""Search Google Patents XHR endpoints and return structured patent data."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

BASE_URL = "https://patents.google.com"
PDF_BASE_URL = "https://patentimages.storage.googleapis.com"
DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://patents.google.com/",
}


def get_proxy() -> str:
    return (
        os.environ.get("PATENTS_SEARCH_PROXY")
        or os.environ.get("HTTPS_PROXY")
        or os.environ.get("HTTP_PROXY")
        or ""
    ).strip()


def build_opener() -> urllib.request.OpenerDirector:
    proxy = get_proxy()
    if proxy:
        return urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": proxy, "https": proxy})
        )
    return urllib.request.build_opener()


def http_get(url: str, timeout: int = 30) -> bytes:
    request = urllib.request.Request(url, headers=DEFAULT_HEADERS, method="GET")
    try:
        with build_opener().open(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"HTTP {exc.code} for {url}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error for {url}: {exc.reason}") from exc


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def full_pdf_url(path_or_url: str) -> str:
    if not path_or_url:
        return ""
    if path_or_url.startswith(("http://", "https://")):
        return path_or_url
    return f"{PDF_BASE_URL}/{path_or_url.lstrip('/')}"


def detail_url_from_id(result_id: str) -> str:
    if not result_id:
        return ""
    return urllib.parse.urljoin(BASE_URL + "/", result_id)


def normalize_result(item: dict[str, Any]) -> dict[str, Any]:
    patent = item.get("patent") or {}
    result_id = item.get("id") or ""
    return {
        "rank": item.get("rank"),
        "id": result_id,
        "publication_number": patent.get("publication_number") or "",
        "title": clean_text(patent.get("title")),
        "snippet": clean_text(patent.get("snippet")),
        "inventor": clean_text(patent.get("inventor")),
        "assignee": clean_text(patent.get("assignee")),
        "priority_date": patent.get("priority_date") or "",
        "filing_date": patent.get("filing_date") or "",
        "publication_date": patent.get("publication_date") or "",
        "grant_date": patent.get("grant_date") or "",
        "language": patent.get("language") or "",
        "detail_url": detail_url_from_id(result_id),
        "pdf_url": full_pdf_url(patent.get("pdf") or ""),
        "family_country_status": (
            (patent.get("family_metadata") or {})
            .get("aggregated", {})
            .get("country_status", [])
        ),
    }


def search_patents(keyword: str, limit: int, lang: str = "zh", page: int = 0) -> dict[str, Any]:
    nested = {"q": f"({keyword})", "oq": keyword}
    if page > 0:
        nested["page"] = str(page)
    query = {
        "url": urllib.parse.urlencode(nested, doseq=True),
        "exp": "",
        "tags": "",
    }
    endpoint = f"{BASE_URL}/xhr/query?{urllib.parse.urlencode(query)}"
    data = json.loads(http_get(endpoint).decode("utf-8", errors="replace"))
    results = data.get("results") or {}
    flattened: list[dict[str, Any]] = []
    for cluster in results.get("cluster") or []:
        for item in cluster.get("result") or []:
            flattened.append(normalize_result(item))
            if len(flattened) >= limit:
                break
        if len(flattened) >= limit:
            break
    return {
        "status": 1,
        "message": "success",
        "data": {
            "keyword": keyword,
            "lang": lang,
            "page": page,
            "endpoint": endpoint,
            "total_num_results": results.get("total_num_results"),
            "total_num_pages": results.get("total_num_pages"),
            "items": flattened,
            "summary": results.get("summary") or {},
        },
    }


def parse_publication_number(publication_number: str) -> dict[str, Any]:
    query = {
        "text": publication_number,
        "cursor": str(len(publication_number)),
        "exp": "",
    }
    endpoint = f"{BASE_URL}/xhr/parse?{urllib.parse.urlencode(query)}"
    data = json.loads(http_get(endpoint).decode("utf-8", errors="replace"))
    return {"endpoint": endpoint, "raw": data}


def first_group(pattern: str, text: str) -> str:
    match = re.search(pattern, text, flags=re.I | re.S)
    return clean_text(match.group(1)) if match else ""


def all_itemprops(prop: str, text: str) -> list[str]:
    pattern = rf'<[^>]+itemprop=["\']{re.escape(prop)}["\'][^>]*>(.*?)</[^>]+>'
    values = [clean_text(match) for match in re.findall(pattern, text, flags=re.I | re.S)]
    return [value for value in values if value]


def parse_detail_html(text: str, result_id: str, endpoint: str) -> dict[str, Any]:
    publication_number = first_group(r'itemprop=["\']publicationNumber["\'][^>]*>(.*?)<', text)
    title = first_group(r'itemprop=["\']title["\'][^>]*>(.*?)</', text)
    pdf_url = first_group(r'href=["\']([^"\']+\.pdf)["\'][^>]+itemprop=["\']pdfLink["\']', text)
    if not pdf_url:
        pdf_url = first_group(r'itemprop=["\']pdfLink["\'][^>]+href=["\']([^"\']+\.pdf)["\']', text)
    abstract = first_group(r'<section[^>]+itemprop=["\']abstract["\'][^>]*>(.*?)</section>', text)
    claims = first_group(r'<section[^>]+itemprop=["\']claims["\'][^>]*>(.*?)</section>', text)
    description = first_group(r'<section[^>]+itemprop=["\']description["\'][^>]*>(.*?)</section>', text)
    return {
        "id": result_id,
        "publication_number": publication_number,
        "title": title,
        "inventors": all_itemprops("inventor", text),
        "assignee_current": all_itemprops("assigneeCurrent", text),
        "assignee_original": all_itemprops("assigneeOriginal", text),
        "publication_date": first_group(r'itemprop=["\']publicationDate["\'][^>]*>(.*?)<', text),
        "priority_date": first_group(r'itemprop=["\']priorityDate["\'][^>]*>(.*?)<', text),
        "filing_date": first_group(r'itemprop=["\']filingDate["\'][^>]*>(.*?)<', text),
        "grant_date": first_group(r'itemprop=["\']grantDate["\'][^>]*>(.*?)<', text),
        "abstract": abstract,
        "claims_excerpt": claims[:4000],
        "description_excerpt": description[:4000],
        "detail_url": detail_url_from_id(result_id),
        "pdf_url": full_pdf_url(pdf_url),
        "endpoint": endpoint,
    }


def choose_result_id(publication_number: str, lang: str, parse_info: dict[str, Any]) -> str:
    candidates = parse_info["raw"].get("results") or []
    for candidate in candidates:
        candidate_id = (candidate.get("result") or {}).get("id") or ""
        if candidate_id and candidate_id.endswith(f"/{lang}"):
            return candidate_id
    for candidate in candidates:
        candidate_id = (candidate.get("result") or {}).get("id") or ""
        if candidate_id:
            parts = candidate_id.split("/")
            if len(parts) >= 3:
                parts[-1] = lang
                return "/".join(parts)
            return candidate_id
    return f"patent/{publication_number}/{lang}"


def detail_patent(publication_number: str, lang: str, download_pdf: bool, out_dir: str) -> dict[str, Any]:
    parse_info = parse_publication_number(publication_number)
    result_id = choose_result_id(publication_number, lang, parse_info)
    qs = urllib.parse.urlencode({"oq": publication_number})
    query = {"id": result_id, "qs": qs, "exp": ""}
    endpoint = f"{BASE_URL}/xhr/result?{urllib.parse.urlencode(query)}"
    html_text = http_get(endpoint).decode("utf-8", errors="replace")
    detail = parse_detail_html(html_text, result_id, endpoint)
    detail["parse_endpoint"] = parse_info["endpoint"]

    if download_pdf and detail.get("pdf_url"):
        out_path = download_pdf_file(detail["pdf_url"], publication_number, out_dir)
        detail["pdf_path"] = str(out_path)

    return {"status": 1, "message": "success", "data": detail}


def download_pdf_file(pdf_url: str, publication_number: str, out_dir: str) -> Path:
    target_dir = Path(out_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{publication_number}.pdf"
    target.write_bytes(http_get(pdf_url, timeout=60))
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="Search Google Patents and retrieve details.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search", help="Search patents by keyword.")
    search_parser.add_argument("keyword")
    search_parser.add_argument("--limit", type=int, default=10)
    search_parser.add_argument("--lang", default="zh")
    search_parser.add_argument("--page", type=int, default=0)

    detail_parser = subparsers.add_parser("detail", help="Get patent detail by publication number.")
    detail_parser.add_argument("publication_number")
    detail_parser.add_argument("--lang", default="zh")
    detail_parser.add_argument("--download-pdf", action="store_true")
    detail_parser.add_argument("--out", default="downloads/patents")

    args = parser.parse_args()
    try:
        if args.command == "search":
            payload = search_patents(args.keyword, args.limit, args.lang, args.page)
        else:
            payload = detail_patent(
                args.publication_number,
                args.lang,
                args.download_pdf,
                args.out,
            )
    except Exception as exc:
        payload = {"status": 0, "message": "fail", "data": {"error": str(exc)}}
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 1

    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
