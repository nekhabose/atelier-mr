import { defineComponents } from '@iwsdk/core';
import {
  AgentButton,
  BoutiqueSlot,
  BoutiqueTab,
  ClosetSlot,
  DressForm,
  FabricSwatch,
  RackLook,
  RackTab,
  TailorPin,
  Turntable,
  WornPiece,
} from './atelier-components.js';

export default defineComponents([
  DressForm,
  RackLook,
  FabricSwatch,
  TailorPin,
  WornPiece,
  Turntable,
  ClosetSlot,
  RackTab,
  BoutiqueSlot,
  BoutiqueTab,
  AgentButton,
]);
