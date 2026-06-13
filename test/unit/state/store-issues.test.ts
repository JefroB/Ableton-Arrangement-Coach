import { describe, it, expect, vi } from "vitest";
import { createStore } from "../../../src/state/store.js";
import type { Issue } from "../../../src/core/issue-types.js";

const sampleIssue: Issue = {
  id: "flat-energy-section-0-section-1",
  type: "flat-energy",
  severity: "warning",
  sectionIds: ["section-0", "section-1"],
  message: "Energy is flat between Section 0 and Section 1.",
};

const anotherIssue: Issue = {
  id: "missing-transition-section-1-section-2",
  type: "missing-transition",
  severity: "critical",
  sectionIds: ["section-1", "section-2"],
  message: "Large energy jump with no transition element.",
};

describe("store — UPDATE_ISSUES action", () => {
  it("replaces issues array with dispatched array", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ISSUES", issues: [sampleIssue] });

    expect(store.getState().issues).toEqual([sampleIssue]);
  });

  it("sets issues to empty array when dispatched with empty array", () => {
    const store = createStore();
    // First set some issues
    store.dispatch({ type: "UPDATE_ISSUES", issues: [sampleIssue] });
    // Then clear them
    store.dispatch({ type: "UPDATE_ISSUES", issues: [] });

    expect(store.getState().issues).toEqual([]);
  });

  it("replaces previous issues entirely on second dispatch", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ISSUES", issues: [sampleIssue] });
    store.dispatch({ type: "UPDATE_ISSUES", issues: [anotherIssue] });

    expect(store.getState().issues).toEqual([anotherIssue]);
  });

  it("notifies subscribers when UPDATE_ISSUES is dispatched", () => {
    const store = createStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.dispatch({ type: "UPDATE_ISSUES", issues: [sampleIssue] });

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("store — other actions preserve issues", () => {
  it("UPDATE_PLAYHEAD does not alter issues", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ISSUES", issues: [sampleIssue] });
    store.dispatch({ type: "UPDATE_PLAYHEAD", position: 32 });

    expect(store.getState().issues).toEqual([sampleIssue]);
  });

  it("UPDATE_ANALYSIS does not alter issues", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ISSUES", issues: [sampleIssue] });
    store.dispatch({
      type: "UPDATE_ANALYSIS",
      sectionAnalysis: new Map(),
      energyCurve: [1, 2, 3],
    });

    expect(store.getState().issues).toEqual([sampleIssue]);
  });

  it("SET_GENRE does not alter issues", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ISSUES", issues: [sampleIssue] });
    store.dispatch({ type: "SET_GENRE", genreId: "Techno" });

    expect(store.getState().issues).toEqual([sampleIssue]);
  });

  it("INIT action resets issues to empty array", () => {
    const store = createStore();
    store.dispatch({ type: "UPDATE_ISSUES", issues: [sampleIssue, anotherIssue] });
    store.dispatch({ type: "INIT", sections: [], trackInventory: [] });

    expect(store.getState().issues).toEqual([]);
  });
});
