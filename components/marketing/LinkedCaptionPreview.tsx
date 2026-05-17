import { shortenDisplayedLink, tokenizeCaptionLinks } from "@/lib/marketing/links";

type LinkedCaptionPreviewProps = {
  text: string;
  className?: string;
  linkClassName?: string;
};

export default function LinkedCaptionPreview({
  text,
  className,
  linkClassName = "font-black text-rose-200 underline decoration-rose-200/40 underline-offset-4 hover:text-rose-100",
}: LinkedCaptionPreviewProps) {
  return (
    <p className={className}>
      {tokenizeCaptionLinks(text).map((token, index) => {
        if (token.type === "text") {
          return <span key={`${index}-${token.text}`}>{token.text}</span>;
        }

        return (
          <a
            key={`${index}-${token.href}`}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            title={token.href}
            className={linkClassName}
          >
            {shortenDisplayedLink(token.text)}
          </a>
        );
      })}
    </p>
  );
}
