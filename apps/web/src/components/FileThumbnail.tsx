/**
 * 檔案項目的圖片縮圖。只有 image/* 才顯示，其他類型（PDF、docx…）不畫東西，
 * 靠旁邊的檔名／副檔名標籤就夠了。
 *
 * 縮圖跟「下載」按鈕一樣要用 getBlob()：bucket 的存取規則要求登入身分，
 * 不能直接把 storagePath 兜成公開網址塞進 <img src>。
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { fileUrl } from '../lib/items';

export interface FileThumbnailProps {
  storagePath: string;
  contentType: string | null | undefined;
  alt: string;
}

export default function FileThumbnail({ storagePath, contentType, alt }: FileThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const isImage = (contentType ?? '').startsWith('image/');

  useEffect(() => {
    if (!isImage) return undefined;

    let cancelled = false;
    let objectUrl: string | null = null;

    void fileUrl(storagePath).then(
      (url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      },
      () => {
        // 縮圖載入失敗就不顯示，不用另外報錯打斷畫面。
      },
    );

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isImage, storagePath]);

  useEffect(() => {
    if (!expanded) return undefined;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  if (!isImage || !src) return null;

  return (
    <>
      <button
        type="button"
        className="file-thumb-btn"
        onClick={() => setExpanded(true)}
        aria-label={`預覽圖片：${alt}`}
      >
        <img className="file-thumb" src={src} alt={alt} />
      </button>

      {expanded
        ? createPortal(
            <div
              className="lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={alt}
              onClick={() => setExpanded(false)}
            >
              <button
                type="button"
                className="btn btn-small lightbox-close"
                onClick={() => setExpanded(false)}
              >
                ✕ 關閉
              </button>
              <img className="lightbox-img" src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
