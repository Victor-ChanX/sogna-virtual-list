import React, { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { SognaVirtualList } from "../src";
import type { SognaVirtualListMethods } from "../src";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

const LOREM =
  "Virtual lists keep long conversations fast by rendering only what is visible. " +
  "Scroll position repair keeps the reading experience stable while messages stream in, " +
  "history loads above, and old items get trimmed away. ";

let idCounter = 0;
const nextId = () => `msg-${idCounter++}`;

function makeMessage(role: Message["role"], text: string): Message {
  return { id: nextId(), role, text };
}

function historyPage(count: number): Message[] {
  return Array.from({ length: count }, (_, i) =>
    makeMessage(
      i % 2 === 0 ? "user" : "assistant",
      `(older) ${LOREM.slice(0, 60 + ((i * 37) % 120))}`,
    ),
  );
}

const initialMessages = [
  makeMessage("user", "Hey! Show me how the list behaves."),
  makeMessage(
    "assistant",
    "Sure — try the buttons below. Stream a reply, load older history while reading, or trim the backlog. The viewport should never jump.",
  ),
];

function Bubble({ data }: { data: Message }) {
  const isUser = data.role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        padding: "4px 12px",
      }}
    >
      <div
        style={{
          maxWidth: "72%",
          padding: "10px 14px",
          borderRadius: 16,
          background: isUser ? "#0a84ff" : "#ffffff",
          color: isUser ? "#fff" : "#111",
          boxShadow: "0 1px 1px rgba(0,0,0,0.08)",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontSize: 14,
          lineHeight: 1.45,
        }}
      >
        {data.text}
      </div>
    </div>
  );
}

function App() {
  const ref = useRef<SognaVirtualListMethods<Message, null>>(null);
  const [streaming, setStreaming] = useState(false);
  const streamTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [historyLoads, setHistoryLoads] = useState(0);

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
    const words = (LOREM + LOREM + LOREM).split(" ");
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
            ? { ...message, text: `${message.text} ${words[index]}` }
            : message,
        "auto",
      );
    }, 40);
  }, [stopStream]);

  const loadOlder = useCallback(() => {
    setHistoryLoads((n) => n + 1);
    ref.current?.data.prepend(historyPage(20));
  }, []);

  const askQuestion = useCallback(() => {
    ref.current?.data.append(
      [makeMessage("user", "Another question about virtual lists?")],
      "smooth",
    );
  }, []);

  const trim = useCallback(() => {
    ref.current?.data.removeFromStart(10);
  }, []);

  const jumpToBottom = useCallback(() => {
    ref.current?.scrollToItem({ index: "LAST", align: "end", behavior: "smooth" });
  }, []);

  return (
    <div>
      <h2 style={{ margin: "8px 0" }}>sogna-virtual-list demo</h2>
      <p style={{ margin: "0 0 12px", color: "#555", fontSize: 13 }}>
        Scroll up while streaming — your reading position is preserved. Reach
        the top to auto-load history ({historyLoads} pages loaded).
      </p>

      <SognaVirtualList<Message, null>
        ref={ref}
        messageFlow="bottom-up"
        initialData={initialMessages}
        computeItemKey={({ data }) => data.id}
        itemIdentity={(m) => m.id}
        ItemContent={Bubble}
        onStartReached={loadOlder}
        increaseViewportBy={200}
        style={{
          height: 480,
          width: "100%",
          background: "#e9e9ee",
          borderRadius: 12,
        }}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={streaming ? stopStream : startStream}>
          {streaming ? "Stop stream" : "Stream reply"}
        </button>
        <button onClick={askQuestion}>Send message</button>
        <button onClick={trim}>Trim oldest 10</button>
        <button onClick={jumpToBottom}>Jump to bottom</button>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
