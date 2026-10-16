'use client';

import { useEffect, useState } from 'react';
import { useInView, useReducedMotion } from '../../components/reveal';

/**
 * How self-hosted Harbor fits together, drawn in SVG: a wide layout for desktop and a stacked one for phones.
 * When it scrolls into view the boxes fade in, the connectors draw, then data moves along them slowly.
 * Reduced motion: drawn in its final state, nothing moves.
 */

type Box = { id: string; x: number; y: number; w: number; h: number; label: string; title: string; lines?: string[]; tone?: 'outer' | 'inner' | 'group' };
type Edge = { id: string; d: string; color: 'pink' | 'violet' | 'coral' | 'amber' | 'yellow'; label?: string; lx?: number; ly?: number; anchor?: 'start' | 'middle' | 'end'; reverse?: boolean };
type Layout = { w: number; h: number; boxes: Box[]; edges: Edge[] };

const WIDE: Layout = {
  w: 1000,
  h: 540,
  boxes: [
    { id: 'browser', x: 20, y: 60, w: 200, h: 96, label: 'You', title: 'A browser', lines: ['localhost:4801'] },
    { id: 'mcp', x: 20, y: 390, w: 200, h: 124, label: 'Agents', title: 'MCP clients', lines: ['Claude Code over HTTP', 'Claude Desktop over the', 'stdio bridge'] },
    { id: 'web', x: 300, y: 50, w: 240, h: 116, label: 'apps/web', title: 'Next.js app', lines: ['App Router · :4801', 'Studio, Hub, Approvals'] },
    { id: 'api', x: 300, y: 250, w: 420, h: 270, label: 'apps/api', title: 'Hono API · :4800', tone: 'group' },
    { id: 'v1', x: 320, y: 300, w: 185, h: 90, label: '/v1', title: 'REST API', lines: ['what the web app calls'], tone: 'inner' },
    { id: 'worker', x: 515, y: 300, w: 185, h: 90, label: 'In process', title: 'Worker', lines: ['publishes, snapshots,', 'runs automations'], tone: 'inner' },
    { id: 'mcpd', x: 320, y: 405, w: 185, h: 95, label: '/mcp', title: 'MCP server', lines: ['Streamable HTTP', 'Bearer hbr_ keys'], tone: 'inner' },
    { id: 'media', x: 515, y: 405, w: 185, h: 95, label: '/media', title: 'Public crops', lines: ['Instagram and Threads', 'download from here'], tone: 'inner' },
    { id: 'platforms', x: 790, y: 40, w: 190, h: 180, label: 'Platform APIs', title: 'Your own apps', lines: ['X', 'LinkedIn', 'Instagram', 'Threads'] },
    { id: 'db', x: 790, y: 410, w: 190, h: 110, label: 'DATABASE_URL', title: 'Postgres', lines: ['or embedded PGlite', 'when unset'] },
  ],
  edges: [
    { id: 'browser-web', d: 'M220 108 H300', color: 'pink' },
    { id: 'web-api', d: 'M412 166 V300', color: 'violet', label: 'fetch /v1', lx: 422, ly: 214, anchor: 'start' },
    { id: 'mcp-api', d: 'M220 452 H320', color: 'coral' },
    { id: 'worker-platforms', d: 'M607 300 V110 H790', color: 'amber', label: 'publish · metrics · OAuth', lx: 617, ly: 98, anchor: 'start' },
    { id: 'media-platforms', d: 'M700 430 H752 V180 H790', color: 'yellow', reverse: true },
    { id: 'api-db', d: 'M720 465 H790', color: 'violet' },
  ],
};

