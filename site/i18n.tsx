import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Lang = "en" | "zh";

const LangContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
}>({ lang: "en", setLang: () => undefined });

const STORAGE_KEY = "sogna-site-lang";

function detectLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh") return stored;

  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

/** Inline bilingual text: <T en="Hello" zh="你好" /> */
export function T({ en, zh }: { en: React.ReactNode; zh: React.ReactNode }) {
  const { lang } = useLang();

  return <>{lang === "zh" ? zh : en}</>;
}

/** String-valued bilingual lookup for attributes/labels. */
export function useT() {
  const { lang } = useLang();

  return useCallback(
    (en: string, zh: string) => (lang === "zh" ? zh : en),
    [lang],
  );
}
