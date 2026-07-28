# Refinement output contract

Return one JSON object with this shape:

```json
{
  "schema_version": 1,
  "source_revision_id": "source-revision-id",
  "skill_revision_id": "article-refinement@1",
  "revision": 1,
  "title_ko": "정제된 제목",
  "summary_ko": "전체 주제를 한 문장으로 정리",
  "cards": [
    {
      "ordinal": 1,
      "role": "cover",
      "title": "카드 제목",
      "body": "핵심 문장",
      "visualization_method": "statement",
      "layout": {
        "template": "cover",
        "signature": null,
        "subtitle_pt": 50,
        "title_pt": 100,
        "title_max_lines": 3,
        "body_pt": null,
        "image_position": "background",
        "overlay": "black-gradient"
      },
      "claims": [
        {
          "text": "검증할 주장",
          "evidence_kind": "direct-source",
          "source_block_ids": ["block-001"]
        }
      ],
      "image_usage": {
        "asset_id": "asset-001",
        "source_block_id": "block-010",
        "rights_status": "internal-reference",
        "reason": "이 이미지가 현재 주장을 설명하는 이유"
      }
    }
  ],
  "changes": {
    "removed": [],
    "merged": [],
    "inferred": []
  },
  "unresolved": [],
  "export_ready": false
}
```

## Fixed vocabularies

- `role`: `cover`, `context`, `insight`, `implication`, `source`
- `evidence_kind`: `direct-source`, `design-rule`, `user-instruction`, `inference`, `unsupported`
- `rights_status`: `internal-reference`, `export-approved`, `blocked`, `unknown`
- `layout.template`: `cover`, `body`
- `layout.image_position`: `background`, `middle`, `bottom`
- `visualization_method`: `statement`, `comparison`, `steps`, `cycle`, `checklist`, `warning`, `example`, `quote`, `number`

## Invariants

- Start `ordinal` at 1 and keep it contiguous.
- Use 4–8 cards. Keep cover titles at 22 characters or fewer, body-card titles at 22 characters or fewer, and body copy at 55 characters or fewer, excluding whitespace.
- Use 50pt subtitle, 100pt title, two or three title lines, and a black gradient over a background image for `cover`.
- Use the fixed signature `네카라쿠배 디자이너, 피그마스터`, an 80pt one- or two-line title, 45pt body copy, and a middle or bottom image for `body`.
- Give every claim at least one `source_block_id`, except `user-instruction`; keep `unsupported` explicitly empty.
- Preserve body-image provenance through `asset_id` and `source_block_id`.
- Set `export_ready` to `false` when a primary claim is unsupported or a used image is not `export-approved`.
- Record a new `revision` instead of overwriting an earlier result.
