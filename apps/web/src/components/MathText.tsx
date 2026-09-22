/**
 * 關鍵字說明欄的顯示：純文字 + 行內／獨立的 LaTeX。
 *
 * 安全性（CLAUDE.md 的已定案決策）：說明欄是使用者輸入，KaTeX 一定要設
 * trust: false 與 strict: 'warn'。trust 打開的話 \href 可以塞 javascript:，
 * 而 KaTeX 的輸出是直接 innerHTML 進 DOM 的。
 *
 * KaTeX 的 JS 加 CSS 有好幾百 KB，所以只有在文字真的含有 $ 時才動態載入，
 * 不進主 bundle。
 */

import { useEffect, useState } from 'react';

const MATH_SPLIT = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

type Renderer = (tex: string, displayMode: boolean) => string;

let rendererPromise: Promise<Renderer> | null = null;

async function loadRenderer(): Promise<Renderer> {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      const [{ default: katex }] = await Promise.all([
        import('katex'),
        import('katex/dist/katex.min.css'),
      ]);
      return (tex: string, displayMode: boolean) =>
        katex.renderToString(tex, {
          displayMode,
          throwOnError: false,
          // 使用者輸入，兩個都不能放寬。
          trust: false,
          strict: 'warn',
          output: 'html',
        });
    })();
  }
  return rendererPromise;
}

export function hasMath(text: string): boolean {
  return text.includes('$');
}

export interface MathTextProps {
  text: string;
}

export default function MathText({ text }: MathTextProps) {
  const [renderer, setRenderer] = useState<Renderer | null>(null);
  const [failed, setFailed] = useState(false);
  const needsMath = hasMath(text);

  useEffect(() => {
    if (!needsMath || renderer) return;
    let cancelled = false;
    void loadRenderer().then(
      (fn) => {
        if (!cancelled) setRenderer(() => fn);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [needsMath, renderer]);

  // 沒有公式、還沒載好、或載入失敗，都先原樣顯示文字。
  if (!needsMath || (!renderer && !failed)) {
    return <span className="math-text">{text}</span>;
  }
  if (failed || !renderer) {
    return <span className="math-text">{text}</span>;
  }

  const parts = text.split(MATH_SPLIT).filter((part) => part !== '');

  return (
    <span className="math-text">
      {parts.map((part, index) => {
        const display = part.startsWith('$$') && part.endsWith('$$') && part.length > 4;
        const inline = !display && part.startsWith('$') && part.endsWith('$') && part.length > 2;
        if (!display && !inline) return <span key={index}>{part}</span>;

        const tex = display ? part.slice(2, -2) : part.slice(1, -1);
        return (
          <span
            key={index}
            // KaTeX 的輸出本來就是 HTML；trust: false 保證裡面不會有連結或腳本。
            dangerouslySetInnerHTML={{ __html: renderer(tex, display) }}
          />
        );
      })}
    </span>
  );
}
