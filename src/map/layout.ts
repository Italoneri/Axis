import { z } from 'zod';

// layout.json describes the Axis map in normalized units (0–1 of a square),
// with angles in degrees: 0 = North, growing clockwise.

const normalized = z.number().min(0).max(1);
const degrees = z.number().min(0).max(360);
const byte = z.number().int().min(0).max(255);
const rgbSchema = z.tuple([byte, byte, byte]);

export const prismSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rgb: rgbSchema,
  /** Halo color; defaults to `rgb`. Light prisms need a tinted glow to be visible. */
  glow: rgbSchema.optional(),
  /** Facet outline; defaults to a lighter `rgb`. */
  edge: rgbSchema.optional(),
});

export const arcSchema = z
  .object({
    innerRadius: normalized,
    outerRadius: normalized,
    startAngle: degrees,
    endAngle: degrees,
  })
  .refine((arc) => arc.innerRadius < arc.outerRadius, 'innerRadius must be below outerRadius');

const slotBase = { id: z.string().min(1), x: normalized, y: normalized, angle: degrees };

export const slotDefSchema = z.discriminatedUnion('type', [
  z.object({ ...slotBase, type: z.literal('core'), shape: z.literal('round'), size: normalized }),
  z.object({
    ...slotBase,
    type: z.literal('middle'),
    shape: z.literal('square'),
    size: normalized,
  }),
  z.object({ ...slotBase, type: z.literal('outer'), shape: z.literal('arc'), arc: arcSchema }),
]);

export const reservedSchema = z.object({
  id: z.string().min(1),
  startAngle: degrees,
  endAngle: degrees,
});

export const layoutSchema = z
  .object({
    version: z.literal(3),
    wall: z.object({ outerRadius: normalized, thickness: normalized }),
    entrances: z.object({
      width: normalized,
      angles: z.array(degrees).min(1),
      prisms: z.array(prismSchema).min(1),
    }),
    innerDisc: z.object({ radius: normalized }),
    core: z.object({ radius: normalized }),
    slots: z.array(slotDefSchema).min(1),
    reserved: z.array(reservedSchema).default([]),
  })
  .refine((layout) => layout.entrances.angles.length === layout.entrances.prisms.length, {
    message: 'entrances.angles and entrances.prisms must have the same length',
    path: ['entrances'],
  });

export type Rgb = z.infer<typeof rgbSchema>;
export type Prism = z.infer<typeof prismSchema>;
export type ArcShape = z.infer<typeof arcSchema>;
export type SlotDef = z.infer<typeof slotDefSchema>;
export type SlotType = SlotDef['type'];
export type ReservedStretch = z.infer<typeof reservedSchema>;
export type MapLayout = z.infer<typeof layoutSchema>;

export const SLOT_TYPES = ['core', 'middle', 'outer'] as const satisfies readonly SlotType[];
export const slotTypeSchema = z.enum(SLOT_TYPES);

/** One entrance: where its gate sits and which prism it carries. */
export interface Gate {
  readonly angle: number;
  readonly prism: Prism;
}

export function gatesOf(layout: MapLayout): Gate[] {
  return layout.entrances.prisms.flatMap((prism, index) => {
    const angle = layout.entrances.angles[index];
    return angle === undefined ? [] : [{ angle, prism }];
  });
}
