import { useState } from 'react';

interface MarketThumbnailProps {
  src: string | null;
  alt: string;
  sizeClass?: string;
}

export function MarketThumbnail({ src, alt, sizeClass = 'w-11 h-11' }: MarketThumbnailProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        aria-hidden="true"
        className={`${sizeClass} shrink-0 border border-rule bg-paper flex items-center justify-center font-serif font-semibold text-sm text-ink-soft`}
      >
        P
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} shrink-0 border border-rule bg-paper object-cover`}
    />
  );
}
