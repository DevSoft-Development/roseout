'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

type SelectedItem = {
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  imageAlt: string;
  badges: string[];
};

function readItem(article: HTMLElement): SelectedItem {
  const name = article.querySelector('h3')?.textContent?.trim() || 'Menu item';
  const price = article.querySelector('.tabular-nums')?.textContent?.trim() || '';
  const image = article.querySelector('img') as HTMLImageElement | null;
  const paragraphs = Array.from(article.querySelectorAll('p'));
  const description =
    paragraphs
      .map((node) => node.textContent?.trim() || '')
      .find((text) => text && text !== price) || '';
  const badges = Array.from(article.querySelectorAll('span'))
    .map((node) => node.textContent?.trim() || '')
    .filter(Boolean);

  return {
    name,
    description,
    price,
    imageUrl: image?.currentSrc || image?.src || '',
    imageAlt: image?.alt || name,
    badges: Array.from(new Set(badges)),
  };
}

function decorateMenuItems() {
  document.querySelectorAll<HTMLElement>('main article.group').forEach((article) => {
    if (article.dataset.menuClickable === 'true') return;
    article.dataset.menuClickable = 'true';
    article.setAttribute('role', 'button');
    article.setAttribute('tabindex', '0');
    article.setAttribute(
      'aria-label',
      `View details for ${article.querySelector('h3')?.textContent?.trim() || 'menu item'}`,
    );
    article.style.cursor = 'pointer';
  });
}

function menuArticleFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('main article.group[data-menu-clickable="true"]');
}

export function MenuDomEnhancer() {
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  useEffect(() => {
    decorateMenuItems();

    const observer = new MutationObserver(() => decorateMenuItems());
    observer.observe(document.body, { childList: true, subtree: true });

    const onClick = (event: MouseEvent) => {
      const article = menuArticleFromTarget(event.target);
      if (article) setSelected(readItem(article));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const article = menuArticleFromTarget(event.target);
      if (!article || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      setSelected(readItem(article));
    };

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [selected]);

  if (!selected) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setSelected(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${selected.name} details`}
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl"
      >
        <button
          type="button"
          onClick={() => setSelected(null)}
          aria-label="Close item details"
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white/95 text-xl font-bold text-black/65 shadow-sm transition hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1062a]/35"
        >
          ×
        </button>

        {selected.imageUrl ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-black/5 sm:aspect-[2/1]">
            <Image
              src={selected.imageUrl}
              alt={selected.imageAlt}
              fill
              unoptimized
              sizes="(max-width: 640px) 100vw, 672px"
              className="object-cover"
            />
          </div>
        ) : null}

        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between gap-5 pr-10">
            <h2 className="text-2xl font-black tracking-[-0.025em] text-[#17181a] sm:text-3xl">
              {selected.name}
            </h2>
            {selected.price ? (
              <div className="shrink-0 text-lg font-black tabular-nums text-[#17181a] sm:text-xl">
                {selected.price}
              </div>
            ) : null}
          </div>

          {selected.description ? (
            <p className="mt-4 text-[15px] font-medium leading-7 text-black/58 sm:text-base">
              {selected.description}
            </p>
          ) : null}

          {selected.badges.length ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-black/8 bg-[#fafaf8] px-3 py-1.5 text-xs font-bold text-black/50"
                >
                  {badge}
                </span>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#17181a] px-6 text-sm font-black text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1062a]/35 sm:w-auto"
          >
            Back to menu
          </button>
        </div>
      </div>
    </div>
  );
}
