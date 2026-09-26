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
import type * as backup_github from "../backup_github.js";
import type * as botAuth from "../botAuth.js";
import type * as botBootstrap from "../botBootstrap.js";
import type * as botBootstrapAction from "../botBootstrapAction.js";
import type * as botFunc from "../botFunc.js";
import type * as bot_tick from "../bot_tick.js";
import type * as bot_writes from "../bot_writes.js";
import type * as guilds from "../guilds.js";
import type * as haimiya from "../haimiya.js";
import type * as hidden from "../hidden.js";
import type * as http from "../http.js";
import type * as modules from "../modules.js";
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
  backup_github: typeof backup_github;
  botAuth: typeof botAuth;
  botBootstrap: typeof botBootstrap;
  botBootstrapAction: typeof botBootstrapAction;
  botFunc: typeof botFunc;
  bot_tick: typeof bot_tick;
  bot_writes: typeof bot_writes;
  guilds: typeof guilds;
  haimiya: typeof haimiya;
  hidden: typeof hidden;
  http: typeof http;
  modules: typeof modules;
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
