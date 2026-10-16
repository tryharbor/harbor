'use client';

import Link from 'next/link';
import { createContext, memo, useContext, useState } from 'react';
import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react';
import type { CanvasItem, DraftView, IdeaView, PostView, SignalView } from '../../api';
import { PlatformIcon } from '../../platform-icon';
import type { Platform } from '@harbor/core';

/** What node components can ask the board to do (save inline edits). */
export interface CanvasApi {
  saveData: (id: string, data: CanvasItem['data']) => void;
  saveSize: (id: string, size: { x: number; y: number; width: number; height: number }) => void;
}
export const CanvasCtx = createContext<CanvasApi | null>(null);
const useCanvas = () => useContext(CanvasCtx)!;

export type ItemNode = Node<{ item: CanvasItem }, 'frame' | 'card'>;

const PLATFORM: Record<string, string> = { x: 'X', linkedin: 'LinkedIn', instagram: 'Instagram', threads: 'Threads' };
const compact = (n?: number) => (n === undefined ? undefined : Intl.NumberFormat('en-US', { notation: 'compact' }).format(n));

// ---- Frame ----

export const FrameNode = memo(function FrameNode({ id, data, selected }: NodeProps<ItemNode>) {
  const canvas = useCanvas();
  const [editing, setEditing] = useState(false);
  const title = data.item.data.title ?? 'Frame';
  return (
    <div className={`cv-frame${selected ? ' selected' : ''}`}>
      <NodeResizer
        isVisible={selected}
        minWidth={260}
        minHeight={180}
        lineClassName="cv-resize-line"
        handleClassName="cv-resize-handle"
        onResizeEnd={(_, p) => canvas.saveSize(id, { x: p.x, y: p.y, width: p.width, height: p.height })}
      />
      <div className="cv-frame-head">
        {editing ? (
          <input
            className="nodrag cv-inline"
            autoFocus
            defaultValue={title}
            aria-label="Frame title"
            onBlur={(e) => {
              setEditing(false);
              if (e.target.value.trim() && e.target.value !== title) canvas.saveData(id, { title: e.target.value.trim() });
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <span className="cv-frame-title" onDoubleClick={() => setEditing(true)} title="Double-click to rename">{title}</span>
        )}
      </div>
    </div>
  );
});

// ---- Cards ----

function Shell({ kind, label, selected, children, aside }: { kind: string; label: React.ReactNode; selected: boolean; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className={`cv-card cv-${kind}${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="cv-handle" />
      <div className="cv-card-head">
        <span className="cv-kind">{label}</span>
        {aside}
      </div>
      {children}
      <Handle type="source" position={Position.Right} className="cv-handle" />
    </div>
  );
}

export const CardNode = memo(function CardNode({ id, data, selected }: NodeProps<ItemNode>) {
  const item = data.item;
  const e = item.entity;
  switch (item.kind) {
    case 'note':
      return <NoteCard id={id} item={item} selected={selected} />;
    case 'idea': {
      if (!e) return <Removed kind="Idea" selected={selected} />;
      const idea = e as IdeaView;
      return (
        <Shell kind="idea" label="Idea" selected={selected} aside={<span className={`pill s-${idea.status}`}>{idea.status}</span>}>
          <div className="cv-title">{idea.title}</div>
          {idea.basis[0]?.note ? <div className="cite cv-cite">{idea.basis[0].note}</div> : idea.angle ? <div className="cv-body">{idea.angle}</div> : null}
          <div className="cv-foot"><Link className="nodrag" href={`/studio/${idea.id}`}>Open in Studio →</Link></div>
        </Shell>
      );
    }
    case 'draft': {
      if (!e) return <Removed kind="Draft" selected={selected} />;
      const d = e as DraftView & { simulated?: boolean };
      const first = d.parts[0]?.text ?? '';
      return (
        <Shell kind="draft" label={<><PlatformIcon platform={d.platform as Platform} size={11} /> Draft · {PLATFORM[d.platform]} <span className="dim">v{d.version}</span></>} selected={selected} aside={d.author === 'agent' ? <span className="tag">Simulated</span> : <span className="tag">You</span>}>
          <div className="cv-body cv-clamp">{first}</div>
          <div className="cv-foot">
            <span className="mono dim">{[...first].length} chars{d.parts.length > 1 ? ` · thread of ${d.parts.length}` : ''}</span>
            {d.ideaId ? <Link className="nodrag" href={`/studio/${d.ideaId}`}>Edit →</Link> : null}
          </div>
        </Shell>
      );
    }
    case 'post': {
      if (!e) return <Removed kind="Post" selected={selected} />;
      const p = e as PostView;
      const m = p.latest?.metrics;
      return (
        <Shell kind="post" label={<><PlatformIcon platform={p.channel.platform} size={11} /> Post · {PLATFORM[p.channel.platform]} <span className="dim">@{p.channel.handle}</span></>} selected={selected} aside={<span className={`pill s-${p.status}`}>{p.status}</span>}>
          <div className="cv-body cv-clamp">{p.parts[0]?.text}</div>
          <div className="cv-foot">
            {m ? (
              <span className="metric-line num">
                {m.views !== undefined ? <span><strong>{compact(m.views)}</strong> views</span> : null}
                {m.likes !== undefined ? <span><strong>{compact(m.likes)}</strong> likes</span> : null}
                {m.comments !== undefined ? <span><strong>{compact(m.comments)}</strong> replies</span> : null}
              </span>
            ) : <span className="dim">No metrics yet</span>}
            <Link className="nodrag" href={`/performance/${p.id}`}>Open →</Link>
          </div>
        </Shell>
      );
    }
    case 'signal': {
      if (!e) return <Removed kind="Signal" selected={selected} />;
      const s = e as Pick<SignalView, 'kind' | 'summary'>;
      return (
        <Shell kind="signal" label={<>Signal · <span className="dim">{s.kind.replace('_', ' ')}</span></>} selected={selected}>
          <div className="cv-body">{s.summary}</div>
        </Shell>
      );
    }
    default:
      return <Removed kind="Card" selected={selected} />;
  }
});

function NoteCard({ id, item, selected }: { id: string; item: CanvasItem; selected: boolean }) {
  const canvas = useCanvas();
  const [editing, setEditing] = useState(!item.data.text);
  const text = item.data.text ?? '';
  return (
    <Shell kind="note" label="Note" selected={selected}>
      {editing ? (
        <textarea
          className="nodrag nowheel cv-inline cv-note-input"
          autoFocus
          defaultValue={text}
          aria-label="Note"
          placeholder="Write a note…"
          onBlur={(e) => {
            setEditing(false);
            if (e.target.value !== text) canvas.saveData(id, { text: e.target.value });
          }}
        />
      ) : (
        <div className="cv-body cv-note" onDoubleClick={() => setEditing(true)} title="Double-click to edit">{text || <span className="dim">Empty note</span>}</div>
      )}
    </Shell>
  );
}

function Removed({ kind, selected }: { kind: string; selected: boolean }) {
  return (
    <Shell kind="removed" label={kind} selected={selected}>
      <div className="cv-body dim">This {kind.toLowerCase()} was deleted. Remove the card with Backspace.</div>
    </Shell>
  );
}

export const nodeTypes = { frame: FrameNode, card: CardNode };
