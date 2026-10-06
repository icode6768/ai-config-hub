# Google Patents XHR Reference

This reference records the stable request patterns observed from mitmproxy logs on 2026-06-12.

## Keyword Search: `/xhr/query`

Endpoint:

```text
GET https://patents.google.com/xhr/query
```

Important query parameters:

```text
url=q=(护理机器人)&oq=护理机器人
exp=
tags=
```

Response shape includes `results.total_num_results`, `results.cluster[].result[]`, and `results.summary`.

Each result commonly has:

```json
{
  "id": "patent/CN111938952B/zh",
  "rank": 0,
  "patent": {
    "title": "一种家用护理机器人及控制方法",
    "snippet": "...",
    "priority_date": "2020-06-23",
    "filing_date": "2020-07-22",
    "grant_date": "2025-02-25",
    "publication_date": "2025-02-25",
    "inventor": "姜晓明",
    "assignee": "中科民生耐鼎机器人(珠海)有限公司",
    "publication_number": "CN111938952B",
    "language": "zh",
    "pdf": "96/ac/eb/bfe4c1ecfd2a96/CN111938952B.pdf"
  }
}
```

Convert a non-empty `pdf` field to:

```text
https://patentimages.storage.googleapis.com/<pdf>
```

## Publication Parse: `/xhr/parse`

Endpoint:

```text
GET https://patents.google.com/xhr/parse
```

Example:

```text
text=CN111938952B
cursor=12
exp=
```

Response shape:

```json
{
  "error_no_patents_found": false,
  "results": [
    {
      "result": {
        "id": "patent/CN111938952B/en",
        "number": "CN111938952B",
        "title": "Home care robot and control method"
      }
    }
  ]
}
```

Use `result.id` as the preferred `id` for `/xhr/result`. For a requested language such as `zh`, the script may rewrite only the final language segment to `patent/CN111938952B/zh`.

## Detail HTML: `/xhr/result`

Endpoint:

```text
GET https://patents.google.com/xhr/result
```

Example:

```text
id=patent/CN111938952B/en
qs=oq=CN111938952B
exp=
```

Response is an HTML article with useful `itemprop` values:

```html
<h1 itemprop="pageTitle">CN111938952B - Home care robot and control method - Google Patents</h1>
<span itemprop="title">Home care robot and control method</span>
<a href="https://patentimages.storage.googleapis.com/.../CN111938952B.pdf" itemprop="pdfLink">Download PDF</a>
<dd itemprop="publicationNumber">CN111938952B</dd>
<dd itemprop="inventor" repeat>姜晓明</dd>
<dd itemprop="assigneeOriginal" repeat>Zhongke Minsheng Naiding Robot Zhuhai Co ltd</dd>
```

## Practical Notes

- Keep headers browser-like: `User-Agent`, `Accept`, `Accept-Language`, and `Referer`.
- Avoid captured cookies unless the user explicitly provides fresh session context.
- Prefer `/xhr/query` for broad keyword searches.
- Prefer `/xhr/parse` plus `/xhr/result` for exact publication numbers.
- For drafting, prefer the original publication language when available and use translated text only as a convenience.
