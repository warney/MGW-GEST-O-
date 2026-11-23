import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  deleteTenantMenuImage,
  uploadTenantMenuImage,
} from '../services/storageService';
import {
  IMAGE_UPLOAD_PRESETS,
  type ImageUploadPreset,
  type TenantImageFolder,
} from '../utils/imageUpload';

interface ImageUploadFieldProps {
  label: string;
  helperText?: string;
  workspaceId: string;
  folder: TenantImageFolder;
  entityHint: string;
  entityId?: string;
  preset: ImageUploadPreset;
  valueUrl: string;
  valuePath: string;
  savedPath?: string;
  onChange: (next: { url: string; path: string }) => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
}

export function ImageUploadField({
  label,
  helperText,
  workspaceId,
  folder,
  entityHint,
  entityId,
  preset,
  valueUrl,
  valuePath,
  savedPath = '',
  onChange,
  onUploadingChange,
  disabled = false,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSelectedFileRef = useRef<File | null>(null);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadCompleted, setUploadCompleted] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);

  const presetMeta = IMAGE_UPLOAD_PRESETS[preset];
  const isBanner = preset === 'banner';

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!valueUrl) {
      setUploadCompleted(false);
    }
    setPreviewBroken(false);
  }, [valueUrl, workspaceId]);

  async function runUpload(file: File) {
    if (uploading || disabled) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    lastSelectedFileRef.current = file;

    setUploadError(null);
    setUploadCompleted(false);
    setPreviewBroken(false);
    setUploading(true);
    setProgress(2);
    onUploadingChange?.(true);

    const previousDraftPath = valuePath;

    try {
      const uploaded = await uploadTenantMenuImage({
        workspaceId,
        folder,
        entityHint,
        entityId,
        file,
        preset,
        onProgress: setProgress,
        signal: controller.signal,
      });

      onChange({ url: uploaded.url, path: uploaded.path });
      setProgress(100);
      setUploadCompleted(true);
      lastSelectedFileRef.current = null;

      // Remove apenas rascunho temporário anterior desta mesma edição;
      // a imagem já salva no banco só é removida após o usuário clicar em Salvar.
      if (
        previousDraftPath &&
        previousDraftPath !== savedPath &&
        previousDraftPath !== uploaded.path
      ) {
        void deleteTenantMenuImage(workspaceId, previousDraftPath);
      }
    } catch (err) {
      setProgress(0);
      setUploadCompleted(false);
      setUploadError(
        err instanceof Error ? err.message : 'Não foi possível enviar a imagem.',
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    void runUpload(file);
  }

  function handleCancelUpload() {
    abortControllerRef.current?.abort();
  }

  function handleRetryUpload() {
    const file = lastSelectedFileRef.current;
    if (file) {
      void runUpload(file);
    } else {
      fileInputRef.current?.click();
    }
  }

  function handleRemove() {
    if (uploading || disabled) return;
    setUploadError(null);
    setUploadCompleted(false);
    setPreviewBroken(false);
    lastSelectedFileRef.current = null;
    if (valuePath && valuePath !== savedPath) {
      void deleteTenantMenuImage(workspaceId, valuePath);
    }
    onChange({ url: '', path: '' });
  }

  return (
    <div className="p-3.5 rounded-xl bg-[#F7F8FC]/60 border border-[#E8EAF0] space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-[#172033]"
          >
            {label}
          </label>
          <p className="text-[11px] text-[#778094] mt-0.5">
            {helperText ||
              `JPG, PNG ou WebP · Recomendado: ${presetMeta.aspectHint}`}
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={uploading || disabled}
        onChange={handleFileChange}
        className="sr-only"
      />

      <div
        className={
          isBanner
            ? 'space-y-3'
            : 'flex flex-col sm:flex-row sm:items-center gap-3.5'
        }
      >
        <div
          className={`relative overflow-hidden rounded-xl border border-[#E8EAF0] bg-white flex items-center justify-center shrink-0 ${
            isBanner ? 'w-full h-28 sm:h-36' : 'w-20 h-20'
          }`}
        >
          {valueUrl && !previewBroken ? (
            <img
              src={valueUrl}
              alt={label}
              referrerPolicy="no-referrer"
              onError={() => setPreviewBroken(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-[#778094] px-2 text-center">
              <ImageIcon className="w-5 h-5 mb-1 text-[#778094]" />
              <span className="text-[10px] font-medium">Sem foto</span>
            </div>
          )}

          {uploading && (
            <div className="absolute inset-0 bg-[#172033]/75 flex flex-col items-center justify-center gap-1 px-2">
              <Loader2 className="w-4 h-4 text-[#F5B900] animate-spin" />
              <span className="text-[10px] font-mono tabular-nums font-bold text-white">
                {progress}%
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!uploading ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[40px] px-3.5 rounded-xl border border-[#E8EAF0] hover:border-[#F5B900] bg-white text-xs font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 text-[#D97706]" />
              {valueUrl ? 'Trocar imagem' : 'Enviar imagem'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCancelUpload}
              className="min-h-[40px] px-3.5 rounded-xl border border-[#FECACA] hover:border-[#E35D62] bg-[#FEF2F2] text-xs font-semibold text-[#E35D62] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancelar ({progress}%)
            </button>
          )}

          {valueUrl && !uploading && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleRemove}
              className="min-h-[40px] px-3 rounded-xl border border-[#E8EAF0] hover:border-[#FECACA] hover:bg-[#FEF2F2] text-xs font-semibold text-[#E35D62] inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remover
            </button>
          )}
        </div>
      </div>

      {uploading && (
        <div
          aria-label="Progresso do envio da imagem"
          className="h-1.5 w-full rounded-full bg-[#EFF1F7] overflow-hidden"
        >
          <div
            className="h-full bg-[#F5B900] transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {uploadCompleted && !uploading && !uploadError && valueUrl && (
        <p
          role="status"
          className="text-[11px] font-medium text-[#16A36A] flex items-center gap-1.5"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Imagem enviada. Clique em Salvar para confirmar no cardápio.</span>
        </p>
      )}

      {uploadError && (
        <div
          role="alert"
          className="p-2.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] space-y-2"
        >
          <p className="text-[11px] text-[#B91C1C] flex items-start gap-1.5 leading-relaxed">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{uploadError}</span>
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={handleRetryUpload}
            className="min-h-[34px] px-3 rounded-lg bg-white border border-[#E8EAF0] hover:border-[#F5B900] text-[11px] font-semibold text-[#172033] inline-flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3 text-[#D97706]" />
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
