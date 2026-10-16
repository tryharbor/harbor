import type { Metadata } from 'next';
import Link from 'next/link';
import { AlsoInArea, FeatureHero, FeatureNav, FeatureSection, SectionIndex, feature } from '../../../components/product/feature';
import { AgentLibraryPreview } from '../../../components/previews/agent-library';
import { ApprovalDetailPreview } from '../../../components/previews/approval-detail';
import { AutomationsPreview } from '../../../components/previews/automations';
import { McpPreview } from '../../../components/previews/mcp';
import { RunLogPreview } from '../../../components/previews/run-log';
import { CtaBand } from '../../../components/ui';
import '../product.css';
import { pageMeta } from '../../../lib/seo';

export const metadata: Metadata = pageMeta('/product/agents', {
  title: 'Agents & Approvals',
  description: 'Built-in agents plan the week, repurpose winners, check drafts, write the digest and refresh the voice. Every run is logged, and nothing posts until a person approves it. Claude can work in Harbor over MCP.',
});

const f = feature('agents');

export default function AgentsPage() {
  return (
    <>
      <FeatureHero
        f={f}
        title="Agents do the homework. You make the call."
        lede="Five built-in agents plan the week, repurpose winners, check drafts, write the digest and refresh the voice. Every step is logged, and nothing they make goes out until a person approves it."
        windowTitle="Agents · Library"
      >
        <AgentLibraryPreview />
      </FeatureHero>

      <SectionIndex f={f} items={[
        { id: 'runs', label: 'Run logs' },
        { id: 'automations', label: 'Automations' },
        { id: 'approvals', label: 'Approvals' },
        { id: 'mcp', label: 'MCP' },
      ]} />

      <FeatureSection
        id="runs" n={1} f={f}
        eyebrow="Run logs"
        title="Every run, step by step."
        body={<p>Each run is a timeline: what every step did, how long it took and what it made, linked to the ideas, drafts and approvals it created. It also shows who started it (you, an automation, the canvas or an MCP client), the model and its tokens.</p>}
        points={['Model calls inside a run are listed as child runs', 'Simulated output is always labeled', 'A failed step says why, and the run keeps its record']}
        windowTitle="Agents · Run log"
        preview={<RunLogPreview />}
      />

      <FeatureSection
        id="automations" n={2} f={f} flip
        eyebrow="Automations"
        title="On a schedule, or when a post does something."
        body={<p>An automation runs an agent once a week at the hour you pick, or when a post outperforms its median for the first time. That event is what Repurpose a winner listens for.</p>}
        points={['A daily run cap, 3 by default', 'Pauses itself after 3 failures in a row', 'The same post never triggers the same automation twice']}
        windowTitle="Agents · Automations"
        preview={<AutomationsPreview />}
      />

      <FeatureSection
        id="approvals" n={3} f={f}
        eyebrow="Approvals"
        title="Agents propose. People publish."
        body={
          <>
            <p>No agent publishes or schedules on its own: not the built-in ones, not automations, not an MCP client. Whatever an agent wants posted becomes an approval with the draft, the channel, a proposed slot, the reason for it and the voice-check results.</p>
            <p>Approving schedules it. Editing first saves a new draft version. Rejecting keeps the record, with an optional note.</p>
          </>
        }
        points={['Approve or reject a whole week in bulk', 'Instagram can’t be approved without an image or video', 'A slot that has passed asks you for a new time']}
        windowTitle="Approvals"
        preview={<ApprovalDetailPreview />}
      />

      <FeatureSection
        id="mcp" n={4} f={f} flip
        eyebrow="MCP"
        title="Let Claude work in Harbor."
        body={<p>Harbor ships an MCP server over Streamable HTTP, plus a stdio bridge for clients that only speak stdio. Create an API key with read or write scope, and Claude can read Brand Memory, check best times, draft and propose posts. There’s no publish tool: proposals land in Approvals like everything else.</p>}
        points={['Keys start with hbr_ and only their hash is stored', 'Every tool result states the mode, like sandbox or simulated', 'MCP runs show in the run log, with the key that made them']}
        windowTitle="Claude · Harbor MCP"
        preview={<McpPreview />}
        after={<Link className="link-arrow" href="/developers">MCP tools and API →</Link>}
      />

      <AlsoInArea f={f} items={[
        { title: 'Weekly plan', body: 'Pick the platforms, 1 to 7 posts per platform and an optional campaign. It reuses a digest under 24 hours old.' },
        { title: 'Voice check', body: 'No model call: banned words, length, hashtag count, checkable style rules, an empty hook and media.' },
        { title: 'Campaigns', body: 'Give the weekly plan a campaign, and its ideas and drafts land in that campaign’s canvas frames.', href: '/product/studio#canvas' },
        { title: 'Voice refresh', body: 'Proposes Brand Memory changes from results. They wait in Approvals, on their own tab.', href: '/product/brand-memory#results' },
        { title: 'Simulated model', body: 'Agents can run on the built-in simulated model: real steps and real data, no API spend.' },
      ]} />

      <FeatureNav f={f} />
      <CtaBand />
    </>
  );
}
