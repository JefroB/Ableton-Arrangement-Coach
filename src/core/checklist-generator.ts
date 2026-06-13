/**
 * Checklist Generator — pure function that converts issues and transition
 * recommendations into per-section checklist items.
 *
 * No I/O, no side effects. Accepts plain data, returns plain data.
 */

import type { Issue, IssueSeverity } from "./issue-types.js";
import type { TransitionRecommendation } from "./transition-engine.js";
import type { SectionChecklistItem } from "./notes-types.js";
import type { GenreProfile, DetectionRule } from "./genre-profile-types.js";
import { getProfile, getProfileBySubgenre } from "./genre-registry.js";

// ─── Input / Output Interfaces ─────────────────────────────────────────

/**
 * Input contract for the checklist generator.
 *
 * All fields are readonly to enforce purity at the type level.
 */
export interface ChecklistGeneratorInput {
  readonly issues: readonly Issue[];
  readonly transitionRecommendations: readonly TransitionRecommendation[];
  readonly existingSections: readonly string[];
  readonly existingCompletions: ReadonlyMap<string, boolean>;
  readonly selectedGenre: string | null;
}

/**
 * Output: a map of sectionId → ordered array of checklist items.
 * Every section in `existingSections` will have an entry (possibly empty).
 */
export interface SectionChecklistMap {
  readonly [sectionId: string]: readonly SectionChecklistItem[];
}

// ─── Severity Ordering ─────────────────────────────────────────────────

/** Severity priority: lower number = higher priority (appears first). */
const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ─── Main Function ─────────────────────────────────────────────────────

/**
 * Generate per-section checklists from issues and transition recommendations.
 *
 * Pure function — deterministic output for identical inputs.
 *
 * Ordering within each section: issue items → genre items → transition items.
 *
 * @param input - Issues, transition recommendations, existing sections, and completion states.
 * @returns A map of sectionId → ordered array of SectionChecklistItem.
 */
