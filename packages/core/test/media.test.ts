import { describe, expect, it } from 'vitest';
import { MEDIA_CROPS, MEDIA_RULES, checkMedia, mediaRefInputSchema, mimeFromUrl, newId, postPartSchema, preferredVariant } from '../src/index.ts';

const MB = 1024 * 1024;
const jpg = (width = 1080, height = 1350, bytes = 500_000) => ({ kind: 'image' as const, mime: 'image/jpeg', bytes, width, height });
const mp4 = (bytes = 10 * MB) => ({ kind: 'video' as const, mime: 'video/mp4', bytes });
const fails = (r: ReturnType<typeof checkMedia>) => r.issues.filter((i) => i.level === 'fail').map((i) => i.message);
const warns = (r: ReturnType<typeof checkMedia>) => r.issues.filter((i) => i.level === 'warn').map((i) => i.message);

describe('checkMedia', () => {
  it('x: up to 4 images, 1 mp4, no mixing, 5 MB, wide preferred', () => {
    expect(checkMedia('x', [jpg(1600, 900)])).toEqual({ ok: true, issues: [] });
    expect(checkMedia('x', []).ok).toBe(true);
    expect(fails(checkMedia('x', Array.from({ length: 5 }, () => jpg(1600, 900))))).toEqual(['X allows 4 images per post, got 5.']);
    expect(fails(checkMedia('x', [jpg(1600, 900), mp4()]))).toEqual(["X can't mix images and video in one post."]);
    expect(fails(checkMedia('x', [mp4(), mp4()]))).toContain('X allows 1 video per post, got 2.');
    expect(fails(checkMedia('x', [{ kind: 'video', mime: 'video/quicktime' }]))[0]).toMatch(/X takes MP4 video/);
    expect(fails(checkMedia('x', [jpg(1600, 900, 6 * MB)]))[0]).toMatch(/5 MB or less \(this one is 6 MB\)/);
    expect(fails(checkMedia('x', [{ kind: 'image', mime: 'image/heic' }]))[0]).toMatch(/JPEG, PNG, WebP or GIF/);
    expect(warns(checkMedia('x', [jpg(1080, 1080)]))).toEqual(['Square crops get cut on X; use wide.']);
    expect(checkMedia('x', [jpg(1080, 1080)]).ok).toBe(true);
    expect(preferredVariant('x')).toBe('wide');
  });

  it('linkedin: one image, no video yet, 8 MB', () => {
    expect(checkMedia('linkedin', [jpg(1200, 628)]).ok).toBe(true);
    expect(fails(checkMedia('linkedin', [jpg(), jpg()]))).toEqual(['LinkedIn allows 1 image per post, got 2.']);
    expect(fails(checkMedia('linkedin', [mp4()]))).toEqual(["Video on LinkedIn isn't supported yet."]);
    expect(fails(checkMedia('linkedin', [jpg(1200, 628, 9 * MB)]))).toHaveLength(1);
    expect(preferredVariant('linkedin')).toBe('landscape');
  });

  it('instagram: media required, JPEG only, 4:5 to 1.91:1, carousels up to 10, reels', () => {
    expect(fails(checkMedia('instagram', []))).toEqual(['Instagram needs an image or video.']);
    expect(checkMedia('instagram', [jpg()]).ok).toBe(true);
    expect(checkMedia('instagram', [jpg(1080, 1080), jpg(1200, 628)]).ok).toBe(true);
    expect(fails(checkMedia('instagram', [{ ...jpg(), mime: 'image/png' }]))[0]).toMatch(/only JPEG images \(this is PNG\)/);
    expect(fails(checkMedia('instagram', [jpg(1080, 1920)]))[0]).toMatch(/aspect ratio between 4:5 and 1.91:1 \(this one is 1:1.78\)/);
    expect(fails(checkMedia('instagram', [jpg(3000, 1000)]))).toHaveLength(1);
    expect(fails(checkMedia('instagram', Array.from({ length: 11 }, () => jpg())))).toEqual(['Instagram allows 10 images per post, got 11.']);
    expect(checkMedia('instagram', [mp4(200 * MB)]).ok).toBe(true);
    expect(checkMedia('instagram', [{ kind: 'video', mime: 'video/quicktime', bytes: MB }]).ok).toBe(true);
    expect(fails(checkMedia('instagram', [mp4(301 * MB)]))[0]).toMatch(/300 MB or less/);
    expect(warns(checkMedia('instagram', [jpg(1200, 628)]))[0]).toMatch(/use portrait/);
    expect(MEDIA_RULES.instagram.required).toBe(true);
    expect(preferredVariant('instagram')).toBe('portrait');
    expect(preferredVariant('instagram', 'video')).toBe('original');
  });

  it('threads: up to 10, any image type, video up to 1 GB', () => {
    expect(checkMedia('threads', [{ ...jpg(), mime: 'image/png' }]).ok).toBe(true);
    expect(checkMedia('threads', []).ok).toBe(true);
    expect(fails(checkMedia('threads', [mp4(1100 * MB)]))[0]).toMatch(/1024 MB or less/);
    expect(fails(checkMedia('threads', Array.from({ length: 11 }, () => jpg())))).toHaveLength(1);
  });

  it('skips what it does not know (a bare URL)', () => {
    expect(checkMedia('instagram', [{ kind: 'image' }]).ok).toBe(true);
    expect(mimeFromUrl('https://api.harbor.test/media/med_1/portrait.jpg?v=abc')).toBe('image/jpeg');
    expect(mimeFromUrl('https://cdn.test/v.MOV')).toBe('video/quicktime');
    expect(mimeFromUrl('https://api.harbor.test/media/med_1/original')).toBeUndefined();
  });

  it('crop sizes match their names', () => {
    expect(MEDIA_CROPS.square).toMatchObject({ width: 1080, height: 1080 });
    expect(MEDIA_CROPS.portrait.width / MEDIA_CROPS.portrait.height).toBeCloseTo(0.8);
    expect(MEDIA_CROPS.landscape.width / MEDIA_CROPS.landscape.height).toBeCloseTo(1.91, 2);
    expect(MEDIA_CROPS.wide.width / MEDIA_CROPS.wide.height).toBeCloseTo(16 / 9);
    expect(MEDIA_CROPS.story.width / MEDIA_CROPS.story.height).toBeCloseTo(9 / 16);
  });
});

describe('media refs', () => {
  it('MediaRef takes an optional assetId and variant', () => {
    const ref = { kind: 'image', url: 'https://api.harbor.test/media/med_1/wide.jpg', assetId: 'med_1', variant: 'wide' };
    expect(postPartSchema.parse({ text: 'hi', media: [ref] }).media[0]).toEqual(ref);
    expect(postPartSchema.safeParse({ text: 'hi', media: [{ ...ref, variant: 'huge' }] }).success).toBe(false);
  });

  it('input refs are an asset or a kind + url', () => {
    expect(mediaRefInputSchema.safeParse({ assetId: 'med_1' }).success).toBe(true);
    expect(mediaRefInputSchema.safeParse({ kind: 'image', url: 'https://cdn.test/a.jpg' }).success).toBe(true);
    expect(mediaRefInputSchema.safeParse({ url: 'https://cdn.test/a.jpg' }).success).toBe(false);
    expect(newId('mediaAsset')).toMatch(/^med_/);
  });
});
