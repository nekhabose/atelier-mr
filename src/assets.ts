import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createClothingRack,
  createMannequin,
  createSwatchBoard,
} from './scene-assets/atelier.scene-asset.js';
import { createStudioSet } from './scene-assets/studio-set.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  mannequin: createMannequin(),
  'clothing-rack': createClothingRack(),
  'swatch-board': createSwatchBoard(),
  'studio-set': createStudioSet(),
  'atelier-panel': uikitml('atelier.uikitml', 'Atelier Panel'),
  'closet-panel': uikitml('closet.uikitml', 'Closet Panel'),
});