export function generateSectionChecklists(input: ChecklistGeneratorInput): SectionChecklistMap {
  const { issues, transitionRecommendations, existingSections, existingCompletions, selectedGenre } = input;

  // Initialize per-source buckets for each section to enforce ordering
  const issueItems: Record<string, SectionChecklistItem[]> = {};
  const genreItems: Record<string, SectionChecklistItem[]> = {};
  const transitionItems: Record<string, SectionChecklistItem[]> = {};

  for (const sectionId of existingSections) {
    issueItems[sectionId] = [];
    genreItems[sectionId] = [];
    transitionItems[sectionId] = [];
  }

  // ─── Issue-sourced items ───────────────────────────────────────────

  // Collect issue items grouped by section, sorted by severity
  const sortedIssues = [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  for (const issue of sortedIssues) {
    for (const sectionId of issue.sectionIds) {
      // Only produce items for sections that exist in the current arrangement
      if (!existingSections.includes(sectionId)) {
        continue;
      }

      const itemId = `issue-${issue.id}`;
      const completed = existingCompletions.get(itemId) ?? false;

      const item: SectionChecklistItem = {
        id: itemId,
        sectionId,
        text: issue.message,
        source: "issue",
        completed,
      };

      issueItems[sectionId]!.push(item);
    }
  }

  // ─── Genre-sourced items ───────────────────────────────────────────

  // Resolve GenreProfile when selectedGenre is non-null
  if (selectedGenre !== null) {
    const profile = getProfile(selectedGenre) ?? getProfileBySubgenre(selectedGenre);
    if (profile !== null) {
      const genreItemsMap = generateGenreItems(profile, existingSections, existingCompletions);
      for (const sectionId of existingSections) {
        const items = genreItemsMap.get(sectionId);
        if (items && items.length > 0) {
          genreItems[sectionId] = items;
        }
      }
    }
  }

  // ─── Transition-sourced items ──────────────────────────────────────

  // Process in recommendation order (preserves the input array order)
  for (const recommendation of transitionRecommendations) {
    const sectionId = recommendation.toSectionId;

    // Only produce items for sections that exist in the current arrangement
    if (!existingSections.includes(sectionId)) {
      continue;
    }

    for (const checklistItem of recommendation.checklist) {
      const itemId = `transition-${recommendation.id}-${checklistItem.id}`;
      const completed = existingCompletions.get(itemId) ?? false;

      const item: SectionChecklistItem = {
        id: itemId,
        sectionId,
        text: checklistItem.text,
        source: "transition",
        completed,
      };

      transitionItems[sectionId]!.push(item);
    }
  }

  // ─── Merge with ordering: issue → genre → transition ──────────────

  const result: Record<string, SectionChecklistItem[]> = {};
  for (const sectionId of existingSections) {
    result[sectionId] = [
      ...issueItems[sectionId]!,
      ...genreItems[sectionId]!,
      ...transitionItems[sectionId]!,
    ];
  }

  return result;
}


// ─── Genre Checklist Item Generation ───────────────────────────────────

/**
 * Extract a human-readable section name from a section ID.
 *
 * If the ID starts with "section-", strips that prefix. Otherwise uses
 * the full ID. The result is used for case-insensitive substring matching
 * against genre profile SectionTemplate names.
 */
function extractSectionName(sectionId: string): string {
  const prefix = "section-";
  if (sectionId.startsWith(prefix)) {
    return sectionId.slice(prefix.length);
  }
  return sectionId;
}

/**
 * Match a section name against a SectionTemplate name using case-insensitive
 * substring matching. Returns true if either string contains the other.
 */
function sectionMatchesTemplate(sectionName: string, templateName: string): boolean {
  const lower = sectionName.toLowerCase();
  const templateLower = templateName.toLowerCase();
  return lower.includes(templateLower) || templateLower.includes(lower);
}

/**
 * Generate genre-sourced checklist items from a GenreProfile.
 *
 * For each section in existingSections that matches a SectionTemplate in the
 * profile's structure, produces checklist items for lengthRange and energyRange
 * conventions. Additionally, for each DetectionRule with severity "critical" or
 * "warning" whose type can be associated with a section, produces a corresponding
 * checklist item.
 *
 * All generated items have source "genre" and IDs following the pattern:
 * `genre-{genreId}-{sectionId}-{ruleIndex}`
 *
 * @param profile - The resolved GenreProfile for the selected genre.
 * @param existingSections - Section IDs from the current arrangement.
 * @param existingCompletions - Map of item IDs to their completion states.
 * @returns A map of sectionId → genre-sourced checklist items.
 */
export function generateGenreItems(
  profile: GenreProfile,
  existingSections: readonly string[],
  existingCompletions: ReadonlyMap<string, boolean>,
): Map<string, SectionChecklistItem[]> {
  const result = new Map<string, SectionChecklistItem[]>();

  // Initialize empty arrays for all sections
  for (const sectionId of existingSections) {
    result.set(sectionId, []);
  }

  // Collect detection rules with severity "critical" or "warning"
  const actionableRules = profile.detectionRules.filter(
    (rule) => rule.severity === "critical" || rule.severity === "warning",
  );

  for (const sectionId of existingSections) {
    const sectionName = extractSectionName(sectionId);
    const items: SectionChecklistItem[] = [];
    let ruleIndex = 0;

    // Match section name against profile structure templates
    const matchedTemplates = profile.structure.filter((template) =>
      sectionMatchesTemplate(sectionName, template.name),
    );

    for (const template of matchedTemplates) {
      // Produce checklist item for lengthRange convention
      const lengthId = `genre-${profile.id}-${sectionId}-${ruleIndex}`;
      const lengthCompleted = existingCompletions.get(lengthId) ?? false;
      items.push({
        id: lengthId,
        sectionId,
        text: `Verify ${template.name} is ${template.lengthRange.min}\u2013${template.lengthRange.max} bars per ${profile.name} convention`,
        source: "genre",
        completed: lengthCompleted,
      });
      ruleIndex++;

      // Produce checklist item for energyRange convention
      const energyId = `genre-${profile.id}-${sectionId}-${ruleIndex}`;
      const energyCompleted = existingCompletions.get(energyId) ?? false;
      items.push({
        id: energyId,
        sectionId,
        text: `Check energy level targets ${template.energyRange.min}\u2013${template.energyRange.max} for ${template.name}`,
        source: "genre",
        completed: energyCompleted,
      });
      ruleIndex++;
    }

    // For each actionable detection rule, check if it can be associated with this section
    for (const rule of actionableRules) {
      if (ruleMatchesSection(rule, sectionName)) {
        const ruleItemId = `genre-${profile.id}-${sectionId}-${ruleIndex}`;
        const ruleCompleted = existingCompletions.get(ruleItemId) ?? false;
        items.push({
          id: ruleItemId,
          sectionId,
          text: formatDetectionRuleText(rule, sectionName, profile.name),
          source: "genre",
          completed: ruleCompleted,
        });
        ruleIndex++;
      }
    }

    result.set(sectionId, items);
  }

  return result;
}

/**
 * Determine whether a detection rule can be associated with a section
 * based on naming conventions in the rule type.
 *
 * Matches rule types that contain section-related keywords (e.g.,
 * "intro", "outro", "breakdown", "main") against the section name using
 * case-insensitive substring matching.
 */
function ruleMatchesSection(rule: DetectionRule, sectionName: string): boolean {
  const ruleTypeLower = rule.type.toLowerCase();
  const sectionNameLower = sectionName.toLowerCase();

  // Extract keywords from the rule type (split on hyphens)
  const ruleKeywords = ruleTypeLower.split("-");

  // Check if any keyword in the rule type matches the section name
  for (const keyword of ruleKeywords) {
    // Skip very short or generic keywords that don't indicate section type
    if (keyword.length < 3) continue;
    if (["min", "max", "no", "not", "the", "and", "for", "per"].includes(keyword)) continue;

    if (sectionNameLower.includes(keyword) || keyword.includes(sectionNameLower)) {
      return true;
    }
  }

  return false;
}

/**
 * Format a human-readable checklist item text from a detection rule.
 */
function formatDetectionRuleText(rule: DetectionRule, sectionName: string, genreName: string): string {
  const typeReadable = rule.type.replace(/-/g, " ");
  if (typeof rule.value === "boolean") {
    return `Verify ${typeReadable} for ${sectionName} per ${genreName} convention`;
  }
  const unitSuffix = rule.unit ? ` ${rule.unit}` : "";
  return `Check ${typeReadable}: ${rule.value}${unitSuffix} for ${sectionName} per ${genreName} convention`;
}
