import React, { useState } from "react";

import { T, useT } from "./i18n";

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const t = useT();

  return (
    <div className="codeblock">
      <button
        type="button"
        className="copy"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? t("Copied", "已复制") : t("Copy", "复制")}
      </button>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function Section({
  id,
  titleEn,
  titleZh,
  subEn,
  subZh,
  children,
}: {
  id: string;
  titleEn: string;
  titleZh: string;
  subEn?: string;
  subZh?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id}>
      <h2>
        <T en={titleEn} zh={titleZh} />
      </h2>
      {subEn ? (
        <p className="section-sub">
          <T en={subEn} zh={subZh ?? subEn} />
        </p>
      ) : null}
      {children}
    </section>
  );
}

export interface ApiRow {
  name: string;
  type?: string;
  en: string;
  zh: string;
}

export function ApiTable({ rows }: { rows: ApiRow[] }) {
  return (
    <table className="api-table">
      <thead>
        <tr>
          <th>API</th>
          <th>
            <T en="Description" zh="说明" />
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td>
              <code>{row.name}</code>
            </td>
            <td>
              <T en={row.en} zh={row.zh} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
