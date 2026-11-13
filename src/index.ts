import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AtelierSystem } from './atelier-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(AtelierSystem);
  // Handy for debugging in the browser console / IWSDK CLI eval.
  (globalThis as unknown as { atelier?: unknown }).atelier = world.getSystem(AtelierSystem);
});
