# Media library: contract

Status: build contract, 2026-10-15. The API (apps/api) implements it, and the web app (apps/web) consumes it.

Why now: Instagram won't publish a post without an image or video, and every platform has its own aspect ratios and size limits. Harbor hosts uploads itself, so platforms that download media (Instagram, Threads) get a public URL under `HARBOR_API_URL`.

## Model

- **Storage:**
  - A `MediaStore` interface: `put(key, bytes, contentType)`, `get(key) → stream + contentType`, `delete(key)`.
  - The default `LocalDiskStore` writes under `HARBOR_MEDIA_DIR` (default `apps/api/.media`, which is gitignored).
  - An S3-compatible store comes at deploy; keep the interface ready for it, but don't build it.
- **Image processing:** `sharp`, pinned exactly to 0.35.5. Video is stored as is, with no transcoding.
- **Table `media_assets`:**
  - `id` (prefix `med`), `workspace_id`, `brand_id`, `kind` ('image' or 'video'), `mime`, `bytes`, `width`, `height` (images only), `storage_key`, `original_name`
  - `alt text`, `tags text[]`, `focal_x`, `focal_y` (0–1, default 0.5)
  - `sha256` (dedupe per brand: uploading the same file returns the existing asset), `created_at`, `deleted_at`
- **Variants:** generated on first request and cached on disk. Every crop is centered on the focal point and output as JPEG at quality 88:
  - `original` (re-encoded to JPEG only if the source is PNG/WebP/GIF/HEIC)
  - `square` (1:1, 1080×1080)
  - `portrait` (4:5, 1080×1350)
  - `landscape` (1.91:1, 1200×628)
  - `wide` (16:9, 1600×900)
  - `story` (9:16, 1080×1920)
- **Public serving:** `GET /media/:assetId/:variant.jpg` for images and `GET /media/:assetId/original` for video.
  - No auth. Unguessable ids act as the capability.
  - Headers: `Cache-Control: public, max-age=31536000, immutable`, plus a `?v=<focal hash>` query, so changing the focal point busts caches.
  - Served outside the `/v1` CORS rule. These are the URLs Instagram and Threads download.

## Platform rules (in packages/core, `media.ts`)

`MEDIA_RULES[platform]`, consumed by `checkMedia(platform, items: { kind, mime, bytes, width?, height? }[]) → { ok, issues: { level: 'fail'|'warn', message }[] }`:

| Platform | Images per part | Video | Image limits | Preferred variant |
|---|---|---|---|---|
| x | ≤ 4, no mixing with video | 1 (mp4) | ≤ 5 MB; jpg/png/webp/gif | `wide` |
| linkedin | 1 | not yet (fail) | ≤ 8 MB | `landscape` |
| instagram | 1–10 (carousel); **required** | 1 = Reel (mp4/mov ≤ 300 MB) | **JPEG only**, ≤ 8 MB, aspect between 4:5 and 1.91:1 | `portrait` |
| threads | ≤ 10 | 1 (mp4/mov ≤ 1 GB) | ≤ 8 MB | `portrait` |

`fail` blocks publishing (providers' `validate` calls `checkMedia`). `warn` is advice, for example "Square crops get cut on X; use wide".

## API

| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | /v1/brands/:id/media | multipart: `file`, `alt?`, `tags?` (comma-separated). Images ≤ 25 MB, video ≤ 300 MB | `201 MediaAsset` (`200` with the existing asset on a sha256 duplicate) |
| POST | /v1/brands/:id/media/from-url | `{ url, alt?, tags? }` (http(s) only, ≤ 25 MB, 20s timeout, content-type must be image/* or video/*) | `201 MediaAsset` |
| GET | /v1/brands/:id/media | `?kind ?tag ?q (alt/name/tags) ?limit` | `{ data: MediaAsset[], tags: { tag, count }[] }`, newest first |
| GET | /v1/media/:id | | `MediaAsset & { usage: { kind: 'draft'|'post'|'approval'; id: string; status?: string; platform: Platform; text: string }[] }` |
| PATCH | /v1/media/:id | `{ alt?, tags?, focal?: { x, y } }` | `MediaAsset` |
| DELETE | /v1/media/:id | | 204. Soft delete; 409 if a scheduled/publishing post uses it |
| GET | /v1/media/:id/fit | `?platform=` | `{ variant, url, width, height, check: { ok, issues } }`: the platform's preferred variant, checked |

```ts
type MediaAsset = { id: string; brandId: string; kind: 'image'|'video'; mime: string; bytes: number; width?: number; height?: number; originalName?: string; alt?: string; tags: string[]; focal: { x: number; y: number }; url: string /* original */; variants: Record<'original'|'square'|'portrait'|'landscape'|'wide'|'story', string> /* absolute public URLs; images only */; usageCount: number; createdAt: string };
```

`MediaRef` (core) gains optional `assetId` and `variant`. When a draft or post references an asset, the API fills `url` with that variant's public URL, so providers keep working on URLs. The asset's alt text is used when `alt` isn't set.

## Where media plugs in

- **Drafts:**
  - `POST /v1/drafts` and the draft save path accept `media: { assetId, variant? }[]` on a part.
  - The variant defaults to the platform's preferred one.
- **Approvals:**
  - `POST /v1/approvals/:id/approve` accepts `media?: { assetId, variant? }[]` for part 1, saving a new draft version, the same as edited parts.
  - Approving an Instagram approval with no media fails with a clear 400 ("Instagram needs an image or video. Attach one first.").
- **Voice check:** gains a `media` check:
  - fail: Instagram without media, or anything `checkMedia` fails;
  - warn: a recommended crop that wasn't used;
  - ok otherwise.
- **Weekly plan:** for Instagram drafts it auto-attaches the brand's most recently used image tagged for that idea's topic, if any (simple tag/keyword match on the idea title). Otherwise it leaves media empty so the media check flags it in Approvals.
- **Voice refresh:** new features: `has_image`, `carousel` (more than 1 media item), `video`. They work only on platforms where media is optional, since every Instagram post has media.
- **MCP:**
  - read tool `list_media {brandId, tag?}`;
  - `propose_post` and `draft_idea` keep working;
  - a new write tool `attach_media {draftId, assetId, variant?}` saves a new draft version.

## Seed

- Generate 8–10 demo images per brand with sharp from SVG: brand-colored abstract compositions using the pixel-key palette (pink #e05bb4, violet #7c4ddb, coral #f2734f, amber #9a5200, yellow #cfa600) for Harbor, and warm coffee tones for Tidewater.
- Use mixed aspect ratios (some wide, some square, some tall) so crops visibly matter. Tag them, for example `product`, `behind-the-scenes`, `launch`, `cupping`, `roast`.
- Attach them to the demo Instagram posts (every one) and to some X/Threads posts, so `has_image` has data.
- Keep the seed idempotent and bump the stale-data check.

## Tests

- Upload: dedupe, size and type limits.
- Variant crop sizes, and that the focal point shifts the crop.
- Serving: headers and 404s.
- `checkMedia` rules per platform.
- Draft and approval attach.
- Instagram approve without media → 400.
- The voice check media rule.
- `DELETE` while in use → 409.
- from-url with mocked fetch.
- MCP `attach_media`.
