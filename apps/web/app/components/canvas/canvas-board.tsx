'use client';

import '@xyflow/react/dist/style.css';
import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type OnEdgesDelete,
  type OnNodeDrag,
  type OnNodesDelete,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import type { Platform } from '@harbor/core';
import { addEdge, addItem, deleteEdge, deleteItem, loadCanvas, runAgent, savePositions, updateItem, type AgentAction } from '../../canvas-actions';
import type { CanvasEdge, CanvasItem, CanvasKind, IdeaView, PostView, SignalView } from '../../api';
import { CanvasCtx, nodeTypes, type CanvasApi, type ItemNode } from './nodes';
import { PlatformIcon } from '../../platform-icon';
import { Select } from '../select';

// ---- Conversions between API items and React Flow nodes ----

const CARD_WIDTH: Record<CanvasKind, number> = { idea: 280, draft: 320, post: 300, signal: 260, note: 240, frame: 640 };

function toNode(item: CanvasItem): ItemNode {
  const frame = item.kind === 'frame';
  return {
    id: item.id,
    type: frame ? 'frame' : 'card',
    position: { x: item.x, y: item.y },
    parentId: item.parentId,
    data: { item },
    width: item.width ?? CARD_WIDTH[item.kind],
    ...(frame ? { height: item.height ?? 400, zIndex: 0, style: { width: item.width ?? 640, height: item.height ?? 400 } } : { zIndex: 1 }),
  };
}
/** React Flow needs parents before children: frames first. */
const toNodes = (items: CanvasItem[]) => [...items.filter((i) => i.kind === 'frame'), ...items.filter((i) => i.kind !== 'frame')].map(toNode);
const toEdge = (e: CanvasEdge): Edge => ({ id: e.id, source: e.source, target: e.target, label: e.label });

export interface BrandContext {
  voice: boolean;
  audiences: string[];
  products: string[];
  connectedPlatforms: Platform[];
}
export interface Library {
  ideas: IdeaView[];
  posts: PostView[];
  signals: SignalView[];
}

export function CanvasBoard(props: { campaignId: string; items: CanvasItem[]; edges: CanvasEdge[]; brand: BrandContext; library: Library; tableHref: string }) {
  return (
    <ReactFlowProvider>
      <Board {...props} />
    </ReactFlowProvider>
  );
}

