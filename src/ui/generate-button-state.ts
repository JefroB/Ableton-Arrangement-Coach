/**
 * Pure functions for determining the Generate Sections button state.
 * Extracted from webview inline JS for testability.
 */

/** Possible states for the Generate Sections button. */
export type GenerateButtonState =
  | "loading"
  | "disabled-no-genre"
  | "disabled-sections-exist"
  | "enabled";

/** Inputs that determine button state. */
export interface ButtonStateInput {
  readonly isGenerating: boolean;
  readonly selectedGenre: string | null;
  readonly sectionsCount: number;
}

/**
 * Determines the current state of the Generate Sections button.
 * Priority order: loading > no genre > sections exist > enabled.
 */
export function getGenerateButtonState(input: ButtonStateInput): GenerateButtonState {
  if (input.isGenerating) return "loading";
  if (!input.selectedGenre) return "disabled-no-genre";
  if (input.sectionsCount > 0) return "disabled-sections-exist";
  return "enabled";
}

/**
 * Returns the tooltip text for the given button state.
 * Returns empty string when no tooltip is needed (enabled state).
 */
export function getGenerateTooltip(state: GenerateButtonState): string {
  if (state === "disabled-no-genre") return "Select a genre to enable section generation";
  if (state === "disabled-sections-exist") return "Remove existing sections to generate new ones";
  if (state === "loading") return "Generating sections…";
  return "";
}
