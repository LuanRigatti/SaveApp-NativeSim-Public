import { isStillImageAsset } from './photoImportPipeline';
import type { PhotoImportAsset, VideoImportAsset } from './photoTypes';
import { isVideoAsset } from './videoImportPipeline';

export type PickedMediaBatch =
  | { kind: 'photo'; assets: PhotoImportAsset[] }
  | { kind: 'video'; assets: VideoImportAsset[] };

/** Groups supported picker results by type without changing their selection order. */
export function groupPickedMediaAssets(
  assets: readonly VideoImportAsset[],
): PickedMediaBatch[] {
  const batches: PickedMediaBatch[] = [];

  for (const asset of assets) {
    if (isStillImageAsset(asset)) {
      const lastBatch = batches.at(-1);
      if (lastBatch?.kind === 'photo') {
        lastBatch.assets.push(asset);
      } else {
        batches.push({ kind: 'photo', assets: [asset] });
      }
      continue;
    }

    if (isVideoAsset(asset)) {
      const lastBatch = batches.at(-1);
      if (lastBatch?.kind === 'video') {
        lastBatch.assets.push(asset);
      } else {
        batches.push({ kind: 'video', assets: [asset] });
      }
    }
  }

  return batches;
}

export function countUnsupportedPickedVideos(assets: readonly VideoImportAsset[]): number {
  return assets.filter((asset) => {
    const mimeType = asset.mimeType?.split(';', 1)[0]?.trim().toLowerCase();
    const looksLikeVideo = asset.type === 'video' || Boolean(mimeType?.startsWith('video/'));
    return looksLikeVideo && !isVideoAsset(asset);
  }).length;
}
