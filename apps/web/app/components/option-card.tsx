'use client';

import Link from 'next/link';
import { useState } from 'react';
import { chooseAssistantOption } from '../actions';
import type { PostOption } from '../api';
import { PLATFORM_NAME } from '../ui';
import { PlatformIcon } from '../platform-icon';
import { SubmitButton } from './submit-button';

/** One post option: its design, its caption per platform (tabs), and "Use this", which opens it in Studio. */
export function OptionCard({ option, designSrc, chatId, brandId }: { option: PostOption; designSrc: string; chatId: string; brandId: string }) {
  const [platform, setPlatform] = useState(option.drafts[0]?.platform);
  const draft = option.drafts.find((d) => d.platform === platform) ?? option.drafts[0];
  const text = draft?.parts.map((p) => p.text).join('\n\n') ?? '';
  return (
    <article className="option-card">
      <img className="pd-img" src={designSrc} alt={`${option.label} design: ${option.design.headline}`} width={1080} height={1080} loading="lazy" />
      <div className="option-body">
        <div className="spread" style={{ gap: 8 }}>
          <span className="tag">{option.label}</span>
          {option.drafts.length > 1 ? (
            <div className="segmented" role="tablist" aria-label="Platform">
              {option.drafts.map((d) => (
                <button key={d.platform} type="button" role="tab" aria-selected={d.platform === platform} aria-pressed={d.platform === platform} onClick={() => setPlatform(d.platform)} title={PLATFORM_NAME[d.platform]}>
                  <PlatformIcon platform={d.platform} size={13} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p className="option-text">{text}</p>
        <div className="spread" style={{ marginTop: 'auto' }}>
          <span className="small dim">{draft ? `${PLATFORM_NAME[draft.platform]} · ${text.length} chars${draft.parts.length > 1 ? ` · ${draft.parts.length} parts` : ''}` : ''}</span>
          {option.ideaId ? (
            <Link className="button" href={`/studio/${option.ideaId}`}>Open in Studio</Link>
          ) : (
            <form action={chooseAssistantOption}>
              <input type="hidden" name="chatId" value={chatId} />
              <input type="hidden" name="brandId" value={brandId} />
              <input type="hidden" name="optionId" value={option.id} />
              <SubmitButton className="primary" pending="Opening…">Use this</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </article>
  );
}
