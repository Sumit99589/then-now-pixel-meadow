export interface Companion {
  readonly id: string;
  readonly name: string;
  readonly species: string;
  readonly description: string;
}
export const companions: readonly Companion[];
export function createSprite(kind?: string, className?: string): SVGSVGElement;
export function createIcon(name: string, className?: string): SVGSVGElement;
export function createMeadow(): SVGSVGElement;
export function createMiniMeadow(): SVGSVGElement;
