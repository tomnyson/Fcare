'use client';

import { useEffect } from 'react';
import { REVEAL_ATTR, revealCutoff, shouldDeferReveal } from '../../lib/reveal';

const ROOT_MARGIN = '0px 0px -10% 0px';

function show(element: Element) {
  element.setAttribute(REVEAL_ATTR, 'shown');
}

/**
 * Gắn MỘT IntersectionObserver cho mọi `[data-reveal]` trên trang. Tăng cường
 * dần: HTML server luôn hiện đủ nội dung — chỉ sau khi JS chạy mới ẩn phần chưa
 * cuộn tới, nên JS lỗi hay tắt thì trang vẫn đọc được. Không render gì.
 */
export function ScrollReveal() {
  useEffect(() => {
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const deferred = [...document.querySelectorAll(`[${REVEAL_ATTR}]`)].filter((element) =>
      shouldDeferReveal(element.getBoundingClientRect().top, window.innerHeight),
    );
    let cutoff = -1;

    const observer = new IntersectionObserver(
      (entries) => {
        const hits = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => deferred.indexOf(entry.target));
        const next = revealCutoff(cutoff, hits);
        for (let index = cutoff + 1; index <= next; index += 1) {
          const element = deferred[index];
          if (!element) continue;
          show(element);
          observer.unobserve(element);
        }
        cutoff = next;
      },
      { rootMargin: ROOT_MARGIN },
    );

    for (const element of deferred) {
      element.setAttribute(REVEAL_ATTR, 'pending');
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      // Rời trang giữa chừng → không để phần tử nào kẹt ở trạng thái ẩn.
      deferred.forEach(show);
    };
  }, []);

  return null;
}
