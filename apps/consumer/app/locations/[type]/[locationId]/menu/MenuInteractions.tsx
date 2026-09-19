'use client';

import { useEffect, useState } from 'react';

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Back to top"
      className="fixed bottom-5 right-4 z-50 inline-flex min-h-11 items-center gap-2 rounded-full border border-black/10 bg-[#17181a] px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_30px_rgba(0,0,0,.22)] transition hover:-translate-y-0.5 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1062a]/40 sm:bottom-7 sm:right-7"
    >
      <span aria-hidden="true">↑</span>
      <span>Top</span>
    </button>
  );
}
