#!/usr/bin/env python3
"""Validate the portable Article Refinement JSON contract."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


EVIDENCE_KINDS = {
    "direct-source",
    "design-rule",
    "user-instruction",
    "inference",
    "unsupported",
}
RIGHTS_STATUSES = {
    "internal-reference",
    "export-approved",
    "blocked",
    "unknown",
}
CARD_ROLES = {"cover", "context", "insight", "implication", "source"}
VISUALIZATION_METHODS = {
    "statement",
    "comparison",
    "steps",
    "cycle",
    "checklist",
    "warning",
    "example",
    "quote",
    "number",
}
FIXED_SIGNATURE = "네카라쿠배 디자이너, 피그마스터"


def validate(document: Any) -> list[str]:
    issues: list[str] = []
    if not isinstance(document, dict):
        return ["root must be an object"]

    for key in (
        "schema_version",
        "source_revision_id",
        "skill_revision_id",
        "revision",
        "title_ko",
        "summary_ko",
        "cards",
        "unresolved",
        "export_ready",
    ):
        if key not in document:
            issues.append(f"missing root field: {key}")

    if not document.get("source_revision_id"):
        issues.append("source_revision_id must be non-empty")
    if not document.get("skill_revision_id"):
        issues.append("skill_revision_id must be non-empty")
    if not isinstance(document.get("revision"), int) or document.get("revision", 0) < 1:
        issues.append("revision must be an integer greater than zero")

    cards = document.get("cards")
    if not isinstance(cards, list) or not 4 <= len(cards) <= 8:
        issues.append("cards must contain between 4 and 8 items")
        return issues

    has_export_blocker = False
    for index, card in enumerate(cards, start=1):
        label = f"cards[{index - 1}]"
        if not isinstance(card, dict):
            issues.append(f"{label} must be an object")
            continue
        if card.get("ordinal") != index:
            issues.append(f"{label}.ordinal must be {index}")
        if card.get("role") not in CARD_ROLES:
            issues.append(f"{label}.role is invalid")
        if card.get("visualization_method") not in VISUALIZATION_METHODS:
            issues.append(f"{label}.visualization_method is invalid")
        if not card.get("title") or not card.get("body"):
            issues.append(f"{label} requires title and body")
        if len("".join(str(card.get("title", "")).split())) > 22:
            issues.append(f"{label}.title exceeds 22 visible characters")
        if len("".join(str(card.get("body", "")).split())) > 55:
            issues.append(f"{label}.body exceeds 55 visible characters")

        layout = card.get("layout")
        if not isinstance(layout, dict):
            issues.append(f"{label}.layout must be an object")
        elif layout.get("template") == "cover":
            if card.get("role") != "cover":
                issues.append(f"{label} can use cover layout only with cover role")
            if layout.get("subtitle_pt") != 50 or layout.get("title_pt") != 100:
                issues.append(f"{label} cover typography must be 50pt / 100pt")
            if layout.get("title_max_lines") not in {2, 3}:
                issues.append(f"{label} cover title_max_lines must be 2 or 3")
            if (
                layout.get("image_position") != "background"
                or layout.get("overlay") != "black-gradient"
            ):
                issues.append(
                    f"{label} cover requires background image and black-gradient"
                )
        elif layout.get("template") == "body":
            if layout.get("signature") != FIXED_SIGNATURE:
                issues.append(f"{label} body signature must use the fixed value")
            if layout.get("title_pt") != 80 or layout.get("body_pt") != 45:
                issues.append(f"{label} body typography must be 80pt / 45pt")
            if layout.get("title_max_lines") not in {1, 2}:
                issues.append(f"{label} body title_max_lines must be 1 or 2")
            if layout.get("image_position") not in {"middle", "bottom"}:
                issues.append(f"{label} body image must be middle or bottom")
        else:
            issues.append(f"{label}.layout.template is invalid")

        claims = card.get("claims")
        if not isinstance(claims, list) or not claims:
            issues.append(f"{label}.claims must be a non-empty array")
            has_export_blocker = True
        else:
            for claim_index, claim in enumerate(claims):
                claim_label = f"{label}.claims[{claim_index}]"
                if not isinstance(claim, dict):
                    issues.append(f"{claim_label} must be an object")
                    continue
                kind = claim.get("evidence_kind")
                if kind not in EVIDENCE_KINDS:
                    issues.append(f"{claim_label}.evidence_kind is invalid")
                block_ids = claim.get("source_block_ids")
                if not isinstance(block_ids, list):
                    issues.append(f"{claim_label}.source_block_ids must be an array")
                elif kind not in {"user-instruction", "unsupported"} and not block_ids:
                    issues.append(f"{claim_label} requires source_block_ids")
                if kind == "unsupported":
                    has_export_blocker = True

        image = card.get("image_usage")
        if image is not None:
            if not isinstance(image, dict):
                issues.append(f"{label}.image_usage must be an object or null")
            else:
                rights = image.get("rights_status")
                if rights not in RIGHTS_STATUSES:
                    issues.append(f"{label}.image_usage.rights_status is invalid")
                if not image.get("asset_id") or not image.get("source_block_id"):
                    issues.append(
                        f"{label}.image_usage requires asset_id and source_block_id"
                    )
                if rights != "export-approved":
                    has_export_blocker = True

    if document.get("export_ready") is True and has_export_blocker:
        issues.append("export_ready cannot be true while export blockers exist")
    if not isinstance(document.get("unresolved"), list):
        issues.append("unresolved must be an array")
    return issues


def self_test() -> int:
    valid = {
        "schema_version": 1,
        "source_revision_id": "source-1",
        "skill_revision_id": "article-refinement@1",
        "revision": 1,
        "title_ko": "제목",
        "summary_ko": "요약",
        "cards": [
            {
                "ordinal": 1,
                "role": "cover",
                "title": "표지",
                "body": "핵심",
                "visualization_method": "statement",
                "layout": {
                    "template": "cover",
                    "signature": None,
                    "subtitle_pt": 50,
                    "title_pt": 100,
                    "title_max_lines": 3,
                    "body_pt": None,
                    "image_position": "background",
                    "overlay": "black-gradient",
                },
                "claims": [
                    {
                        "text": "주장",
                        "evidence_kind": "direct-source",
                        "source_block_ids": ["block-1"],
                    }
                ],
                "image_usage": None,
            }
        ],
        "unresolved": [],
        "export_ready": False,
    }
    valid["cards"] = [
        {**valid["cards"][0], "ordinal": ordinal}
        for ordinal in range(1, 5)
    ]
    invalid = {**valid, "export_ready": True}
    invalid["cards"] = [
        {
            **valid["cards"][0],
            "claims": [
                {
                    "text": "근거 없음",
                    "evidence_kind": "unsupported",
                    "source_block_ids": [],
                }
            ],
        }
    ]
    if validate(valid):
        print("self-test failed: valid sample rejected", file=sys.stderr)
        return 1
    if not validate(invalid):
        print("self-test failed: invalid sample accepted", file=sys.stderr)
        return 1
    print("self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", nargs="?", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if args.path is None:
        parser.error("path is required unless --self-test is used")
    try:
        document = json.loads(args.path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"invalid input: {error}", file=sys.stderr)
        return 1
    issues = validate(document)
    if issues:
        for issue in issues:
            print(f"- {issue}", file=sys.stderr)
        return 1
    print("valid article refinement")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
