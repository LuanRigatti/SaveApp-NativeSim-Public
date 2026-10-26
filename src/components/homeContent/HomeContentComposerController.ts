import { useCallback, useEffect, useRef, useState } from 'react';

import { useLocalSavedContent } from '@/features/home-content/LocalSavedContentProvider';
import { EmptySavedTextError } from '@/features/home-content/contentSavePipeline';
import {
  createLinkSaveSubmissionRunner,
  type LinkSaveSubmissionResult,
} from '@/features/home-content/linkSaveSubmission';

export type HomeComposerKind = 'link' | null;

export type LinkComposerSubmitResult = {
  status: LinkSaveSubmissionResult;
  message?: string;
};

type ComposerControllerOptions = {
  onClose: () => void;
};

export function useLinkComposerController({ onClose }: ComposerControllerOptions) {
  const { saveLink } = useLocalSavedContent();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const linkAbortController = useRef<AbortController | null>(null);
  const isMounted = useRef(false);
  const didClose = useRef(false);
  const onCloseRef = useRef(onClose);
  const submissionRunner = useRef<ReturnType<typeof createLinkSaveSubmissionRunner> | null>(null);

  if (submissionRunner.current == null) {
    submissionRunner.current = createLinkSaveSubmissionRunner();
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    isMounted.current = true;
    didClose.current = false;

    return () => {
      isMounted.current = false;
      const controller = linkAbortController.current;
      linkAbortController.current = null;
      controller?.abort();
    };
  }, []);

  const close = useCallback(() => {
    if (!isMounted.current || didClose.current) return;
    didClose.current = true;
    const controller = linkAbortController.current;
    linkAbortController.current = null;
    controller?.abort();
    setIsSaving(false);
    setErrorMessage(null);
    onCloseRef.current();
  }, []);

  const clearError = useCallback(() => {
    if (isMounted.current && !didClose.current) setErrorMessage(null);
  }, []);

  const submit = useCallback(
    async (link: string): Promise<LinkComposerSubmitResult> => {
      if (isSaving || linkAbortController.current) return { status: 'busy' };
      if (!isMounted.current || didClose.current) return { status: 'cancelled' };
      const controller = new AbortController();
      linkAbortController.current = controller;

      let submissionError: string | null = null;
      const status = await submissionRunner.current?.(
        () => saveLink(link, controller.signal),
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
            linkAbortController.current = null;
            close();
          },
        },
      );

      return {
        status: status ?? 'cancelled',
        ...(submissionError ? { message: submissionError } : {}),
      };
    },
    [close, isSaving, saveLink],
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
