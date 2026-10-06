/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as altDetection from "../altDetection.js";
import type * as antinuke from "../antinuke.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as autoreplies from "../autoreplies.js";
import type * as backup from "../backup.js";
import type * as backupChunks from "../backupChunks.js";
import type * as backupKeys from "../backupKeys.js";
import type * as backup_github from "../backup_github.js";
import type * as botAuth from "../botAuth.js";
import type * as botBootstrap from "../botBootstrap.js";
import type * as botBootstrapAction from "../botBootstrapAction.js";
import type * as botFunc from "../botFunc.js";
import type * as bot_tick from "../bot_tick.js";
import type * as bot_writes from "../bot_writes.js";
import type * as bot_writes_antinuke from "../bot_writes/antinuke.js";
import type * as bot_writes_autoReplies from "../bot_writes/autoReplies.js";
import type * as bot_writes_backup from "../bot_writes/backup.js";
import type * as bot_writes_language from "../bot_writes/language.js";
import type * as bot_writes_metrics from "../bot_writes/metrics.js";
import type * as bot_writes_modActions from "../bot_writes/modActions.js";
import type * as bot_writes_restore from "../bot_writes/restore.js";
import type * as bot_writes_settings from "../bot_writes/settings.js";
import type * as bot_writes_shared from "../bot_writes/shared.js";
import type * as bot_writes_tickets from "../bot_writes/tickets.js";
import type * as channelLocks from "../channelLocks.js";
import type * as crons from "../crons.js";
import type * as geoGuard from "../geoGuard.js";
import type * as guildConfig from "../guildConfig.js";
import type * as guildStats from "../guildStats.js";
import type * as guilds from "../guilds.js";
import type * as guilds_botGuilds from "../guilds/botGuilds.js";
import type * as guilds_configPortability from "../guilds/configPortability.js";
import type * as guilds_greetingImages from "../guilds/greetingImages.js";
import type * as guilds_updateSettings from "../guilds/updateSettings.js";
import type * as haimiya from "../haimiya.js";
import type * as hidden from "../hidden.js";
import type * as http from "../http.js";
import type * as incidents from "../incidents.js";
import type * as modules from "../modules.js";
import type * as payments from "../payments.js";
import type * as paymentsAction from "../paymentsAction.js";
import type * as presets from "../presets.js";
import type * as public_ from "../public.js";
import type * as rateGuard from "../rateGuard.js";
import type * as relay from "../relay.js";
import type * as reports from "../reports.js";
import type * as selfDiagnose from "../selfDiagnose.js";
import type * as sessionAuth from "../sessionAuth.js";
import type * as sessionHardening from "../sessionHardening.js";
import type * as sessions from "../sessions.js";
import type * as sha256 from "../sha256.js";
import type * as status from "../status.js";
import type * as threatIntel from "../threatIntel.js";
import type * as ticketKinds from "../ticketKinds.js";
import type * as tickets from "../tickets.js";
import type * as webhooks from "../webhooks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  altDetection: typeof altDetection;
  antinuke: typeof antinuke;
  audit: typeof audit;
  auth: typeof auth;
  autoreplies: typeof autoreplies;
  backup: typeof backup;
  backupChunks: typeof backupChunks;
  backupKeys: typeof backupKeys;
  backup_github: typeof backup_github;
  botAuth: typeof botAuth;
  botBootstrap: typeof botBootstrap;
  botBootstrapAction: typeof botBootstrapAction;
  botFunc: typeof botFunc;
  bot_tick: typeof bot_tick;
  bot_writes: typeof bot_writes;
  "bot_writes/antinuke": typeof bot_writes_antinuke;
  "bot_writes/autoReplies": typeof bot_writes_autoReplies;
  "bot_writes/backup": typeof bot_writes_backup;
  "bot_writes/language": typeof bot_writes_language;
  "bot_writes/metrics": typeof bot_writes_metrics;
  "bot_writes/modActions": typeof bot_writes_modActions;
  "bot_writes/restore": typeof bot_writes_restore;
  "bot_writes/settings": typeof bot_writes_settings;
  "bot_writes/shared": typeof bot_writes_shared;
  "bot_writes/tickets": typeof bot_writes_tickets;
  channelLocks: typeof channelLocks;
  crons: typeof crons;
  geoGuard: typeof geoGuard;
  guildConfig: typeof guildConfig;
  guildStats: typeof guildStats;
  guilds: typeof guilds;
  "guilds/botGuilds": typeof guilds_botGuilds;
  "guilds/configPortability": typeof guilds_configPortability;
  "guilds/greetingImages": typeof guilds_greetingImages;
  "guilds/updateSettings": typeof guilds_updateSettings;
  haimiya: typeof haimiya;
  hidden: typeof hidden;
  http: typeof http;
  incidents: typeof incidents;
  modules: typeof modules;
  payments: typeof payments;
  paymentsAction: typeof paymentsAction;
  presets: typeof presets;
  public: typeof public_;
  rateGuard: typeof rateGuard;
  relay: typeof relay;
  reports: typeof reports;
  selfDiagnose: typeof selfDiagnose;
  sessionAuth: typeof sessionAuth;
  sessionHardening: typeof sessionHardening;
  sessions: typeof sessions;
  sha256: typeof sha256;
  status: typeof status;
  threatIntel: typeof threatIntel;
  ticketKinds: typeof ticketKinds;
  tickets: typeof tickets;
  webhooks: typeof webhooks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
