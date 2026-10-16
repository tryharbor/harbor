/**
 * Harbor's MCP tools, as defined in apps/api/src/services/mcp.ts (names, arguments, descriptions and scopes).
 * Kept by hand: the site doesn't import the API. Update both together.
 */

export type McpTool = { name: string; args: string; scope: 'read' | 'write'; description: string };

export const MCP_TOOLS: McpTool[] = [
  // Read
  { name: 'list_brands', args: '', scope: 'read', description: 'List the brands in this workspace with their connected channels.' },
  { name: 'get_brand_memory', args: 'brandId', scope: 'read', description: 'A brand’s Brand Memory: voice (summary, do, avoid, banned words), audiences, products, knowledge, style rules and example posts.' },
  { name: 'list_posts', args: 'brandId, status?, limit?', scope: 'read', description: 'A brand’s posts, newest first, with their latest metrics and verdict against the brand’s median.' },
  { name: 'get_post', args: 'postId', scope: 'read', description: 'One post with its outcome (verdict against the median), its growth curve (snapshots) and the baseline curve.' },
  { name: 'get_digest', args: 'brandId', scope: 'read', description: 'The brand’s latest weekly digest: headline, stats, wins, misses, patterns and recommendations.' },
  { name: 'best_times', args: 'brandId, platform?', scope: 'read', description: 'The best posting slots (weekday 0 = Sunday, hour 0-23, server local time), scored 0..1, for one platform or all of the brand’s platforms.' },
  { name: 'list_campaigns', args: 'brandId?', scope: 'read', description: 'Campaigns, newest first, optionally for one brand.' },
  { name: 'list_ideas', args: 'brandId, status?', scope: 'read', description: 'A brand’s ideas, most recently updated first, optionally by status (idea, drafting, approved, scheduled, live).' },
  { name: 'list_approvals', args: 'status?, brandId?', scope: 'read', description: 'The approval queue: posts agents proposed, each with its draft, slot, reason and voice checks. Pending first.' },
  { name: 'list_memory_proposals', args: 'status?, brandId?', scope: 'read', description: 'Brand Memory changes agents proposed (the voice refresh): each change with why, its lift and the posts behind it. Pending first. A person applies them in Harbor.' },
  { name: 'get_conversation', args: 'brandId, days?', scope: 'read', description: 'What people say in replies to a brand’s posts, grouped into themes (questions, objections, praise, requests), largest first.' },
  { name: 'list_media', args: 'brandId, tag?', scope: 'read', description: 'A brand’s media library, newest first: images and videos with alt text, tags, focal point and the public URL of each crop. Attach one to a draft with attach_media.' },
  { name: 'list_agents', args: '', scope: 'read', description: 'Harbor’s built-in agents: what each does, its inputs and its steps. Run one with run_agent.' },
  { name: 'get_agent_run', args: 'runId', scope: 'read', description: 'One agent or model run with its inputs, steps, child runs and the approvals it queued.' },
  // Write
  { name: 'create_idea', args: 'brandId, title, angle?, notes?', scope: 'write', description: 'Add an idea to a brand. It starts in the Idea column.' },
  { name: 'suggest_ideas', args: 'brandId, count?', scope: 'write', description: 'Suggest ideas for a brand from its signals (post performance, audience pain points); each cites a signal.' },
  { name: 'draft_idea', args: 'ideaId, platforms', scope: 'write', description: 'Draft an idea for one or more platforms (x, linkedin, instagram, threads). Each draft is a new version.' },
  { name: 'propose_post', args: 'draftId, proposedFor?, reason?', scope: 'write', description: 'Propose a draft for posting. Creates a pending approval (a person approves, edits or rejects it); nothing is published or scheduled. Without proposedFor it takes the next free best-time slot on the channel.' },
  { name: 'attach_media', args: 'draftId, assetId, variant?', scope: 'write', description: 'Attach an image or video from the brand’s media library to a draft’s first part. Saves a new draft version; the crop defaults to the platform’s preferred one.' },
  { name: 'run_agent', args: 'agentId, inputs', scope: 'write', description: 'Run one of the built-in agents (see list_agents) with its inputs. Agents never publish; posts they want out become approvals.' },
  { name: 'add_knowledge', args: 'brandId, title, body', scope: 'write', description: 'Add a note to a brand’s Brand Memory knowledge (facts, positioning, FAQs the drafts should know).' },
  { name: 'save_to_memory', args: 'brandId, from, as, text?, note?, title?', scope: 'write', description: 'Save a post, reply, reply theme, signal or draft to a brand’s Brand Memory as a knowledge note, an excerpt, an example post, or a do / avoid rule. Rules link back to their source as evidence.' },
  { name: 'add_canvas_note', args: 'campaignId, text', scope: 'write', description: 'Put a sticky note on a campaign’s canvas, to the right of everything on it.' },
];

/** The built-in agents run_agent accepts (apps/api/src/services/agents.ts). */
export const AGENTS = [
  { id: 'weekly_plan', name: 'Weekly plan', does: 'Reads last week, finds open best-time slots, suggests ideas, drafts them per platform, runs the voice check and queues approvals.' },
  { id: 'repurpose_winner', name: 'Repurpose a winner', does: 'Takes a published post that did well and drafts it for your other platforms.' },
  { id: 'voice_check', name: 'Voice check', does: 'Checks a draft for banned words, length, hashtags, media and an empty hook. No model call.' },
  { id: 'digest', name: 'Weekly digest', does: 'Wins, misses, patterns and recommendations, each citing posts and signals.' },
  { id: 'voice_refresh', name: 'Voice refresh', does: 'Compares winners with the rest and proposes Brand Memory changes with their lift and evidence.' },
];
