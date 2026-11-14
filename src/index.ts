import { DepthSensingSystem, World } from '@iwsdk/core';
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
import { PerfSystem } from './perf-system.js';
import { PlannerSystem } from './planner-system.js';
import { WardrobeSystem } from './wardrobe-system.js';

// Offline after one visit (production only; the dev server injects the emulator).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
  });
}

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
  world.registerSystem(WardrobeSystem);
  world.registerSystem(PlannerSystem);
  world.registerSystem(ShowcaseSystem);
  world.registerSystem(PerfSystem);
  // Real hands and furniture hide the form and garments behind them (Quest 3
  // depth API). Depth is optional: without it the studio renders as before.
  world.registerSystem(DepthSensingSystem, {
    configData: { enableDepthTexture: true, enableOcclusion: true, useFloat32: true, blurRadius: 20 },
  });
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
  g.perf = world.getSystem(PerfSystem);
  g.wardrobe = world.getSystem(WardrobeSystem);
  g.planner = world.getSystem(PlannerSystem);

  // Installed on Quest (Trusted Web Activity): there is no 2D page to tap, so
  // the app-icon tap enters the studio. Browser tabs keep the Enter button.
  const nav = navigator as Navigator & { xr?: { isSessionSupported?: (m: string) => Promise<boolean> } };
  if ('getDigitalGoodsService' in window && nav.xr?.isSessionSupported) {
    nav.xr
      .isSessionSupported('immersive-ar')
      .then((supported) => {
        if (supported) world.launchXR();
      })
      .catch(() => {});
  }

});
