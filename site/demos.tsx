import React, { useCallback, useRef, useState } from "react";

import { SognaVirtualList } from "../src";
import type { SognaVirtualListMethods } from "../src";
import { T, useT } from "./i18n";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

let idCounter = 0;
const nextId = () => `msg-${idCounter++}`;

const LOREM_EN =
  "Virtual lists keep long conversations fast by rendering only what is visible. " +
  "Scroll position repair keeps the reading experience stable while messages stream in, " +
  "history loads above the viewport, and old items get trimmed away. ";

const LOREM_ZH =
  "虚拟列表只渲染可见部分，让超长会话保持流畅。滚动位置修复让阅读体验稳定：" +
  "消息流式输出、历史在视口上方加载、旧消息被裁剪时，视口都不会跳动。";

function makeMessage(role: Message["role"], text: string): Message {
  return { id: nextId(), role, text };
}

function historyPage(count: number, lorem: string): Message[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage(
      i % 2 === 0 ? "user" : "assistant",
      `${lorem.slice(0, 40 + ((i * 53) % (lorem.length - 40)))}`,
    ),
  );
}

function Bubble({ data }: { data: Message }) {
  return (
    <div className={`bubble-row ${data.role}`}>
      <div className="bubble">{data.text}</div>
    </div>
  );
}

