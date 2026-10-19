import {
  HarborError,
  RefreshNeeded,
  channelAccountSchema,
  newId,
  type Channel,
  type ChannelStatus,
  type Platform,
  type PlatformProvider,
  type ProviderContext,
  type TokenSet,
} from '@harbor/core';
import type { Db } from '../db/client.ts';
import { iso } from '../lib/http.ts';
import type { SecretStore } from '../lib/secrets.ts';
import { releasePersonAvatar } from './brands.ts';

export interface ChannelRow {
  id: string;
  brand_id: string;
  platform: Platform;
  platform_account_id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  /** Meta's app-scoped user id, when it differs from platform_account_id (Instagram). Not returned by the API. */
  app_scoped_id?: string | null;
  token_ref: string;
  scopes: string[];
  status: ChannelStatus;
  token_expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** What the secret store holds for a channel. Never returned by the API. */
export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export const toChannel = (r: ChannelRow): Channel => ({
  id: r.id,
  brandId: r.brand_id,
  platform: r.platform,
  account: channelAccountSchema.parse({
    platformAccountId: r.platform_account_id,
    handle: r.handle,
    displayName: r.display_name ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
  }),
  tokenRef: r.token_ref,
  scopes: r.scopes,
  status: r.status,
  tokenExpiresAt: r.token_expires_at ? iso(r.token_expires_at) : undefined,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

/** Refresh this long before expiry so a publish never starts with a token about to lapse. */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

export async function getChannelRow(db: Db, id: string): Promise<ChannelRow> {
  const [row] = await db.query<ChannelRow>('SELECT * FROM channels WHERE id = $1', [id]);
  if (!row) throw new HarborError('NOT_FOUND', `Channel ${id} not found.`);
  return row;
}

export async function setChannelStatus(db: Db, id: string, status: ChannelStatus): Promise<void> {
  await db.query('UPDATE channels SET status = $2, updated_at = now() WHERE id = $1', [id, status]);
}

/** Create or update the channel for a freshly authorized account, storing its tokens encrypted. */
export async function upsertChannel(db: Db, secrets: SecretStore, brandId: string, platform: Platform, tokens: TokenSet): Promise<Channel> {
  const a = tokens.account;
  const tokenRef = `channel:${platform}:${brandId}:${a.platformAccountId}`;
  await secrets.put<StoredTokens>(tokenRef, { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt });
  const [existing] = await db.query<{ id: string }>(
    'SELECT id FROM channels WHERE brand_id = $1 AND platform = $2 AND platform_account_id = $3',
    [brandId, platform, a.platformAccountId],
  );
  const [row] = await db.query<ChannelRow>(
    `INSERT INTO channels (id, brand_id, platform, platform_account_id, handle, display_name, avatar_url, token_ref, scopes, status, token_expires_at, app_scoped_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'connected', $10, $11)
     ON CONFLICT (brand_id, platform, platform_account_id) DO UPDATE SET
       handle = EXCLUDED.handle, display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url,
       token_ref = EXCLUDED.token_ref, scopes = EXCLUDED.scopes, status = 'connected',
       token_expires_at = EXCLUDED.token_expires_at, app_scoped_id = COALESCE(EXCLUDED.app_scoped_id, channels.app_scoped_id), updated_at = now()
     RETURNING *`,
    [
      existing?.id ?? newId('channel'), brandId, platform, a.platformAccountId, a.handle, a.displayName ?? null, a.avatarUrl ?? null,
      tokenRef, JSON.stringify(tokens.scopes), tokens.expiresAt ?? null, a.appScopedId ?? null,
    ],
  );
  return toChannel(row!);
}

/**
 * Forget a channel: the row (its posts, metrics, replies, approvals and import scans go with it), its stored tokens,
 * and a person's picture if it came from this account.
 */
export async function deleteChannel(db: Db, secrets: SecretStore, row: ChannelRow): Promise<void> {
  await db.query('DELETE FROM channels WHERE id = $1', [row.id]);
  await secrets.delete(row.token_ref);
  await releasePersonAvatar(db, row.brand_id, row.avatar_url);
}

/**
 * Everything a provider call needs for this channel, refreshing the token first when it's close to expiring.
 * A channel whose token can't be refreshed is marked refresh_needed and RefreshNeeded is thrown: nothing is sent.
 */
export async function providerContext(
  db: Db,
  secrets: SecretStore,
  provider: PlatformProvider,
  row: ChannelRow,
  opts: { forceRefresh?: boolean; settings?: Record<string, unknown> } = {},
): Promise<ProviderContext> {
  const channel = toChannel(row);
  if (channel.status === 'disconnected') throw new HarborError('INVALID_REQUEST', `Channel @${channel.account.handle} is disconnected. Reconnect it.`);
  let tokens = await secrets.get<StoredTokens>(row.token_ref);
  if (!tokens) {
    await setChannelStatus(db, row.id, 'refresh_needed');
    throw new RefreshNeeded(channel.platform, `No stored token for @${channel.account.handle}. Reconnect the channel.`);
  }
  const expiringSoon = tokens.expiresAt !== undefined && Date.parse(tokens.expiresAt) - Date.now() < REFRESH_MARGIN_MS;
  if (opts.forceRefresh || expiringSoon) {
    if (!tokens.refreshToken) {
      await setChannelStatus(db, row.id, 'refresh_needed');
      throw new RefreshNeeded(channel.platform, `The ${provider.name} token for @${channel.account.handle} has expired. Reconnect the channel.`);
    }
    try {
      const fresh = await provider.refreshToken(tokens.refreshToken);
      tokens = { accessToken: fresh.accessToken, refreshToken: fresh.refreshToken ?? tokens.refreshToken, expiresAt: fresh.expiresAt };
      await secrets.put(row.token_ref, tokens);
      await db.query("UPDATE channels SET token_expires_at = $2, status = 'connected', updated_at = now() WHERE id = $1", [row.id, tokens.expiresAt ?? null]);
    } catch (err) {
      await setChannelStatus(db, row.id, 'refresh_needed');
      throw err instanceof RefreshNeeded ? err : new RefreshNeeded(channel.platform, `Couldn't refresh the ${provider.name} token. Reconnect the channel.`, { cause: err });
    }
  }
  return { accessToken: tokens.accessToken, account: channel.account, settings: opts.settings };
}
