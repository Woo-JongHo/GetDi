from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
import mimetypes
import os
from pathlib import Path
import sys
import time
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen


USER_AGENT = "GatherDesign/0.1 (+local personal research cache)"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def atomic_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(content, encoding="utf-8")
    os.replace(temporary, path)


def atomic_json(path: Path, value: dict[str, Any]) -> None:
    atomic_text(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def expected_detail_path(root: Path, item: dict[str, Any]) -> Path:
    folder = "videos" if item["format"] == "video" else "articles"
    return root / folder / f"{item['slug']}.json"


class BodyImageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.images: list[dict[str, str | None]] = []
        self._figure_image: dict[str, str | None] | None = None
        self._caption_parts: list[str] = []
        self._in_caption = False

    def handle_starttag(
        self, tag: str, attrs: list[tuple[str, str | None]]
    ) -> None:
        values = dict(attrs)
        if tag == "img" and values.get("src"):
            image = {
                "source_url": values["src"],
                "alt": values.get("alt"),
                "caption": None,
            }
            self.images.append(image)
            self._figure_image = image
        elif tag == "figcaption":
            self._in_caption = True
            self._caption_parts = []

    def handle_data(self, data: str) -> None:
        if self._in_caption:
            self._caption_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "figcaption":
            self._in_caption = False
            if self._figure_image is not None:
                caption = " ".join("".join(self._caption_parts).split())
                self._figure_image["caption"] = caption or None
        elif tag == "figure":
            self._figure_image = None


def body_images(content_html: str) -> list[dict[str, str | None]]:
    parser = BodyImageParser()
    parser.feed(content_html or "")
    parser.close()
    seen: set[str] = set()
    unique: list[dict[str, str | None]] = []
    for image in parser.images:
        source_url = str(image["source_url"])
        if source_url not in seen:
            seen.add(source_url)
            unique.append(image)
    return unique


def extension_for(url: str, content_type: str | None) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        return suffix
    guessed = mimetypes.guess_extension((content_type or "").split(";", 1)[0])
    return guessed or ".bin"


def download_asset(
    image: dict[str, str | None],
    asset_dir: Path,
    content_format: str,
    slug: str,
    index: int,
) -> dict[str, Any]:
    source_url = str(image["source_url"])
    request = Request(
        source_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
        },
    )
    with urlopen(request, timeout=45) as response:
        payload = response.read()
        content_type = response.headers.get("Content-Type")

    digest = hashlib.sha256(payload).hexdigest()
    url_digest = hashlib.sha256(source_url.encode("utf-8")).hexdigest()[:10]
    extension = extension_for(source_url, content_type)
    target = (
        asset_dir
        / f"{content_format}s"
        / slug
        / f"{index:02d}-{url_digest}{extension}"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(f"{target.suffix}.tmp")
    temporary.write_bytes(payload)
    os.replace(temporary, target)
    return {
        "kind": "body_image",
        "source_url": source_url,
        "local_path": target.as_posix(),
        "sha256": digest,
        "bytes": len(payload),
        "content_type": content_type,
        "alt": image.get("alt"),
        "caption": image.get("caption"),
    }


def enrich_assets(
    detail: dict[str, Any],
    detail_path: Path,
    asset_dir: Path,
    asset_delay_seconds: float,
) -> tuple[int, list[dict[str, str]]]:
    images = body_images(detail.get("content_html", ""))
    existing = {
        asset.get("source_url"): asset
        for asset in detail.get("assets", [])
        if asset.get("kind") == "body_image"
        and asset.get("source_url")
        and Path(asset.get("local_path", "")).exists()
    }
    assets: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    downloaded = 0
    for index, image in enumerate(images, start=1):
        source_url = str(image["source_url"])
        if source_url in existing:
            assets.append(existing[source_url])
            continue
        try:
            asset = download_asset(
                image,
                asset_dir,
                detail["format"],
                urlparse(detail["source_url"]).path.rstrip("/").rsplit("/", 1)[-1],
                index,
            )
            assets.append(asset)
            downloaded += 1
            print(
                f"  asset {index}/{len(images)}: {asset['bytes']} bytes",
                flush=True,
            )
            if index < len(images):
                time.sleep(max(0.0, asset_delay_seconds))
        except Exception as error:  # Continue collecting other source pages.
            failures.append({"url": source_url, "error": str(error)})
            print(f"  asset failed: {source_url}: {error}", flush=True)
    detail["assets"] = assets
    detail["asset_failures"] = failures
    atomic_json(detail_path, detail)
    return downloaded, failures


@dataclass
class Counters:
    existing: int = 0
    collected: int = 0
    failed: int = 0
    assets_downloaded: int = 0


def write_state(
    path: Path,
    *,
    status: str,
    total: int,
    counters: Counters,
    current: dict[str, Any] | None,
    failures: list[dict[str, str]],
    asset_failures: list[dict[str, str]],
    last_request_epoch: float | None,
) -> None:
    atomic_json(
        path,
        {
            "status": status,
            "total_items": total,
            "details_available": counters.existing + counters.collected,
            "existing_at_start": counters.existing,
            "collected_this_run": counters.collected,
            "failed_this_run": counters.failed,
            "assets_downloaded_this_run": counters.assets_downloaded,
            "current": current,
            "failures": failures,
            "asset_failures": asset_failures,
            "last_request_epoch": last_request_epoch,
            "updated_at": utc_now(),
        },
    )


def wait_for_crawl_delay(
    last_request_epoch: float | None, delay_seconds: int
) -> None:
    if last_request_epoch is None:
        return
    remaining = delay_seconds - (time.time() - last_request_epoch)
    if remaining > 0:
        print(f"Waiting {remaining:.1f}s for NN/G crawl delay.", flush=True)
        time.sleep(remaining)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Resume NN/G detail collection for every pending listing item."
    )
    parser.add_argument("--collection", type=Path, required=True)
    parser.add_argument("--raw-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--asset-dir", type=Path, required=True)
    parser.add_argument("--state-file", type=Path, required=True)
    parser.add_argument("--gatherdesign-src", type=Path, required=True)
    parser.add_argument("--delay-seconds", type=int, default=60)
    parser.add_argument("--asset-delay-seconds", type=float, default=1.0)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--dry-run", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    delay_seconds = max(1, args.delay_seconds)
    sys.path.insert(0, str(args.gatherdesign_src.resolve()))
    from gatherdesign.details import parse_detail, raw_detail_path
    from gatherdesign.nngroup import fetch_html

    collection = read_json(args.collection)
    items = collection["items"]
    all_pending = [
        item
        for item in items
        if not expected_detail_path(args.output_dir, item).exists()
    ]
    pending = list(all_pending)
    if args.limit is not None:
        pending = pending[: max(0, args.limit)]
    print(
        f"{len(items)} total; {len(items) - len(all_pending)} already available; "
        f"{len(pending)} selected for collection.",
        flush=True,
    )
    if args.dry_run:
        for item in pending:
            print(f"{item['format']}: {item['url']}")
        return 0

    previous_state = read_json(args.state_file) if args.state_file.exists() else {}
    last_request_epoch = previous_state.get("last_request_epoch")
    counters = Counters(existing=len(items) - len(all_pending))
    failures: list[dict[str, str]] = []
    asset_failures: list[dict[str, str]] = []

    # Backfill local body-image assets for details that already exist.
    for item in items:
        detail_path = expected_detail_path(args.output_dir, item)
        if not detail_path.exists():
            continue
        detail = read_json(detail_path)
        downloaded, failed_assets = enrich_assets(
            detail,
            detail_path,
            args.asset_dir,
            args.asset_delay_seconds,
        )
        counters.assets_downloaded += downloaded
        asset_failures.extend(failed_assets)

    write_state(
        args.state_file,
        status="running",
        total=len(items),
        counters=counters,
        current=None,
        failures=failures,
        asset_failures=asset_failures,
        last_request_epoch=last_request_epoch,
    )

    for queue_index, item in enumerate(pending, start=1):
        current = {
            "queue_index": queue_index,
            "queue_total": len(pending),
            "slug": item["slug"],
            "format": item["format"],
            "url": item["url"],
        }
        wait_for_crawl_delay(last_request_epoch, delay_seconds)
        print(
            f"[{queue_index}/{len(pending)}] Fetching {item['url']}",
            flush=True,
        )
        last_request_epoch = time.time()
        try:
            html = fetch_html(item["url"])
            detail = parse_detail(html, item["url"])
            detail_path = expected_detail_path(args.output_dir, item)
            raw_path = raw_detail_path(args.raw_dir, detail["source_url"])
            atomic_text(raw_path, html)
            atomic_json(detail_path, detail)
            downloaded, failed_assets = enrich_assets(
                detail,
                detail_path,
                args.asset_dir,
                args.asset_delay_seconds,
            )
            counters.collected += 1
            counters.assets_downloaded += downloaded
            asset_failures.extend(failed_assets)
            print(
                f"  saved {detail['format']} detail; "
                f"{len(body_images(detail.get('content_html', '')))} body images.",
                flush=True,
            )
        except Exception as error:
            counters.failed += 1
            failure = {"url": item["url"], "slug": item["slug"], "error": str(error)}
            failures.append(failure)
            print(f"  failed: {error}", flush=True)

        write_state(
            args.state_file,
            status="running",
            total=len(items),
            counters=counters,
            current=current,
            failures=failures,
            asset_failures=asset_failures,
            last_request_epoch=last_request_epoch,
        )

    final_available = sum(
        expected_detail_path(args.output_dir, item).exists() for item in items
    )
    final_status = "complete" if final_available == len(items) else "partial"
    counters.existing = final_available - counters.collected
    write_state(
        args.state_file,
        status=final_status,
        total=len(items),
        counters=counters,
        current=None,
        failures=failures,
        asset_failures=asset_failures,
        last_request_epoch=last_request_epoch,
    )
    print(
        f"Finished with {final_available}/{len(items)} details; "
        f"{len(failures)} page failures; {len(asset_failures)} asset failures.",
        flush=True,
    )
    return 0 if final_status == "complete" else 2


if __name__ == "__main__":
    raise SystemExit(main())
