---
name: patents-search
description: Search Google Patents via captured xhr/query, xhr/parse, and xhr/result endpoints, retrieve patent details by keyword or publication number, return PDF download links, and help patent drafters or patent agents analyze prior art, claim elements, technical effects, family status, inventors, assignees, and drafting or office-action response references. Use when the user asks to search patents, query patent numbers such as CN111938952B, download patent PDFs, compare patent documents, extract technical features, or support patent application drafting and patent prosecution responses.
---

# Patents Search

Use this skill to retrieve patent data from Google Patents and turn it into drafting-grade reference material.

## Core Tool

Prefer the bundled script:

```powershell
$env:patents-search_PROXY = "http://127.0.0.1:10809"
python skills/patents-search/scripts/patents-search.py search "护理机器人" --limit 10 --lang zh
python skills/patents-search/scripts/patents-search.py detail CN111938952B --lang zh --download-pdf --out downloads/patents
```

The script reads proxy settings in this order:

1. `patents-search_PROXY`
2. `HTTPS_PROXY`
3. `HTTP_PROXY`

Set `patents-search_PROXY` when the user provides a local proxy, for example `http://127.0.0.1:10809`.

## Workflow

For keyword searches:

1. Run `patents-search.py search "<keyword>" --limit <n> --lang zh`.
2. The script calls `https://patents.google.com/xhr/query` with nested query `q=(<keyword>)&oq=<keyword>`.
3. Use `pdf_url`, `publication_number`, `title`, `snippet`, `inventor`, `assignee`, and dates from each result.
4. Open promising records with `detail` before relying on them in drafting work.

For publication numbers:

1. Run `patents-search.py detail <publication_number> --lang zh --download-pdf`.
2. The script first calls `https://patents.google.com/xhr/parse` to resolve the exact Google Patents `id`.
3. The script then calls `https://patents.google.com/xhr/result` with that `id` to retrieve HTML details and the PDF link.
4. If the result is missing or translated poorly, retry with `--lang en`.

For patent drafting support:

1. Group results by technical problem, solution means, control flow, mechanical structure, software process, and measurable technical effect.
2. Identify claim-relevant features: independent claim skeleton, optional dependent claim features, key components, data flows, method steps, and use scenarios.
3. Call out prior-art risks: identical purpose, overlapping core structure, same control method, same sensor/actuator combination, or broad generic claims.
4. For office-action responses, compare the cited document against the target invention by problem, feature combination, sequence constraints, and achieved effect.

## Interface Notes

The implementation is based on captured Google Patents traffic. Load [references/google_patents_xhr.md](references/google_patents_xhr.md) when changing the script or debugging endpoint behavior.

Do not expose browser cookies from mitmproxy logs. The public endpoints usually work with normal browser-like headers and proxy routing.
