import type { ItemLocation, ScrollBehavior } from "../types";

/**
 * Pending scroll-position repair, split into three independent channels so
 * that concurrent intents cannot clobber each other (the previous single-slot
 * design let an item measurement overwrite a prepend anchor with a
 * jump-to-bottom):
 *
 * - `anchor`: keep a specific item where it currently is on screen. Captured
 *   by identity plus its scroller offset at capture time; the delta is
 *   computed at flush time from post-measurement geometry. First capture wins
 *   until consumed — repeated prepends before a flush keep anchoring to the
 *   original reference item.
 * - `scrollTo`: an explicit target (initialLocation, replace, autoscroll).
 *   Last request wins.
 * - `followBottom`: a sticky "stay at the bottom" flag armed by growth while
 *   the user is at the bottom. A flag, not an action — it never overwrites an
 *   anchor.
 *
 * Consume priority: scrollTo > anchor > followBottom. Consuming resolves one
 * intent and clears all channels (an explicit target makes compensation moot;
 * an anchor repair already keeps the viewport stable).
 */

export interface PendingAnchor {
  identityKey: unknown;
  /** Scroller-coordinate offset of the item's top at capture time. */
  prevOffset: number;
}

export interface PendingScrollTo {
  location: ItemLocation;
}

export type PendingResolution =
  | { kind: "scroll-to"; location: ItemLocation }
  | { kind: "anchor"; identityKey: unknown; prevOffset: number }
  | { kind: "follow-bottom"; behavior: ScrollBehavior };

export interface PendingScrollController {
  captureAnchor(identityKey: unknown, prevOffset: number): void;
  requestScrollTo(location: ItemLocation): void;
  armFollowBottom(behavior?: ScrollBehavior): void;
  hasPending(): boolean;
  /** Highest-priority pending intent without consuming it. */
  peek(): PendingResolution | null;
  /** Resolve the highest-priority intent and clear all channels. */
  consume(): PendingResolution | null;
  clear(): void;
}

export function createPendingScroll(): PendingScrollController {
  let anchor: PendingAnchor | null = null;
  let scrollTo: PendingScrollTo | null = null;
  let followBottom: ScrollBehavior | null = null;

  const peek = (): PendingResolution | null => {
    if (scrollTo) return { kind: "scroll-to", location: scrollTo.location };
    if (anchor) {
      return {
        kind: "anchor",
        identityKey: anchor.identityKey,
        prevOffset: anchor.prevOffset,
      };
    }
    if (followBottom !== null) {
      return { kind: "follow-bottom", behavior: followBottom };
    }

    return null;
  };

  return {
    captureAnchor(identityKey, prevOffset) {
      // First capture wins: later captures within the same flush cycle would
      // re-anchor to already-shifted geometry.
      if (anchor) return;

      anchor = { identityKey, prevOffset };
    },
    requestScrollTo(location) {
      scrollTo = { location };
    },
    armFollowBottom(behavior = "auto") {
      followBottom = behavior;
    },
    hasPending() {
      return scrollTo !== null || anchor !== null || followBottom !== null;
    },
    peek,
    consume() {
      const resolution = peek();
      anchor = null;
      scrollTo = null;
      followBottom = null;

      return resolution;
    },
    clear() {
      anchor = null;
      scrollTo = null;
      followBottom = null;
    },
  };
}
