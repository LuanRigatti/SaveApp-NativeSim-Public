import type { HomeFolderItemType } from '@/features/home-folders/homeFolderTypes';

export const HOME_CATEGORIES = [
  { id: 'media', label: 'Mídia', icon: 'photo.on.rectangle' },
  { id: 'documents', label: 'Documentos', icon: 'doc' },
  { id: 'links', label: 'Links', icon: 'link' },
  { id: 'lists', label: 'Listas', icon: 'checklist' },
  { id: 'texts', label: 'Textos', icon: 'text.alignleft' },
] as const;

export type HomeCategory = typeof HOME_CATEGORIES[number]['id'];
export type HomeCategoryDefinition = typeof HOME_CATEGORIES[number];

const CATEGORY_BY_ITEM_TYPE: Readonly<Record<HomeFolderItemType, HomeCategory>> = {
  photo: 'media',
  video: 'media',
  document: 'documents',
  link: 'links',
  checklist: 'lists',
  text: 'texts',
};

export function isHomeCategory(value: unknown): value is HomeCategory {
  return HOME_CATEGORIES.some((category) => category.id === value);
}

export function getHomeCategoryDefinition(category: HomeCategory): HomeCategoryDefinition {
  return HOME_CATEGORIES.find((candidate) => candidate.id === category) ?? HOME_CATEGORIES[0];
}

export function getHomeCategoryForItemType(itemType: HomeFolderItemType): HomeCategory {
  return CATEGORY_BY_ITEM_TYPE[itemType];
}

export function getHomeCategoryEmptyMessage(category: HomeCategory): string {
  switch (category) {
    case 'media':
      return 'Nenhuma mídia salva';
    case 'documents':
      return 'Nenhum documento salvo';
    case 'links':
      return 'Nenhum link salvo';
    case 'lists':
      return 'Nenhuma lista salva';
    case 'texts':
      return 'Nenhum texto salvo';
  }
}
