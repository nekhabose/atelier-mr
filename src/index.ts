import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AtelierSystem } from './atelier-system.js';
import { ClosetSystem } from './closet-system.js';
import { OnboardingSystem } from './onboarding-system.js';
import { RoomPlacementSystem } from './room-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(AtelierSystem);
  world.registerSystem(ClosetSystem);
  world.registerSystem(RoomPlacementSystem);
  world.registerSystem(OnboardingSystem);
  // Handy for debugging in the browser console / IWSDK CLI eval.
  const g = globalThis as unknown as Record<string, unknown>;
  g.atelier = world.getSystem(AtelierSystem);
  g.closet = world.getSystem(ClosetSystem);
  g.room = world.getSystem(RoomPlacementSystem);
  g.tour = world.getSystem(OnboardingSystem);
});
