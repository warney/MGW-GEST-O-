import { useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface DesktopFrameProps {
  src: string;
  alt: string;
  urlLabel: string;
  priority?: boolean;
  className?: string;
  variant?: 'light' | 'dark';
  cropTopPercent?: number;
}

export function DesktopFrame({
  src,
  alt,
  urlLabel,
  priority = false,
  className = '',
  variant = 'light',
  cropTopPercent = 0,
}: DesktopFrameProps) {
  const [failed, setFailed] = useState(false);
  const isDark = variant === 'dark';

  return (
    <figure
      className={`rounded-2xl overflow-hidden border ${
        isDark
          ? 'border-white/12 bg-[#11151D] shadow-[0_24px_60px_rgba(0,0,0,0.45)]'
          : 'border-[#E5E7EB] bg-white shadow-[0_16px_42px_rgba(15,23,42,0.09)]'
      } ${className}`}
    >
      <div
        className={`h-9 px-3.5 border-b flex items-center justify-between gap-3 ${
          isDark
            ? 'bg-[#171C26] border-white/10'
            : 'bg-[#F9FAFB] border-[#E5E7EB]'
        }`}
      >
        <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isDark ? 'bg-white/20' : 'bg-[#D1D5DB]'
            }`}
          />
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isDark ? 'bg-white/20' : 'bg-[#D1D5DB]'
            }`}
          />
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isDark ? 'bg-white/20' : 'bg-[#D1D5DB]'
            }`}
          />
        </div>
        <span
          className={`text-[11px] font-mono truncate ${
            isDark ? 'text-slate-400' : 'text-[#6B7280]'
          }`}
        >
          {urlLabel}
        </span>
        <span className="w-8 shrink-0" aria-hidden="true" />
      </div>

      <div
        className={`relative aspect-[16/10] w-full overflow-hidden ${
          isDark ? 'bg-[#0F131A]' : 'bg-[#F6F7F9]'
        }`}
      >
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
            style={
              cropTopPercent > 0
                ? {
                    height: `${100 + cropTopPercent}%`,
                    transform: `translateY(-${
                      (cropTopPercent / (100 + cropTopPercent)) * 100
                    }%)`,
                  }
                : undefined
            }
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
  variant?: 'light' | 'dark';
  cropTopPercent?: number;
  cropBottomPercent?: number;
  aspectClassName?: string;
}

export function PhoneFrame({
  src,
  alt,
  priority = false,
  className = '',
  variant = 'light',
  cropTopPercent = 4.6,
  cropBottomPercent = 2.2,
  aspectClassName = 'aspect-[9/18.2]',
}: PhoneFrameProps) {
  const [failed, setFailed] = useState(false);
  const isDark = variant === 'dark';

  const totalExtra = cropTopPercent + cropBottomPercent;
  const imgHeightPercent = 100 + totalExtra;
  const shiftTopPercent =
    totalExtra > 0 ? (cropTopPercent / imgHeightPercent) * 100 : 0;

  return (
    <figure
      className={`rounded-[30px] p-1.5 border transition-colors ${
        isDark
          ? 'border-white/15 bg-[#121722] shadow-[0_28px_70px_rgba(0,0,0,0.55)]'
          : 'border-[#DCE1EA] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]'
      } ${className}`}
    >
      <div
        className={`rounded-[24px] overflow-hidden border ${
          isDark
            ? 'border-white/10 bg-[#0B0E14]'
            : 'border-[#E8ECF2] bg-[#F6F7F9]'
        }`}
      >
        <div
          className={`h-5 flex items-center justify-center border-b ${
            isDark
              ? 'bg-[#11151E] border-white/5'
              : 'bg-[#F8FAFC] border-[#ECEFF4]'
          }`}
          aria-hidden="true"
        >
          <span
            className={`w-12 h-1 rounded-full ${
              isDark ? 'bg-white/20' : 'bg-[#CBD5E1]'
            }`}
          />
        </div>

        <div
          className={`relative ${aspectClassName} w-full overflow-hidden ${
            isDark ? 'bg-[#0B0E14]' : 'bg-[#F6F7F9]'
          }`}
        >
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
              style={{
                height: `${imgHeightPercent}%`,
                transform: `translateY(-${shiftTopPercent}%)`,
              }}
              className="w-full object-cover object-top block select-none"
            />
          )}
        </div>
      </div>
    </figure>
  );
}
