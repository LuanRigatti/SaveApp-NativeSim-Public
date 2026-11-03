import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { EmptySavedTextError } from '@/features/home-content/contentSavePipeline';
import {
  createLinkSaveSubmissionRunner,
  type LinkSaveSubmissionResult,
} from '@/features/home-content/linkSaveSubmission';
import {
  getClipboardOfferCorrelationID,
  traceClipboardOfferEvent,
  type ClipboardOfferTraceSource,
} from '@/features/home-content/clipboardLinkOfferState';

export type HomeComposerKind = 'link' | null;

export type LinkComposerSubmitResult = {
  status: LinkSaveSubmissionResult;
  message?: string;
};

type ComposerControllerOptions = {
  onClose: () => void;
  onLinkSaveSuccess?: (submittedValue: string) => void;
  diagnosticSource?: ClipboardOfferTraceSource;
  diagnosticChangeCount?: number | null;
  diagnosticDetectorInstanceID?: string | null;
};

export function useLinkComposerController({
  onClose,
  onLinkSaveSuccess,
  diagnosticSource = 'home-manual',
  diagnosticChangeCount = null,
  diagnosticDetectorInstanceID = null,
}: ComposerControllerOptions) {
  const { saveLink } = useLocalSavedContent();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const linkAbortController = useRef<AbortController | null>(null);
  const isMounted = useRef(false);
  const didClose = useRef(false);
  const onCloseRef = useRef(onClose);
  const onLinkSaveSuccessRef = useRef(onLinkSaveSuccess);
  const diagnosticContextRef = useRef({
    diagnosticSource,
    diagnosticChangeCount,
    diagnosticDetectorInstanceID,
  });
  const submissionRunner = useRef<ReturnType<typeof createLinkSaveSubmissionRunner> | null>(null);

  const trace = useCallback((
    event: Parameters<typeof traceClipboardOfferEvent>[0],
    extra: Parameters<typeof traceClipboardOfferEvent>[1] = {},
  ) => {
    const context = diagnosticContextRef.current;
    traceClipboardOfferEvent(event, {
      source: context.diagnosticSource,
      detectorInstanceID: context.diagnosticDetectorInstanceID ?? undefined,
      correlationID: getClipboardOfferCorrelationID(context.diagnosticChangeCount),
      changeCount: context.diagnosticChangeCount,
      ...extra,
    });
  }, []);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    onLinkSaveSuccessRef.current = onLinkSaveSuccess;
    diagnosticContextRef.current = {
      diagnosticSource,
      diagnosticChangeCount,
      diagnosticDetectorInstanceID,
    };
  }, [diagnosticChangeCount, diagnosticDetectorInstanceID, diagnosticSource, onClose, onLinkSaveSuccess]);

  if (submissionRunner.current == null) {
    submissionRunner.current = createLinkSaveSubmissionRunner();
  }

  useEffect(() => {
    isMounted.current = true;
    didClose.current = false;
    trace('composer-mounted');

    return () => {
      isMounted.current = false;
      const controller = linkAbortController.current;
      linkAbortController.current = null;
      controller?.abort();
    };
  }, [trace]);

  const closeWithReason = useCallback((reason: 'saved' | 'cancelled') => {
    if (!isMounted.current || didClose.current) return;
    didClose.current = true;
    const controller = linkAbortController.current;
    linkAbortController.current = null;
    controller?.abort();
    trace(reason === 'saved' ? 'composer-close-requested' : 'composer-cancelled', {
      result: reason === 'saved' ? 'saved' : 'cancelled',
    });
    setIsSaving(false);
    setErrorMessage(null);
    onCloseRef.current();
  }, [trace]);

  const close = useCallback(() => closeWithReason('cancelled'), [closeWithReason]);

  const clearError = useCallback(() => {
    if (isMounted.current && !didClose.current) setErrorMessage(null);
  }, []);

  const submit = useCallback(
    async (link: string): Promise<LinkComposerSubmitResult> => {
      if (isSaving || linkAbortController.current) return { status: 'busy' };
      if (!isMounted.current || didClose.current) return { status: 'cancelled' };
      const controller = new AbortController();
      linkAbortController.current = controller;
      trace('persistence-started');

      let submissionError: string | null = null;
      const status = await submissionRunner.current?.(
        async () => {
          try {
            const saved = await saveLink(link, controller.signal);
            trace('persistence-succeeded', { result: 'saved' });
            return saved;
          } catch (error) {
            trace('persistence-failed', { result: 'failed' });
            throw error;
          }
        },
        controller.signal,
        {
          isCurrent: () =>
            isMounted.current &&
            !didClose.current &&
            linkAbortController.current === controller,
          onSettled: () => {
            if (linkAbortController.current === controller) linkAbortController.current = null;
          },
          setErrorMessage: (message) => {
            submissionError = message;
            setErrorMessage(message);
          },
          setSaving: setIsSaving,
          onSuccess: () => {
            if (linkAbortController.current !== controller || controller.signal.aborted) return;
            // Consume the exact clipboard event before close() makes Home eligible to check it.
            trace('composer-confirmed', { result: 'saved' });
            try {
              onLinkSaveSuccessRef.current?.(link);
            } catch {
              // Clipboard bookkeeping must not turn an already-persisted link into a failed save.
              trace('clipboard-consumption-callback-failed', { result: 'failed' });
            }
            linkAbortController.current = null;
            closeWithReason('saved');
          },
        },
      );

      trace('submission-result', { result: status ?? 'cancelled' });

      return {
        status: status ?? 'cancelled',
        ...(submissionError ? { message: submissionError } : {}),
      };
    },
    [closeWithReason, isSaving, saveLink, trace],
  );

  return { clearError, close, errorMessage, isSaving, submit };
}

export function useTextComposerController() {
  const { saveText } = useLocalSavedContent();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const textAbortController = useRef<AbortController | null>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
      const controller = textAbortController.current;
      textAbortController.current = null;
      controller?.abort();
    };
  }, []);

  const clearError = useCallback(() => {
    if (isMounted.current) setErrorMessage(null);
  }, []);

  const submit = useCallback(
    async (text: string): Promise<boolean> => {
      if (isSaving || textAbortController.current || !isMounted.current) return false;
      if (!text.trim()) {
        setErrorMessage('Escreva algo antes de adicionar.');
        return false;
      }

      const controller = new AbortController();
      textAbortController.current = controller;
      setIsSaving(true);
      setErrorMessage(null);

      try {
        await saveText(text, controller.signal);
        if (textAbortController.current !== controller || controller.signal.aborted) return false;
        textAbortController.current = null;
        return true;
      } catch (error) {
        if (
          controller.signal.aborted ||
          (error instanceof Error && error.name === 'AbortError') ||
          !isMounted.current
        ) {
          return false;
        }
        setErrorMessage(
          error instanceof EmptySavedTextError
            ? 'Escreva algo antes de salvar.'
            : 'Não foi possível salvar o texto.',
        );
        return false;
      } finally {
        if (textAbortController.current === controller) {
          textAbortController.current = null;
          if (isMounted.current) setIsSaving(false);
        }
      }
    },
    [isSaving, saveText],
  );

  return { clearError, errorMessage, isSaving, submit };
}
