/**
 * Atelier ECS components. System-free module (the editor imports it).
 */
import { createComponent, Types } from '@iwsdk/core';

/** The mannequin / dress form that wears the current outfit. */
export const DressForm = createComponent('DressForm', {});

/** A look hanging on the rack; tapping it dresses the mannequin. */
export const RackLook = createComponent('RackLook', {
  lookIndex: { type: Types.Int16, default: 0 },
});

/** A fabric swatch on the board; tap to apply, or grab and drop on the mannequin. */
export const FabricSwatch = createComponent('FabricSwatch', {
  fabricIndex: { type: Types.Int16, default: 0 },
});

export const TailorParams = {
  hem: 'hem',
  neck: 'neck',
  sleeve: 'sleeve',
  fit: 'fit',
} as const;

/** A tailoring pin: pinch and drag it to reshape the garment. */
export const TailorPin = createComponent('TailorPin', {
  param: { type: Types.Enum, default: TailorParams.hem, enum: TailorParams },
});

/** One garment piece currently worn by the mannequin. */
export const WornPiece = createComponent('WornPiece', {
  pieceIndex: { type: Types.Int16, default: 0 },
});

/** The brass turntable under the mannequin – grab it to spin the form. */
export const Turntable = createComponent('Turntable', {});
