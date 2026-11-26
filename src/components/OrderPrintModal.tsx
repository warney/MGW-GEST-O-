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
  availableFormats?: PrintPaperFormat[];
  initialPaperFormat?: PrintPaperFormat;
  onClose: () => void;
}

const PAPER_OPTIONS: Array<{ id: PrintPaperFormat; label: string }> = [
  { id: '80mm', label: 'Térmica 80mm' },
  { id: '58mm', label: 'Térmica 58mm' },
  { id: 'a4', label: 'Folha A4 / PDF' },
];

function resolveInitialPaperFormat(
  allowed: PrintPaperFormat[],
  preferred?: PrintPaperFormat,
): PrintPaperFormat {
  if (preferred && allowed.includes(preferred)) {
    return preferred;
  }
  try {
    const saved = window.localStorage.getItem(PAPER_PREF_KEY);
    if (
      (saved === '58mm' || saved === '80mm' || saved === 'a4') &&
      allowed.includes(saved)
    ) {
      return saved;
    }
  } catch {
    // Ignora erro de storage
  }
  return allowed[0] ?? '80mm';
}

export function OrderPrintModal({
  order,
  allowKitchenToggle = true,
  availableFormats = ['80mm', '58mm', 'a4'],
  initialPaperFormat,
  onClose,
}: OrderPrintModalProps) {
  const safeFormats = availableFormats.length > 0 ? availableFormats : (['80mm', '58mm'] as PrintPaperFormat[]);
  const [paperFormat, setPaperFormat] = useState<PrintPaperFormat>(() =>
    resolveInitialPaperFormat(safeFormats, initialPaperFormat),
  );

  const [copyMode, setCopyMode] = useState<PrintCopyMode>('complete');

  useEffect(() => {
    if (!order) return;
    setCopyMode('complete');
    setPaperFormat(resolveInitialPaperFormat(safeFormats, initialPaperFormat));
  }, [order?.id, initialPaperFormat]);

  useEffect(() => {
    if (!order || typeof document === 'undefined') return;
    document.body.classList.add('mgw-order-print-open');
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('mgw-order-print-open');
      window.removeEventListener('keydown', onKeyDown);
    };
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
      ? 'max-w-[240px] text-[11px]'
      : paperFormat === 'a4'
        ? 'max-w-[640px] text-xs sm:text-sm'
        : 'max-w-[328px] text-xs';

  return createPortal(
    <div
      id="mgw-print-portal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-print-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 bg-[#172033]/55 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <style>{getPrintPageCss(paperFormat)}</style>

      <div
        id="mgw-print-dialog-card"
        className="max-w-2xl w-full max-h-[94vh] bg-white border border-[#E8EAF0] rounded-t-2xl sm:rounded-2xl shadow-[0_18px_42px_rgba(23,32,51,0.18)] flex flex-col overflow-hidden"
      >
        {/* Top Controls Toolbar (hidden during printing) */}
        <div className="no-print px-4 py-3.5 sm:px-5 border-b border-[#E8EAF0] flex items-start justify-between gap-3 shrink-0 bg-white">
          <div className="min-w-0">
            <h2
              id="order-print-modal-title"
              className="text-sm sm:text-base font-extrabold text-[#172033] flex items-center gap-2"
            >
              <Printer className="w-4 h-4 text-[#B38300] shrink-0" aria-hidden="true" />
              <span className="truncate">
                {doc.documentKind === 'quick_sale'
                  ? `Imprimir Nota da Venda${doc.hasOrderNumber ? ` ${doc.orderNumberFormatted}` : ''}`
                  : `Imprimir Pedido ${doc.orderNumberFormatted}`}
              </span>
            </h2>
            <p className="text-[11px] sm:text-xs text-[#778094] mt-0.5">
              {doc.documentKind === 'quick_sale'
                ? 'Compatível com impressoras térmicas (58mm / 80mm) e impressão pelo navegador.'
                : 'Compatível com impressora térmica (80mm / 58mm), folha A4 ou Salvar como PDF.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de impressão"
            className="w-9 h-9 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] bg-white text-[#778094] hover:text-[#172033] flex items-center justify-center shrink-0 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format & Copy Mode Bar (hidden during printing) */}
        <div className="no-print px-4 py-2.5 sm:px-5 bg-[#F7F8FC] border-b border-[#E8EAF0] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div
            role="group"
            aria-label="Formato do papel da impressora"
            className="flex flex-wrap items-center gap-1.5"
          >
            {PAPER_OPTIONS.filter((opt) => safeFormats.includes(opt.id)).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={paperFormat === opt.id}
                onClick={() => handleSelectPaper(opt.id)}
                className={`min-h-[36px] px-3 rounded-xl text-xs font-bold cursor-pointer transition-colors whitespace-nowrap ${
                  paperFormat === opt.id
                    ? 'bg-[#F5B900] hover:bg-[#FFC928] text-[#172033]'
                    : 'bg-white border border-[#E8EAF0] text-[#4B5563] hover:border-[#D5D9E4] hover:text-[#172033]'
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
              className="flex flex-wrap items-center gap-1.5"
            >
              <button
                type="button"
                aria-pressed={copyMode === 'complete'}
                onClick={() => setCopyMode('complete')}
                className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  copyMode === 'complete'
                    ? 'bg-[#FFFBEB] border border-[#F5B900] text-[#172033]'
                    : 'bg-white border border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                }`}
              >
                Via Completa
              </button>
              <button
                type="button"
                aria-pressed={copyMode === 'kitchen'}
                onClick={() => setCopyMode('kitchen')}
                className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  copyMode === 'kitchen'
                    ? 'bg-[#FFFBEB] border border-[#F5B900] text-[#172033]'
                    : 'bg-white border border-[#E8EAF0] text-[#778094] hover:text-[#172033]'
                }`}
              >
                Via Cozinha
              </button>
            </div>
          )}
        </div>

        {/* Receipt Paper Preview Area */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-[#EFF1F7] flex justify-center items-start">
          <article
            id="mgw-printable-receipt"
            data-testid="printable-receipt"
            data-paper-format={paperFormat}
            data-copy-mode={copyMode}
            className={`w-full ${receiptWidthClass} bg-white text-black font-mono rounded-lg border border-[#D5D9E4] shadow-[0_8px_24px_rgba(23,32,51,0.1)] p-4 sm:p-5 space-y-3 leading-snug`}
          >
            {/* Header */}
            <header className="text-center border-b border-dashed border-black pb-2.5 space-y-0.5 mgw-print-avoid-break">
              <p className="font-bold text-sm sm:text-base uppercase tracking-wide">
                {doc.storeName}
              </p>
              {doc.storeAddress && (
                <p className="text-[11px]">{doc.storeAddress}</p>
              )}
              {doc.storePhone && (
                <p className="text-[11px]">WhatsApp: {doc.storePhone}</p>
              )}
              <p className="text-[11px] font-bold pt-1 uppercase tracking-wider">
                {doc.modeLabel}
              </p>
            </header>

            {/* Order / Sale Identity */}
            <section className="border-b border-dashed border-black pb-2.5 space-y-1 mgw-print-avoid-break">
              {doc.documentKind === 'quick_sale' ? (
                <>
                  <div className="flex items-center justify-between gap-2 font-bold text-sm">
                    <span>
                      {doc.hasOrderNumber
                        ? `PEDIDO ${doc.orderNumberFormatted}`
                        : 'VENDA RÁPIDA'}
                    </span>
                    <span className="uppercase text-[10px] border border-black px-1.5 py-0.5 shrink-0">
                      {doc.paymentMethod}
                    </span>
                  </div>
                  {doc.saleDateFormatted && (
                    <p className="text-[11px] tabular-nums">
                      Data da venda: {doc.saleDateFormatted}
                    </p>
                  )}
                  <p className="text-[11px] tabular-nums">
                    Registro: {doc.createdAtFormatted}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 font-bold text-sm">
                    <span className="tabular-nums">PEDIDO {doc.orderNumberFormatted}</span>
                    <span className="uppercase text-[10px] border border-black px-1.5 py-0.5 shrink-0">
                      {doc.fulfillmentLabel}
                    </span>
                  </div>
                  <p className="text-[11px] tabular-nums">
                    Data/Hora: {doc.createdAtFormatted}
                  </p>
                  <p className="text-[11px]">Status: {doc.statusLabel}</p>
                </>
              )}
            </section>

            {/* Customer & Delivery Info */}
            {(doc.customerName ||
              doc.customerPhone ||
              doc.deliveryAddress ||
              doc.customerAddress ||
              doc.customerNumber ||
              doc.customerNeighborhood ||
              doc.customerComplement) && (
              <section className="border-b border-dashed border-black pb-2.5 space-y-1 mgw-print-avoid-break">
                {doc.customerName && (
                  <p className="break-words">
                    <span className="font-bold">Cliente:</span>{' '}
                    {doc.customerName}
                  </p>
                )}
                {doc.customerPhone && (
                  <p className="tabular-nums">
                    <span className="font-bold">Telefone:</span>{' '}
                    {doc.customerPhone}
                  </p>
                )}
                {doc.isDelivery && doc.deliveryAddress && (
                  <p className="break-words">
                    <span className="font-bold">Endereço:</span>{' '}
                    {doc.deliveryAddress}
                  </p>
                )}
                {doc.isDelivery && doc.deliveryReference && (
                  <p className="break-words">
                    <span className="font-bold">Referência:</span>{' '}
                    {doc.deliveryReference}
                  </p>
                )}
                {doc.documentKind === 'quick_sale' &&
                  (doc.customerAddress || doc.customerNumber) && (
                    <p className="break-words">
                      <span className="font-bold">Endereço:</span>{' '}
                      {[
                        doc.customerAddress,
                        doc.customerNumber ? `nº ${doc.customerNumber}` : '',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}
                {doc.documentKind === 'quick_sale' && doc.customerNeighborhood && (
                  <p className="break-words">
                    <span className="font-bold">Bairro:</span>{' '}
                    {doc.customerNeighborhood}
                  </p>
                )}
                {doc.documentKind === 'quick_sale' && doc.customerComplement && (
                  <p className="break-words">
                    <span className="font-bold">Complemento:</span>{' '}
                    {doc.customerComplement}
                  </p>
                )}
              </section>
            )}

            {/* Items */}
            <section className="border-b border-dashed border-black pb-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                <span>Itens do Pedido</span>
                {doc.showPrices && <span>Total</span>}
              </div>

              <div className="space-y-2">
                {doc.lines.map((line) => (
                  <div
                    key={line.id}
                    className="space-y-0.5 mgw-print-avoid-break"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold break-words">
                        {line.quantity}x {line.name}
                      </span>
                      {doc.showPrices && (
                        <span className="shrink-0 tabular-nums font-bold">
                          {line.lineTotalFormatted}
                        </span>
                      )}
                    </div>

                    {doc.showPrices && (
                      <p className="pl-2 text-[10px] tabular-nums">
                        Valor unitário: {line.unitPriceFormatted}
                      </p>
                    )}

                    {line.addons.length > 0 && (
                      <div className="pl-2 space-y-0.5 text-[10.5px]">
                        {line.addons.map((addon, idx) => (
                          <p key={`${line.id}-addon-${idx}`} className="break-words">
                            + <span className="font-bold">{addon.groupName}:</span>{' '}
                            {addon.optionsSummary}
                          </p>
                        ))}
                      </div>
                    )}

                    {line.note && (
                      <p className="pl-2 font-bold uppercase text-[10.5px] break-words">
                        OBS: {line.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {doc.customerNote && (
                <div className="pt-1.5 border-t border-dotted border-black mgw-print-avoid-break">
                  <p className="font-bold uppercase text-[11px] break-words">
                    OBS GERAL: {doc.customerNote}
                  </p>
                </div>
              )}
            </section>

            {/* Totals & Payment (hidden in Kitchen mode) */}
            {doc.showPrices && (
              <section className="border-b border-dashed border-black pb-2.5 space-y-1 mgw-print-avoid-break">
                <div className="flex justify-between gap-2">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{doc.subtotalFormatted}</span>
                </div>
                {doc.discountFormatted && (
                  <div className="flex justify-between gap-2">
                    <span>Desconto</span>
                    <span className="tabular-nums">− {doc.discountFormatted}</span>
                  </div>
                )}
                {(doc.isDelivery || doc.hasDeliveryFee) && (
                  <div className="flex justify-between gap-2">
                    <span>Taxa de entrega</span>
                    <span className="tabular-nums">
                      {doc.deliveryFeeFormatted}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-2 font-bold text-sm pt-1 border-t border-dotted border-black">
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
                      <p className="tabular-nums">
                        <span className="font-bold">Troco para:</span>{' '}
                        {doc.changeForFormatted}
                      </p>
                      {doc.changeReturnFormatted && (
                        <p className="tabular-nums">
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
            <footer className="text-center text-[10px] pt-0.5 space-y-0.5 mgw-print-avoid-break">
              <p>Documento sem valor fiscal</p>
              <p>MGW GESTÃO</p>
            </footer>
          </article>
        </div>

        {/* Bottom Print Actions (hidden during printing) */}
        <div className="no-print px-4 py-3 sm:px-5 border-t border-[#E8EAF0] bg-white flex flex-wrap items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl border border-[#E8EAF0] hover:border-[#D5D9E4] hover:bg-[#F7F8FC] text-xs font-semibold text-[#4B5563] hover:text-[#172033] cursor-pointer transition-colors"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="min-h-[42px] px-5 rounded-xl bg-[#F5B900] hover:bg-[#FFC928] text-[#172033] text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors shadow-[0_1px_2px_rgba(23,32,51,0.08)]"
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            <span>Imprimir / Salvar PDF</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
