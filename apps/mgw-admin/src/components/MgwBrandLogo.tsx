import { useState } from 'react';

export interface MgwBrandLogoProps {
  variant?: 'compact' | 'full' | 'icon';
  className?: string;
}

export const MGW_ADMIN_LOGO_SRC = '/brand/mgw-logo.png';

/**
 * Renderiza o logotipo oficial da MGW Gestão com recorte exato do arquivo PNG
 * transparente (onde as letras brancas exigem contraste em fundo escuro #202733)
 * e fallback tipográfico seguro em caso de indisponibilidade do arquivo.
 */
export function MgwBrandLogo({ variant = 'compact', className = '' }: MgwBrandLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (variant === 'icon') {
    if (imgFailed) {
      return (
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#202733] font-display text-xs font-extrabold tracking-tight text-white shrink-0 ${className}`}
          aria-label="MGW Gestão"
        >
          M<span className="text-[#F5B731]">W</span>
        </span>
      );
    }

    // Recorte quadrado centrado no emblema esquerdo "MGW + arco dourado" (1536x1024)
    const cropW = 790;
    const cropH = 440;
    const widthPct = (1536 / cropW) * 100;
    const heightPct = (1024 / cropH) * 100;
    const leftPct = -(63 / cropW) * 100;
    const topPct = -(220 / cropH) * 100;

    return (
      <span
        className={`relative block overflow-hidden select-none shrink-0 ${className}`}
        style={{ aspectRatio: `${cropW} / ${cropH}` }}
      >
        <img
          src={MGW_ADMIN_LOGO_SRC}
          alt="MGW Gestão"
          loading="eager"
          decoding="sync"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          style={{
            position: 'absolute',
            maxWidth: 'none',
            width: `${widthPct}%`,
            height: `${heightPct}%`,
            left: `${leftPct}%`,
            top: `${topPct}%`,
          }}
          className="pointer-events-none block"
        />
      </span>
    );
  }

  if (imgFailed) {
    return (
      <span className={`font-display font-extrabold tracking-tight text-white whitespace-nowrap ${className}`}>
        MGW <span className="text-[#F5B731]">GESTÃO</span>
      </span>
    );
  }

  // Limites exatos da arte dentro de 1536x1024:
  // Full (com slogan): x=63..1472 (1409px), y=255..682 (427px)
  // Compact (sem slogan): x=63..1472 (1409px), y=255..605 (350px)
  const cropW = 1409;
  const cropH = variant === 'compact' ? 350 : 427;
  const widthPct = (1536 / cropW) * 100;
  const heightPct = (1024 / cropH) * 100;
  const leftPct = -(63 / cropW) * 100;
  const topPct = -(255 / cropH) * 100;

  return (
    <span
      className={`relative block overflow-hidden select-none shrink-0 ${className}`}
      style={{ aspectRatio: `${cropW} / ${cropH}` }}
    >
      <img
        src={MGW_ADMIN_LOGO_SRC}
        alt="MGW Gestão"
        loading="eager"
        decoding="sync"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        style={{
          position: 'absolute',
          maxWidth: 'none',
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          left: `${leftPct}%`,
          top: `${topPct}%`,
        }}
        className="pointer-events-none block"
      />
    </span>
  );
}
