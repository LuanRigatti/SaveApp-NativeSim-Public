import type { AccentColorName } from '@/theme/colors';

export const MAX_SAVED_TAG_NAME_LENGTH = 40;

export type SavedTag = {
  id: string;
  name: string;
  color: AccentColorName;
  createdAt: number;
  updatedAt: number;
};

export type SavedTagItemReference = {
  itemType: 'photo' | 'video' | 'link' | 'text' | 'document' | 'checklist';
  itemId: number;
};

export type SavedTagAssignment = SavedTagItemReference & {
  tagId: string;
  name: string;
  color: AccentColorName;
};

export type SavedTagNameErrorCode = 'required' | 'too-long' | 'duplicate';

export class SavedTagNameError extends Error {
  readonly code: SavedTagNameErrorCode;

  constructor(code: SavedTagNameErrorCode) {
    super(code);
    this.name = 'SavedTagNameError';
    this.code = code;
  }
}

export function normalizeSavedTagName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('pt-BR');
}

export function validateSavedTagName(name: string): string {
  const normalized = name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!normalized) throw new SavedTagNameError('required');
  if (Array.from(normalized).length > MAX_SAVED_TAG_NAME_LENGTH) {
    throw new SavedTagNameError('too-long');
  }
  return normalized;
}

export function getSavedTagNameErrorMessage(error: unknown): string {
  if (!(error instanceof SavedTagNameError)) {
    return 'Não foi possível salvar a etiqueta. Tente novamente.';
  }

  switch (error.code) {
    case 'required':
      return 'Digite um nome para a etiqueta.';
    case 'too-long':
      return `Use até ${MAX_SAVED_TAG_NAME_LENGTH} caracteres no nome da etiqueta.`;
    case 'duplicate':
      return 'Já existe uma etiqueta com esse nome.';
  }
}
