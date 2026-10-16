import { z } from 'zod';
import type { Platform } from './metrics.ts';

/**
 * Media rules per platform (docs/design/media-library.md). Harbor hosts uploads itself and serves crops of each
 * image (variants); these rules say what each platform accepts and which crop suits it. `checkMedia` is shared by
 * the providers' validate() (fails block publishing), the voice check and the media library's fit endpoint.
 */

export const MEDIA_KINDS = ['image', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Every image is served as these JPEGs; each crop is centered on the asset's focal point. */
export const MEDIA_VARIANTS = ['original', 'square', 'portrait', 'landscape', 'wide', 'story'] as const;
export const mediaVariantSchema = z.enum(MEDIA_VARIANTS);
export type MediaVariant = z.infer<typeof mediaVariantSchema>;
export type MediaCrop = Exclude<MediaVariant, 'original'>;

/** Output size of each crop (pixels). */
export const MEDIA_CROPS: Record<MediaCrop, { width: number; height: number; label: string }> = {
  square: { width: 1080, height: 1080, label: '1:1' },
  portrait: { width: 1080, height: 1350, label: '4:5' },
  landscape: { width: 1200, height: 628, label: '1.91:1' },
  wide: { width: 1600, height: 900, label: '16:9' },
  story: { width: 1080, height: 1920, label: '9:16' },
};

/** JPEG quality of every generated variant. */
export const MEDIA_JPEG_QUALITY = 88;

const MB = 1024 * 1024;

export interface MediaRule {
  /** Images allowed in one part. */
  maxImages: number;
  /** Instagram can't publish without an image or video. */
  required: boolean;
  /** Whether one part can carry both images and video. */
  mixing: boolean;
  /** Videos allowed in one part; 0 = not supported (fail). */
  maxVideos: number;
  /** Accepted video types; undefined = any. */
  videoMimes?: string[];
  videoMaxBytes?: number;
  /** Accepted image types; undefined = any. */
  imageMimes?: string[];
  imageMaxBytes: number;
  /** Width / height bounds, inclusive. */
  minAspect?: number;
  maxAspect?: number;
  /** The crop that suits the platform's feed. */
  preferredVariant: MediaVariant;
}

export const MEDIA_RULES: Record<Platform, MediaRule> = {
  x: {
    maxImages: 4, required: false, mixing: false, maxVideos: 1, videoMimes: ['video/mp4'],
    imageMimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], imageMaxBytes: 5 * MB, preferredVariant: 'wide',
  },
  linkedin: { maxImages: 1, required: false, mixing: false, maxVideos: 0, imageMaxBytes: 8 * MB, preferredVariant: 'landscape' },
  instagram: {
    maxImages: 10, required: true, mixing: true, maxVideos: 1, videoMimes: ['video/mp4', 'video/quicktime'], videoMaxBytes: 300 * MB,
    imageMimes: ['image/jpeg'], imageMaxBytes: 8 * MB, minAspect: 4 / 5, maxAspect: 1.91, preferredVariant: 'portrait',
  },
  threads: {
    maxImages: 10, required: false, mixing: true, maxVideos: 1, videoMimes: ['video/mp4', 'video/quicktime'], videoMaxBytes: 1024 * MB,
    imageMaxBytes: 8 * MB, preferredVariant: 'portrait',
  },
};

/** The crop a platform prefers for images; video is always served as uploaded. */
export const preferredVariant = (platform: Platform, kind: MediaKind = 'image'): MediaVariant =>
  kind === 'video' ? 'original' : MEDIA_RULES[platform].preferredVariant;

/** What checkMedia needs about one item. `mime` and `bytes` may be unknown (a bare URL); those checks are skipped. */
export interface MediaCheckItem {
  kind: MediaKind;
  mime?: string;
  bytes?: number;
  width?: number;
  height?: number;
}

export interface MediaIssue {
  level: 'fail' | 'warn';
  message: string;
}

export interface MediaCheck {
  ok: boolean;
  issues: MediaIssue[];
}

const NAMES: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const TYPE_NAMES: Record<string, string> = {
  'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/heic': 'HEIC', 'image/avif': 'AVIF',
  'video/mp4': 'MP4', 'video/quicktime': 'MOV',
};
const typeName = (mime: string) => TYPE_NAMES[mime] ?? mime;
const orList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
const size = (bytes: number) => (bytes >= MB ? `${Math.round((bytes / MB) * 10) / 10} MB` : `${Math.round(bytes / 1024)} KB`);
const ratio = (w: number, h: number) => (w >= h ? `${Math.round((w / h) * 100) / 100}:1` : `1:${Math.round((h / w) * 100) / 100}`);

