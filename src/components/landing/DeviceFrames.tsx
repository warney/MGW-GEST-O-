import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface DesktopFrameProps {
  src: string;
  alt: string;
  urlLabel: string;
  priority?: boolean;
  className?: string;
}

export function DesktopFrame({
  src,
  alt,
  urlLabel,
  priority = false,
  className = '',
}: DesktopFrameProps) {
  const [failed, setFailed] = useState(false);

  return (
    <figure
      className={`rounded-2xl overflow-hidden border border-[#E5E7EB] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.10)] ${className}`}
    >
      <div className="h-9 px-3.5 bg-[#F9FAFB] border-b border-[#E5E7EB] flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-[#D1D5DB]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#D1D5DB]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#D1D5DB]" />
        </div>
        <span className="text-[11px] font-mono text-[#6B7280] truncate">
          {urlLabel}
        </span>
        <span className="w-8 shrink-0" aria-hidden="true" />
      </div>

      <div className="bg-[#F6F7F9] relative aspect-[16/10] w-full overflow-hidden">
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-xs text-[#6B7280]">
            <Monitor className="w-6 h-6 text-[#F5B731]" />
            <span>{alt}</span>
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="w-full h-full object-cover object-top block"
          />
        )}
      </div>
    </figure>
  );
}

interface PhoneFrameProps {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}

export function PhoneFrame({
  src,
  alt,
  priority = false,
  className = '',
}: PhoneFrameProps) {
  const [failed, setFailed] = useState(false);

  return (
    <figure
      className={`rounded-[28px] overflow-hidden border-2 border-[#D1D5DB] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)] ${className}`}
    >
      <div className="h-5 bg-[#F9FAFB] border-b border-[#E5E7EB] flex items-center justify-center" aria-hidden="true">
        <span className="w-12 h-1 rounded-full bg-[#D1D5DB]" />
      </div>

      <div className="bg-[#F6F7F9] relative aspect-[390/844] w-full overflow-hidden">
        {failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-[#6B7280]">
            <Smartphone className="w-6 h-6 text-[#F5B731]" />
            <span>{alt}</span>
          </div>
        ) : (
          <img
            src={src}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="w-full h-full object-cover object-top block"
          />
        )}
      </div>
    </figure>
  );
}
