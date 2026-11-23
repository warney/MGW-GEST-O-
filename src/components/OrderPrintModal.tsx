import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import {
  buildPrintableOrderDocument,
  getPrintPageCss,
  type PrintableOrderSource,
  type PrintCopyMode,
  type PrintPaperFormat,
} from '../utils/orderPrint';

const PAPER_PREF_KEY = 'mgw_print_paper_format';

interface OrderPrintModalProps {
  order: PrintableOrderSource | null;
  allowKitchenToggle?: boolean;
  onClose: () => void;
}

const PAPER_OPTIONS: Array<{ id: PrintPaperFormat; label: string }> = [
  { id: '80mm', label: 'Térmica 80mm' },
  { id: '58mm', label: 'Térmica 58mm' },
  { id: 'a4', label: 'Folha A4' },
];

export function OrderPrintModal({
  order,
  allowKitchenToggle = true,
  onClose,
}: OrderPrintModalProps) {
  const [paperFormat, setPaperFormat] = useState<PrintPaperFormat>(() => {
    try {
      const saved = window.localStorage.getItem(PAPER_PREF_KEY);
      if (saved === '58mm' || saved === '80mm' || saved === 'a4') return saved;
    } catch {
      // Ignora erro de storage
    }
    return '80mm';
  });

  const [copyMode, setCopyMode] = useState<PrintCopyMode>('complete');

  useEffect(() => {
    if (!order) return;
    setCopyMode('complete');
  }, [order?.id]);

  useEffect(() => {
    if (!order) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [order, onClose]);

  const doc = useMemo(() => {
    if (!order) return null;
    return buildPrintableOrderDocument(order, copyMode);
  }, [order, copyMode]);

  if (!order || !doc || typeof document === 'undefined') {
    return null;
  }

  function handleSelectPaper(next: PrintPaperFormat) {
    setPaperFormat(next);
    try {
      window.localStorage.setItem(PAPER_PREF_KEY, next);
    } catch {
      // Ignora erro de storage
    }
  }

  function handlePrint() {
    window.print();
  }

  const receiptWidthClass =
    paperFormat === '58mm'
      ? 'max-w-[232px] text-[11px]'
      : paperFormat === 'a4'
        ? 'max-w-[640px] text-xs sm:text-sm'
        : 'max-w-[320px] text-xs';

  return createPortal(
    <div
      id="mgw-print-portal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-print-modal-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <style>{getPrintPageCss(paperFormat)}</style>

      <div
        id="mgw-print-dialog-card"
        className="max-w-2xl w-full max-h-[92vh] bg-[#FFFFFF] border border-[#E5E7EB] rounded-2xl flex flex-col overflow-hidden"
      >
        {/* Top Controls Toolbar (hidden during printing) */}
        <div className="no-print px-4 py-3 sm:px-5 border-b border-[#E5E7EB] flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2
              id="order-print-modal-title"
              className="text-sm font-bold text-[#111827] flex items-center gap-2"
            >
              <Printer className="w-4 h-4 text-[#EAB308] shrink-0" />
              <span className="truncate">
                Imprimir Pedido {doc.orderNumberFormatted}
              </span>
            </h2>
            <p className="text-[11px] text-[#6B7280] mt-0.5">
              Escolha o formato da impressora térmica ou A4 e clique em imprimir.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de impressão"
            className="w-9 h-9 rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:text-[#111827] flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format & Copy Mode Bar (hidden during printing) */}
        <div className="no-print px-4 py-2.5 sm:px-5 bg-[#F9FAFB]/60 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div
            role="group"
            aria-label="Formato do papel da impressora"
            className="flex flex-wrap items-center gap-1.5"
          >
            {PAPER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={paperFormat === opt.id}
                onClick={() => handleSelectPaper(opt.id)}
                className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  paperFormat === opt.id
                    ? 'bg-[#EAB308] text-[#F9FAFB]'
                    : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#4B5563] hover:border-[#374151]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {allowKitchenToggle && (
            <div
              role="group"
              aria-label="Tipo de via para impressão"
              className="flex items-center gap-1.5"
            >
              <button
                type="button"
                aria-pressed={copyMode === 'complete'}
                onClick={() => setCopyMode('complete')}
                className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  copyMode === 'complete'
                    ? 'bg-[#EAB308]/20 border border-[#EAB308] text-[#EAB308]'
                    : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280]'
                }`}
              >
                Via Completa
              </button>
              <button
                type="button"
                aria-pressed={copyMode === 'kitchen'}
                onClick={() => setCopyMode('kitchen')}
                className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  copyMode === 'kitchen'
                    ? 'bg-[#EAB308]/20 border border-[#EAB308] text-[#EAB308]'
                    : 'bg-[#FFFFFF] border border-[#E5E7EB] text-[#6B7280]'
                }`}
              >
                Via Cozinha
              </button>
            </div>
          )}
        </div>

        {/* Receipt Paper Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#F9FAFB]/90 flex justify-center items-start">
          <article
            id="mgw-printable-receipt"
            data-testid="printable-receipt"
            data-paper-format={paperFormat}
            data-copy-mode={copyMode}
            className={`w-full ${receiptWidthClass} bg-white text-black font-mono rounded-lg border border-[#4B5563] shadow-xl p-4 sm:p-5 space-y-3 leading-snug`}
          >
            {/* Header */}
            <header className="text-center border-b border-dashed border-black pb-2.5 space-y-0.5">
              <p className="font-bold text-sm sm:text-base uppercase tracking-wide">
                {doc.storeName}
              </p>
              {doc.storeAddress && (
                <p className="text-[11px]">{doc.storeAddress}</p>
              )}
              {doc.storePhone && (
                <p className="text-[11px]">WhatsApp: {doc.storePhone}</p>
              )}
              <p className="text-[11px] font-bold pt-1 uppercase">
                {doc.modeLabel}
              </p>
            </header>

            {/* Order Identity & Fulfillment */}
            <section className="border-b border-dashed border-black pb-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2 font-bold text-sm">
                <span>PEDIDO {doc.orderNumberFormatted}</span>
                <span className="uppercase text-[11px] border border-black px-1.5 py-0.5">
                  {doc.fulfillmentLabel}
                </span>
              </div>
              <p className="text-[11px]">Data/Hora: {doc.createdAtFormatted}</p>
              <p className="text-[11px]">Status: {doc.statusLabel}</p>
            </section>

            {/* Customer & Delivery Info */}
            {(doc.customerName ||
              doc.customerPhone ||
              doc.deliveryAddress) && (
              <section className="border-b border-dashed border-black pb-2.5 space-y-1">
                {doc.customerName && (
                  <p>
                    <span className="font-bold">Cliente:</span>{' '}
                    {doc.customerName}
                  </p>
                )}
                {doc.customerPhone && (
                  <p>
                    <span className="font-bold">Telefone:</span>{' '}
                    {doc.customerPhone}
                  </p>
                )}
                {doc.isDelivery && doc.deliveryAddress && (
                  <p>
                    <span className="font-bold">Endereço:</span>{' '}
                    {doc.deliveryAddress}
                  </p>
                )}
                {doc.isDelivery && doc.deliveryReference && (
                  <p>
                    <span className="font-bold">Referência:</span>{' '}
                    {doc.deliveryReference}
                  </p>
                )}
              </section>
            )}

            {/* Items */}
            <section className="border-b border-dashed border-black pb-2.5 space-y-2">
              <p className="font-bold uppercase text-[11px] tracking-wider">
                Itens do Pedido
              </p>
              <div className="space-y-1.5">
                {doc.lines.map((line) => (
                  <div key={line.id} className="space-y-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold">
                        {line.quantity}x {line.name}
                      </span>
                      {doc.showPrices && (
                        <span className="shrink-0 tabular-nums font-bold">
                          {line.lineTotalFormatted}
                        </span>
                      )}
                    </div>
                    {line.note && (
                      <p className="pl-2 font-bold uppercase text-[11px]">
                        OBS: {line.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {doc.customerNote && (
                <div className="pt-1.5 border-t border-dotted border-black">
                  <p className="font-bold uppercase text-[11px]">
                    OBS GERAL: {doc.customerNote}
                  </p>
                </div>
              )}
            </section>

            {/* Totals & Payment (hidden in Kitchen mode) */}
            {doc.showPrices && (
              <section className="border-b border-dashed border-black pb-2.5 space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{doc.subtotalFormatted}</span>
                </div>
                {doc.isDelivery && (
                  <div className="flex justify-between">
                    <span>Taxa de entrega</span>
                    <span className="tabular-nums">
                      {doc.deliveryFeeFormatted}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1 border-t border-dotted border-black">
                  <span>TOTAL</span>
                  <span className="tabular-nums">{doc.totalFormatted}</span>
                </div>

                <div className="pt-1.5 space-y-0.5">
                  <p>
                    <span className="font-bold">Pagamento:</span>{' '}
                    {doc.paymentMethod}
                  </p>
                  {doc.changeForFormatted && (
                    <>
                      <p>
                        <span className="font-bold">Troco para:</span>{' '}
                        {doc.changeForFormatted}
                      </p>
                      {doc.changeReturnFormatted && (
                        <p>
                          <span className="font-bold">Troco a devolver:</span>{' '}
                          {doc.changeReturnFormatted}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </section>
            )}

            {/* Footer */}
            <footer className="text-center text-[10px] pt-0.5 space-y-0.5">
              <p>Documento sem valor fiscal</p>
              <p>MGW GESTÃO</p>
            </footer>
          </article>
        </div>

        {/* Bottom Print Actions (hidden during printing) */}
        <div className="no-print px-4 py-3 sm:px-5 border-t border-[#E5E7EB] flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl border border-[#E5E7EB] text-xs font-semibold text-[#4B5563] hover:text-[#111827] cursor-pointer"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="min-h-[42px] px-5 rounded-xl bg-[#EAB308] hover:bg-[#F5C842] text-[#F9FAFB] text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            Imprimir agora
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
