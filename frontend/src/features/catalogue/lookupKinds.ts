import type { LookupKind } from './api';

/** The words each lookup list (types, brands, units) uses in its headings, buttons and messages. */
export interface LookupText {
  /** The list's name, e.g. "Brands". */
  title: string;
  /** The name column's heading, e.g. "Brand". */
  heading: string;
  /** "brand", as in "Add brand". */
  singular: string;
  /** "brands", as in "added to brands". */
  plural: string;
  /** A name to show as an example in the form. */
  example: string;
  /** What the optional note is for, as an example. */
  noteExample: string;
  emptyDescription: string;
}

export const LOOKUP_TEXT: Record<LookupKind, LookupText> = {
  types: {
    title: 'Product types',
    heading: 'Type',
    singular: 'type',
    plural: 'product types',
    example: 'e.g. Socially marketed',
    noteExample: 'e.g. Subsidised and sold through social marketing',
    emptyDescription:
      'Add the ways condom products reach people, such as free public-sector supply or commercial sale.',
  },
  brands: {
    title: 'Brands',
    heading: 'Brand',
    singular: 'brand',
    plural: 'brands',
    example: 'e.g. Engabu',
    noteExample: 'e.g. Free public-sector brand',
    emptyDescription: 'Add the brands condom products are distributed or sold under.',
  },
  units: {
    title: 'Units of measure',
    heading: 'Unit',
    singular: 'unit',
    plural: 'units of measure',
    example: 'e.g. Dispenser pack',
    noteExample: 'e.g. Refill for a hotspot dispenser',
    emptyDescription: 'Add the units condoms are packed and counted in, such as a box or carton.',
  },
};
