/** Audio clip warp marker data transfer object. */
export interface WarpMarkerData {
  readonly sampleTime: number; // seconds in audio file, >= 0.0
  readonly beatTime: number; // arrangement beat position, >= 0.0
}

/** Audio clip data transfer object. */
export interface AudioClipData {
  readonly startTime: number; // beats
  readonly endTime: number; // beats
  readonly muted: boolean;
  readonly filePath: string;
  readonly warping: boolean;
  readonly warpMarkers: readonly WarpMarkerData[];
}

/** Track descriptor for reference detection. */
export interface TrackDescriptor {
  readonly name: string;
  readonly muted: boolean;
}

/** Extracted reference section. */
export interface ReferenceSection {
  readonly label: string;
  readonly startTime: number; // beats
  readonly endTime: number; // beats
  readonly proportion: number; // 0.0–1.0, all proportions sum to 1.0
}

/** Per-section comparison delta. */
export interface SectionDelta {
  readonly userLabel: string;
  readonly referenceLabel: string | null;
  readonly proportionDelta: number | null;
  readonly timingDelta: number | null;
  readonly durationDeltaBeats: number | null;
  readonly durationDeltaPercent: number | null;
  readonly matched: boolean;
  readonly suggestion: string | null;
}

/** Aggregate metrics across the entire comparison. */
export interface AggregateMetrics {
  readonly totalDurationDifference: number;
  readonly peakPositionDifference: number;
  readonly sectionCountDifference: number;
}

/** Complete comparison result. */
export interface ComparisonResult {
  readonly sectionDeltas: readonly SectionDelta[];
  readonly aggregateMetrics: AggregateMetrics;
}

/** User section input (subset of Section + energy). */
export interface UserSectionInput {
  readonly startTime: number;
  readonly endTime: number;
  readonly energyScore: number;
  readonly label: string;
}