function Board({ campaignId, items, edges: initialEdges, brand, library, tableHref }: { campaignId: string; items: CanvasItem[]; edges: CanvasEdge[]; brand: BrandContext; library: Library; tableHref: string }) {
  const rf = useReactFlow<ItemNode>();
  const [nodes, setNodes, onNodesChange] = useNodesState<ItemNode>(toNodes(items));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges.map(toEdge));
  const [panel, setPanel] = useState<'agent' | null>(null);
  const [library_, setLibrary] = useState(false);
  const [status, setStatus] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const shell = useRef<HTMLDivElement>(null);

  const flash = (text: string, kind: 'info' | 'error' = 'info') => setStatus({ kind, text });
  const report = <T,>(r: { ok: true; value: T } | { ok: false; error: string }) => {
    if (!r.ok) flash(r.error, 'error');
    return r.ok ? r.value : undefined;
  };

  const reload = useCallback(async () => {
    const r = await loadCanvas(campaignId);
    if (!r.ok) return flash(r.error, 'error');
    setNodes(toNodes(r.value.items));
    setEdges(r.value.edges.map(toEdge));
  }, [campaignId, setNodes, setEdges]);

  const replaceItem = useCallback((item: CanvasItem) => setNodes((ns) => ns.map((n) => (n.id === item.id ? { ...n, data: { item } } : n))), [setNodes]);

  const api = useMemo<CanvasApi>(() => ({
    saveData: async (id, data) => {
      const item = report(await updateItem(id, { data }));
      if (item) replaceItem(item);
    },
    saveSize: async (id, size) => {
      report(await updateItem(id, { x: size.x, y: size.y, width: size.width, height: size.height }));
    },
  }), [replaceItem]);

  // ---- Drag: re-parent into / out of frames, then save positions ----

  const absolute = (id: string) => rf.getInternalNode(id)?.internals.positionAbsolute ?? { x: 0, y: 0 };
  const size = (n: ItemNode) => ({ w: n.measured?.width ?? n.width ?? 0, h: n.measured?.height ?? n.height ?? 0 });

  const onNodeDragStop: OnNodeDrag<ItemNode> = async (_e, _node, dragged) => {
    const frames = rf.getNodes().filter((n) => n.type === 'frame');
    const updates: { id: string; x: number; y: number; parentId: string | null }[] = [];
    for (const n of dragged) {
      if (n.type === 'frame') {
        updates.push({ id: n.id, x: n.position.x, y: n.position.y, parentId: null });
        continue;
      }
      const a = absolute(n.id);
      const { w, h } = size(n);
      const cx = a.x + w / 2;
      const cy = a.y + h / 2;
      const frame = frames
        .filter((f) => f.id !== n.id)
        .find((f) => {
          const fa = absolute(f.id);
          const fs = size(f);
          return cx >= fa.x && cx <= fa.x + fs.w && cy >= fa.y && cy <= fa.y + fs.h;
        });
      const fa = frame ? absolute(frame.id) : { x: 0, y: 0 };
      updates.push({ id: n.id, x: a.x - fa.x, y: a.y - fa.y, parentId: frame?.id ?? null });
    }
    // Re-parent locally (frames stay first in the array).
    setNodes((ns) =>
      ns.map((n) => {
        const u = updates.find((x) => x.id === n.id);
        return u ? { ...n, position: { x: u.x, y: u.y }, parentId: u.parentId ?? undefined } : n;
      }),
    );
    report(await savePositions(campaignId, updates));
  };

  // ---- Connect, delete ----

  const onConnect = async (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const edge = report(await addEdge(campaignId, c.source, c.target));
    if (edge) setEdges((es) => (es.some((e) => e.id === edge.id) ? es : [...es, toEdge(edge)]));
  };
  const onNodesDelete: OnNodesDelete<ItemNode> = async (deleted) => {
    for (const n of deleted) report(await deleteItem(n.id));
    // A deleted frame un-parents its cards on the server; reload to pick up their absolute positions.
    if (deleted.some((n) => n.type === 'frame')) await reload();
  };
  const onEdgesDelete: OnEdgesDelete = async (deleted) => {
    for (const e of deleted) report(await deleteEdge(e.id));
  };

  // ---- Adding cards ----

  const center = () => {
    const r = shell.current?.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 });
  };
  const add = async (kind: CanvasKind, extra: { refId?: string; data?: CanvasItem['data']; width?: number; height?: number } = {}) => {
    const p = center();
    const item = report(await addItem(campaignId, { kind, x: Math.round(p.x - 120), y: Math.round(p.y - 60), ...extra }));
    if (!item) return;
    setNodes((ns) => (ns.some((n) => n.id === item.id) ? ns : kind === 'frame' ? [toNode(item), ...ns] : [...ns, toNode(item)]));
    flash(`Added ${kind === 'frame' ? 'a frame' : `a ${kind} card`}.`);
  };

  const onCanvas = useMemo(() => new Set(nodes.map((n) => `${n.data.item.kind}:${n.data.item.refId}`)), [nodes]);

  // ---- Agent ----

  const selected = nodes.filter((n) => n.selected);
  const selectedIdea = selected.length === 1 && selected[0]!.data.item.kind === 'idea' ? selected[0]! : undefined;
  const selectedFrame = selected.length === 1 && selected[0]!.type === 'frame' ? selected[0]! : undefined;
  const contextFor = (id: string) =>
    edges
      .filter((e) => e.source === id || e.target === id)
      .map((e) => nodes.find((n) => n.id === (e.source === id ? e.target : e.source)))
      .filter((n): n is ItemNode => !!n && ['post', 'signal', 'note'].includes(n.data.item.kind));

  const run = async (label: string, action: AgentAction) => {
    setBusy(label);
    setStatus(null);
    const res = await runAgent(campaignId, action);
    setBusy(null);
    if (!res.ok) return flash(res.error, 'error');
    await reload();
    const n = res.value.items.length;
    flash(`${label}: added ${n} card${n === 1 ? '' : 's'}${res.value.run ? ` · ${res.value.run.model}` : ''}.`);
  };

  return (
    <CanvasCtx.Provider value={api}>
      <div className="canvas-shell" ref={shell}>
        <ReactFlow<ItemNode>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.15}
          maxZoom={1.75}
          proOptions={{ hideAttribution: false }}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <MiniMap pannable zoomable className="cv-minimap" nodeStrokeWidth={2} />
        </ReactFlow>

        {panel === 'agent' ? (
          <aside className="cv-panel cv-panel-left" aria-label="Agent">
            <div className="spread">
              <span className="label row" style={{ gap: 8 }}><span className="pixels" aria-hidden="true" />Agent</span>
              <span className="row"><span className="tag">Simulated · no spend</span><button type="button" className="link-button small" onClick={() => setPanel(null)} aria-label="Close agent panel">Close</button></span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Context</span>
              <div className="chips">
                <span className={`chip${brand.voice ? ' on' : ''}`}>Voice</span>
                {brand.audiences.map((a) => <span key={a} className="chip on">{a}</span>)}
                {brand.products.map((p) => <span key={p} className="chip on">{p}</span>)}
              </div>
              <span className="dim small">
                {selected.length ? `${selected.length} card${selected.length > 1 ? 's' : ''} selected` : 'Select cards to point the agent at them.'}
              </span>
            </div>

            <AgentStep title="Suggest ideas" hint={selectedFrame ? `Into "${selectedFrame.data.item.data.title}"` : 'Into the Ideas frame'}>
              <SuggestIdeas busy={!!busy} onRun={(count) => run('Suggest ideas', { action: 'suggest_ideas', count, frameId: selectedFrame?.id })} />
            </AgentStep>

            <AgentStep title="Draft the selected idea" hint={selectedIdea ? selectedIdea.data.item.data.title ?? (selectedIdea.data.item.entity as IdeaView | undefined)?.title : 'Select one idea card'}>
              {selectedIdea ? (
                <DraftIdea
                  busy={!!busy}
                  connected={brand.connectedPlatforms}
                  context={contextFor(selectedIdea.id)}
                  onRun={(platforms) => run('Draft', { action: 'draft', ideaItemId: selectedIdea.id, platforms })}
                />
              ) : (
                <span className="dim small">Connect posts, signals or notes to the idea card first; the draft uses them as context.</span>
              )}
            </AgentStep>

            <AgentStep title="Bring in evidence" hint="What already worked, and what Harbor noticed">
              <div className="row">
                <button type="button" disabled={!!busy} onClick={() => run('Top posts', { action: 'add_top_posts', count: 4, frameId: selectedFrame?.id })}>Add top posts</button>
                <button type="button" disabled={!!busy} onClick={() => run('Signals', { action: 'add_signals', count: 4 })}>Add signals</button>
              </div>
            </AgentStep>

            {busy ? <p className="small muted">{busy}…</p> : null}
          </aside>
        ) : null}

        {library_ ? (
          <aside className="cv-panel cv-panel-right" aria-label="Library">
            <div className="spread">
              <span className="label">Library</span>
              <button type="button" className="link-button small" onClick={() => setLibrary(false)}>Close</button>
            </div>
            <LibraryList title="Ideas" items={library.ideas.filter((i) => !onCanvas.has(`idea:${i.id}`)).map((i) => ({ id: i.id, label: i.title, meta: i.status }))} onAdd={(id) => add('idea', { refId: id })} />
            <LibraryList title="Posts" items={library.posts.filter((p) => !onCanvas.has(`post:${p.id}`)).map((p) => ({ id: p.id, label: p.parts[0]?.text ?? '', meta: `${p.channel.platform} · ${p.status}` }))} onAdd={(id) => add('post', { refId: id })} />
            <LibraryList title="Signals" items={library.signals.filter((s) => !onCanvas.has(`signal:${s.id}`)).map((s) => ({ id: s.id, label: s.summary, meta: s.kind.replace('_', ' ') }))} onAdd={(id) => add('signal', { refId: id })} />
          </aside>
        ) : null}

        <div className="cv-dock" role="toolbar" aria-label="Canvas tools">
          <button type="button" aria-pressed={panel === 'agent'} onClick={() => setPanel(panel === 'agent' ? null : 'agent')}>Agent</button>
          <button type="button" onClick={() => add('note', { data: { text: '' } })}>+ Note</button>
          <button type="button" onClick={() => add('idea', { data: { title: 'New idea' } })}>+ Idea</button>
          <button type="button" onClick={() => add('frame', { data: { title: 'New frame' }, width: 640, height: 400 })}>+ Frame</button>
          <button type="button" aria-pressed={library_} onClick={() => setLibrary(!library_)}>Library</button>
          <button type="button" onClick={() => rf.fitView({ padding: 0.15, duration: 300 })}>Fit</button>
          <span className="cv-dock-sep" />
          <span className="segmented" role="group" aria-label="View">
            <button type="button" aria-pressed="true">Board</button>
            <Link href={tableHref}>Table</Link>
          </span>
        </div>

        {status ? (
          <div className={`cv-status${status.kind === 'error' ? ' error' : ''}`} role="status">
            {status.text}
            <button type="button" className="link-button small" onClick={() => setStatus(null)}>Dismiss</button>
          </div>
        ) : null}
      </div>
    </CanvasCtx.Provider>
  );
}

