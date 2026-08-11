import type { ReactNode } from "react";

export default function ReserveLocationLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <style>{`
        @media (min-width: 640px) {
          main section:first-of-type > div:nth-child(2) {
            display: inline-block;
            width: fit-content;
            max-width: calc(100% - 3rem);
            margin-left: 1.5rem;
            margin-right: 1.5rem;
            border-top-width: 0;
          }
        }
      `}</style>
    </>
  );
}