/** Whether a mime type is one of `allowed`, treating image/jpg as image/jpeg. */
const typeAllowed = (mime: string, allowed: string[]) => allowed.includes(mime === 'image/jpg' ? 'image/jpeg' : mime);

/**
 * Check the media of one post part against a platform's rules. `fail` blocks publishing; `warn` is advice (a crop
 * that the feed cuts, say). Items with unknown type, size or dimensions skip those checks.
 */
export function checkMedia(platform: Platform, items: MediaCheckItem[]): MediaCheck {
  const rule = MEDIA_RULES[platform];
  const name = NAMES[platform];
  const issues: MediaIssue[] = [];
  const fail = (message: string) => issues.push({ level: 'fail', message });
  const warn = (message: string) => issues.push({ level: 'warn', message });
  const images = items.filter((i) => i.kind === 'image');
  const videos = items.filter((i) => i.kind === 'video');

  if (!items.length) {
    if (rule.required) fail(`${name} needs an image or video.`);
    return { ok: !issues.length, issues };
  }
  if (videos.length && rule.maxVideos === 0) fail(`Video on ${name} isn't supported yet.`);
  else if (videos.length > rule.maxVideos) fail(`${name} allows ${rule.maxVideos} video per post, got ${videos.length}.`);
  if (videos.length && images.length && !rule.mixing) fail(`${name} can't mix images and video in one post.`);
  if (images.length > rule.maxImages) fail(`${name} allows ${rule.maxImages} image${rule.maxImages === 1 ? '' : 's'} per post, got ${images.length}.`);
  // Where images and video mix (carousels), the image limit is the limit on items.
  if (rule.mixing && items.length > rule.maxImages && images.length <= rule.maxImages) fail(`${name} allows ${rule.maxImages} media items per post, got ${items.length}.`);

  items.forEach((item, i) => {
    const where = items.length > 1 ? `${item.kind === 'image' ? 'Image' : 'Video'} ${i + 1}: ` : '';
    if (item.kind === 'video') {
      if (rule.maxVideos === 0) return;
      if (item.mime && rule.videoMimes && !typeAllowed(item.mime, rule.videoMimes)) {
        fail(`${where}${name} takes ${orList(rule.videoMimes.map(typeName))} video (this is ${typeName(item.mime)}).`);
      }
      if (item.bytes !== undefined && rule.videoMaxBytes !== undefined && item.bytes > rule.videoMaxBytes) {
        fail(`${where}Video on ${name} must be ${size(rule.videoMaxBytes)} or less (this one is ${size(item.bytes)}).`);
      }
      return;
    }
    if (item.mime && rule.imageMimes && !typeAllowed(item.mime, rule.imageMimes)) {
      fail(`${where}${name} takes ${rule.imageMimes.length === 1 ? `only ${typeName(rule.imageMimes[0]!)}` : orList(rule.imageMimes.map(typeName))} images (this is ${typeName(item.mime)}).`);
    }
    if (item.bytes !== undefined && item.bytes > rule.imageMaxBytes) {
      fail(`${where}Images on ${name} must be ${size(rule.imageMaxBytes)} or less (this one is ${size(item.bytes)}).`);
    }
    if (!item.width || !item.height) return;
    const aspect = item.width / item.height;
    // A hair of tolerance: 1080×1350 is exactly 4:5, and rounding shouldn't fail it.
    if ((rule.minAspect !== undefined && aspect < rule.minAspect - 0.005) || (rule.maxAspect !== undefined && aspect > rule.maxAspect + 0.005)) {
      fail(`${where}${name} needs an aspect ratio between 4:5 and 1.91:1 (this one is ${ratio(item.width, item.height)}). Use the ${rule.preferredVariant} crop.`);
      return;
    }
    if (platform === 'x') {
      if (aspect >= 0.9 && aspect <= 1.1) warn(`${where}Square crops get cut on X; use wide.`);
      else if (aspect < 0.9) warn(`${where}Tall images get cut on X; use wide.`);
    } else if (platform === 'linkedin' && aspect < 0.9) {
      warn(`${where}Tall images get cut in the LinkedIn feed; use landscape.`);
    } else if (platform === 'instagram' && aspect > 1.1) {
      warn(`${where}Landscape images show small in the Instagram feed; use portrait.`);
    } else if (platform === 'threads' && aspect > 1.1) {
      warn(`${where}Landscape images show small on Threads; use portrait.`);
    }
  });
  return { ok: !issues.some((x) => x.level === 'fail'), issues };
}

const EXT_MIMES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heic', avif: 'image/avif',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime',
};

/** The type a URL's extension implies (Harbor's variant URLs end in .jpg), or undefined. */
export function mimeFromUrl(url: string): string | undefined {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // not a URL: use it as a path
  }
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase();
  return ext ? EXT_MIMES[ext] : undefined;
}
