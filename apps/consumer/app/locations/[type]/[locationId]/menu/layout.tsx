import type { ReactNode } from 'react';
import { BackToTopButton } from './MenuInteractions';
import { MenuDomEnhancer } from './MenuDomEnhancer';

export default function MenuLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <MenuDomEnhancer />
      <BackToTopButton />
    </>
  );
}