/** Demo 1: streaming chat with history loading, trims, and jump. */
export function StreamingChatDemo() {
  const t = useT();
  const ref = useRef<SognaVirtualListMethods<Message, null>>(null);
  const [streaming, setStreaming] = useState(false);
  const [pages, setPages] = useState(0);
  const streamTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const lorem = t(LOREM_EN, LOREM_ZH);

  const stopStream = useCallback(() => {
    if (streamTimer.current) {
      clearInterval(streamTimer.current);
      streamTimer.current = null;
    }
    setStreaming(false);
  }, []);

  const startStream = useCallback(() => {
    if (streamTimer.current) return;

    const id = nextId();
    const words = (lorem + lorem + lorem).split(/(?<=\s)|(?=[，。：；])/);
    let index = 0;

    ref.current?.data.append(
      [{ id, role: "assistant", text: words[0] ?? "" }],
      "auto",
    );
    setStreaming(true);

    streamTimer.current = setInterval(() => {
      index += 1;

      if (index >= words.length) {
        stopStream();

        return;
      }

      ref.current?.data.map(
        (message) =>
          message.id === id
            ? { ...message, text: `${message.text}${words[index]}` }
            : message,
        "auto",
      );
    }, 35);
  }, [lorem, stopStream]);

  const loadOlder = useCallback(() => {
    setPages((n) => n + 1);
    ref.current?.data.prepend(
      historyPage(15, t(LOREM_EN, LOREM_ZH)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  return (
    <div className="demo-frame">
      <div className="demo-body">
        <SognaVirtualList<Message, null>
          ref={ref}
          messageFlow="bottom-up"
          initialData={[
            makeMessage("user", t("Hey! Show me how the list behaves.", "嘿！演示一下这个列表的行为。")),
            makeMessage(
              "assistant",
              t(
                "Try the buttons below — stream a reply, scroll up to auto-load history, trim the backlog. The viewport never jumps.",
                "试试下面的按钮——流式输出回复、上滑自动加载历史、裁剪旧消息。视口永远不会跳动。",
              ),
            ),
          ]}
          computeItemKey={({ data }) => data.id}
          itemIdentity={(m) => m.id}
          ItemContent={Bubble}
          onStartReached={loadOlder}
          increaseViewportBy={200}
          style={{ height: 420, width: "100%" }}
        />
      </div>
      <div className="demo-toolbar">
        <button
          type="button"
          className="primary"
          onClick={streaming ? stopStream : startStream}
        >
          {streaming ? t("Stop stream", "停止流式") : t("Stream reply", "流式回复")}
        </button>
        <button
          type="button"
          onClick={() =>
            ref.current?.data.append(
              [
                makeMessage(
                  "user",
                  t("Another question about virtual lists?", "再问一个关于虚拟列表的问题？"),
                ),
              ],
              "smooth",
            )
          }
        >
          <T en="Send message" zh="发送消息" />
        </button>
        <button type="button" onClick={() => ref.current?.data.removeFromStart(10)}>
          <T en="Trim oldest 10" zh="裁剪最旧 10 条" />
        </button>
        <button
          type="button"
          onClick={() =>
            ref.current?.scrollToItem({
              index: "LAST",
              align: "end",
              behavior: "smooth",
            })
          }
        >
          <T en="Jump to bottom" zh="跳到底部" />
        </button>
        <span className="status">
          <T
            en={`history pages loaded: ${pages}`}
            zh={`已加载历史页数：${pages}`}
          />
        </span>
      </div>
    </div>
  );
}

/** Demo 2: prepend anchoring — load history while reading mid-list. */
export function PrependDemo() {
  const t = useT();
  const ref = useRef<SognaVirtualListMethods<Message, null>>(null);
  const [loaded, setLoaded] = useState(0);

  return (
    <div className="demo-frame">
      <div className="demo-body">
        <SognaVirtualList<Message, null>
          ref={ref}
          initialData={historyPage(30, t(LOREM_EN, LOREM_ZH))}
          computeItemKey={({ data }) => data.id}
          itemIdentity={(m) => m.id}
          ItemContent={Bubble}
          increaseViewportBy={200}
          style={{ height: 320, width: "100%" }}
        />
      </div>
      <div className="demo-toolbar">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setLoaded((n) => n + 20);
            ref.current?.data.prepend(historyPage(20, t(LOREM_EN, LOREM_ZH)));
          }}
        >
          <T en="Prepend 20 older items" zh="向上插入 20 条历史" />
        </button>
        <span className="status">
          <T
            en={`Scroll anywhere, then prepend — the view stays put. (${loaded} prepended)`}
            zh={`滚到任意位置再插入——视口纹丝不动。（已插入 ${loaded} 条）`}
          />
        </span>
      </div>
    </div>
  );
}

/** Demo 3: scroll API playground. */
export function ScrollApiDemo() {
  const t = useT();
  const ref = useRef<SognaVirtualListMethods<Message, null>>(null);
  const [location, setLocation] = useState("");

  return (
    <div className="demo-frame">
      <div className="demo-body">
        <SognaVirtualList<Message, null>
          ref={ref}
          initialData={Array.from({ length: 200 }, (_, i) =>
            makeMessage(i % 3 === 0 ? "user" : "assistant", `#${i} — ${t(LOREM_EN, LOREM_ZH).slice(0, 40 + ((i * 29) % 90))}`),
          )}
          computeItemKey={({ data }) => data.id}
          itemIdentity={(m) => m.id}
          ItemContent={Bubble}
          onScroll={(loc) =>
            setLocation(
              `first ${loc.firstVisibleItemIndex} · last ${loc.lastVisibleItemIndex}` +
                `${loc.isAtTop ? " · top" : ""}${loc.isAtBottom ? " · bottom" : ""}`,
            )
          }
          style={{ height: 320, width: "100%" }}
        />
      </div>
      <div className="demo-toolbar">
        <button
          type="button"
          onClick={() => ref.current?.scrollToItem({ index: 0, align: "start", behavior: "smooth" })}
        >
          <T en="First" zh="第一条" />
        </button>
        <button
          type="button"
          onClick={() => ref.current?.scrollToItem({ index: 100, align: "center", behavior: "smooth" })}
        >
          <T en="#100 centered" zh="#100 居中" />
        </button>
        <button
          type="button"
          onClick={() => ref.current?.scrollToItem({ index: -1, align: "end", behavior: "smooth" })}
        >
          <T en="Last (index -1)" zh="最后一条（-1）" />
        </button>
        <span className="status">{location}</span>
      </div>
    </div>
  );
}