function AgentStep({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="cv-step">
      <div className="stack" style={{ gap: 2 }}>
        <strong style={{ fontWeight: 500 }}>{title}</strong>
        {hint ? <span className="dim small">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function SuggestIdeas({ busy, onRun }: { busy: boolean; onRun: (count: number) => void }) {
  const [count, setCount] = useState(5);
  return (
    <div className="row">
      <Select value={String(count)} onChange={(v) => setCount(Number(v))} ariaLabel="How many ideas" width="auto" options={[3, 5, 8].map((n) => ({ value: String(n), label: `${n} ideas` }))} />
      <button type="button" className="primary" disabled={busy} onClick={() => onRun(count)}>Suggest</button>
    </div>
  );
}

const PLATFORMS: Platform[] = ['x', 'linkedin', 'threads', 'instagram'];
const NAME: Record<Platform, string> = { x: 'X', linkedin: 'LinkedIn', threads: 'Threads', instagram: 'Instagram' };

function DraftIdea({ busy, connected, context, onRun }: { busy: boolean; connected: Platform[]; context: ItemNode[]; onRun: (p: Platform[]) => void }) {
  const [picked, setPicked] = useState<Platform[]>(connected.length ? connected.filter((p) => p !== 'instagram') : ['x', 'linkedin']);
  const toggle = (p: Platform) => setPicked((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        {PLATFORMS.map((p) => (
          <label key={p} className="channel-pick">
            <input type="checkbox" checked={picked.includes(p)} onChange={() => toggle(p)} />
            <PlatformIcon platform={p} size={13} />{NAME[p]}
          </label>
        ))}
      </div>
      <span className="dim small">
        {context.length
          ? `Uses ${context.length} connected card${context.length > 1 ? 's' : ''}: ${context.map((c) => c.data.item.kind).join(', ')}.`
          : 'No connected context yet: drag from a post, signal or note to the idea to link it.'}
      </span>
      <div><button type="button" className="primary" disabled={busy || !picked.length} onClick={() => onRun(picked)}>Draft</button></div>
    </div>
  );
}

function LibraryList({ title, items, onAdd }: { title: string; items: { id: string; label: string; meta: string }[]; onAdd: (id: string) => void }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <span className="label">{title} · {items.length}</span>
      {items.length === 0 ? <span className="dim small">Everything is on the canvas.</span> : (
        <ul className="list small">
          {items.slice(0, 12).map((i) => (
            <li key={i.id} style={{ gridTemplateColumns: '1fr auto', alignItems: 'center', columnGap: 8 }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
                <span className="dim">{i.meta}</span>
              </span>
              <button type="button" onClick={() => onAdd(i.id)}>Add</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
