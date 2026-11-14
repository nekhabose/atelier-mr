import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AtelierSystem } from './atelier-system.js';
import { ClosetSystem } from './closet-system.js';
import { LookbookSystem } from './lookbook-system.js';
import { BoutiqueSystem } from './boutique-system.js';
import { MeSystem } from './me-system.js';
import { sfx } from './atelier/sfx.js';
import { StylistSystem } from './stylist-system.js';
import { OnboardingSystem } from './onboarding-system.js';
import { RoomPlacementSystem } from './room-system.js';
import { AccessSystem } from './access-system.js';
import { ShowcaseSystem } from './showcase-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(AtelierSystem);
  world.registerSystem(ClosetSystem);
  world.registerSystem(LookbookSystem);
  world.registerSystem(BoutiqueSystem);
  world.registerSystem(MeSystem);
  world.registerSystem(StylistSystem);
  world.registerSystem(RoomPlacementSystem);
  world.registerSystem(OnboardingSystem);
  world.registerSystem(AccessSystem);
  world.registerSystem(ShowcaseSystem);
  // Handy for debugging in the browser console / IWSDK CLI eval.
  const g = globalThis as unknown as Record<string, unknown>;
  g.atelier = world.getSystem(AtelierSystem);
  g.closet = world.getSystem(ClosetSystem);
  g.stylist = world.getSystem(StylistSystem);
  g.lookbook = world.getSystem(LookbookSystem);
  g.boutique = world.getSystem(BoutiqueSystem);
  g.me = world.getSystem(MeSystem);
  g.sfx = sfx;
  g.room = world.getSystem(RoomPlacementSystem);
  g.tour = world.getSystem(OnboardingSystem);
  g.access = world.getSystem(AccessSystem);
  g.showcase = world.getSystem(ShowcaseSystem);
});