const NARROW: Layout = {
  w: 360,
  h: 916,
  boxes: [
    { id: 'browser', x: 16, y: 16, w: 156, h: 76, label: 'You', title: 'A browser', lines: [':4801'] },
    { id: 'mcp', x: 188, y: 16, w: 156, h: 76, label: 'Agents', title: 'MCP clients', lines: ['HTTP or stdio'] },
    { id: 'web', x: 16, y: 140, w: 156, h: 92, label: 'apps/web', title: 'Next.js app', lines: ['App Router'] },
    { id: 'api', x: 16, y: 290, w: 328, h: 400, label: 'apps/api', title: 'Hono API · :4800', tone: 'group' },
    { id: 'v1', x: 32, y: 344, w: 296, h: 72, label: '/v1', title: 'REST API', lines: ['what the web app calls'], tone: 'inner' },
    { id: 'mcpd', x: 32, y: 426, w: 296, h: 76, label: '/mcp', title: 'MCP server', lines: ['Streamable HTTP · hbr_ keys'], tone: 'inner' },
    { id: 'worker', x: 32, y: 512, w: 296, h: 76, label: 'In process', title: 'Worker', lines: ['publishes, snapshots, automations'], tone: 'inner' },
    { id: 'media', x: 32, y: 598, w: 296, h: 76, label: '/media', title: 'Public crops', lines: ['for Instagram and Threads'], tone: 'inner' },
    { id: 'db', x: 16, y: 750, w: 156, h: 96, label: 'DATABASE_URL', title: 'Postgres', lines: ['or PGlite'] },
    { id: 'platforms', x: 188, y: 750, w: 156, h: 150, label: 'Platform APIs', title: 'Your own apps', lines: ['X', 'LinkedIn', 'Instagram', 'Threads'] },
  ],
  edges: [
    { id: 'browser-web', d: 'M94 92 V140', color: 'pink' },
    { id: 'web-api', d: 'M94 232 V344', color: 'violet' },
    { id: 'mcp-api', d: 'M266 92 V426', color: 'coral' },
    { id: 'api-db', d: 'M94 690 V750', color: 'violet' },
    { id: 'api-platforms', d: 'M266 690 V750', color: 'amber' },
  ],
};

function Diagram({ layout, on, paused, className }: { layout: Layout; on: boolean; paused: boolean; className: string }) {
  return (
    <svg className={`os-arch ${className}${on ? ' on' : ''}${paused ? ' paused' : ''}`} viewBox={`0 0 ${layout.w} ${layout.h}`} role="img" aria-label="Harbor's architecture: a browser talks to apps/web (Next.js), which calls apps/api (Hono) over /v1. MCP clients connect to /mcp on the same API. The API's in-process worker publishes to and reads metrics from the X, LinkedIn, Instagram and Threads APIs, which download media from /media. Everything is stored in Postgres, or embedded PGlite when DATABASE_URL is unset.">
      <defs>
        <pattern id={`dots-${className}`} width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" className="os-dot" /></pattern>
      </defs>
      <rect x="0" y="0" width={layout.w} height={layout.h} fill={`url(#dots-${className})`} />
      {layout.edges.map((e, i) => (
        <g key={e.id} className={`os-edge c-${e.color}`} style={{ ['--i' as string]: i }}>
          <path d={e.d} className="os-edge-base" pathLength={1} />
          <path d={e.d} className={`os-edge-flow${e.reverse ? ' rev' : ''}`} />
          {e.label ? <text x={e.lx} y={e.ly} textAnchor={e.anchor ?? 'start'} className="os-edge-label">{e.label}</text> : null}
        </g>
      ))}
      {layout.boxes.map((b, i) => (
        <g key={b.id} className={`os-box ${b.tone ?? 'outer'}`} style={{ ['--i' as string]: i }}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} />
          <text x={b.x + 14} y={b.y + 22} className="os-box-label">{b.label}</text>
          <text x={b.x + 14} y={b.y + 44} className="os-box-title">{b.title}</text>
          {b.lines?.map((l, j) => <text key={l} x={b.x + 14} y={b.y + 64 + j * 18} className="os-box-line">{l}</text>)}
        </g>
      ))}
    </svg>
  );
}

export function Architecture() {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const reduced = useReducedMotion();
  const [seen, setSeen] = useState(false);
  useEffect(() => { if (inView) setSeen(true); }, [inView]);
  const on = seen || reduced;
  // Off screen (or reduced motion), the flowing dashes stop.
  const paused = !inView || reduced;
  return (
    <div ref={ref} className="os-arch-frame">
      <Diagram layout={WIDE} on={on} paused={paused} className="wide" />
      <Diagram layout={NARROW} on={on} paused={paused} className="narrow" />
    </div>
  );
}
