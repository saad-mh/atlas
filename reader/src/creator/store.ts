import { create } from "zustand";
import type { CreatorDraft, DraftBranch, DraftResource, DraftStep } from "./types";
import { emptyDraft } from "./types";

/** Locates a step by key anywhere in a (possibly nested) step tree, along
 * with the sibling array it lives in and its index - enough to replace,
 * remove, or reorder it in place. */
function findStepSlot(
  steps: DraftStep[],
  key: string,
): { list: DraftStep[]; index: number } | null {
  const index = steps.findIndex((s) => s.key === key);
  if (index !== -1) return { list: steps, index };
  for (const step of steps) {
    const nested = findStepSlot(step.steps, key);
    if (nested) return nested;
  }
  return null;
}

function mapSteps(steps: DraftStep[], fn: (s: DraftStep) => DraftStep): DraftStep[] {
  return steps.map((s) => {
    const updated = fn(s);
    return { ...updated, steps: mapSteps(updated.steps, fn) };
  });
}

function removeStepByKey(steps: DraftStep[], key: string): DraftStep[] {
  return steps
    .filter((s) => s.key !== key)
    .map((s) => ({ ...s, steps: removeStepByKey(s.steps, key) }));
}

interface CreatorStore {
  draft: CreatorDraft;
  reset: () => void;

  updateMeta: (patch: Partial<CreatorDraft["meta"]>) => void;

  addResource: (resource: DraftResource) => void;
  updateResource: (key: string, patch: Partial<DraftResource>) => void;
  removeResource: (key: string) => void;
  reorderResource: (key: string, direction: -1 | 1) => void;

  addStep: (step: DraftStep, parentKey: string | null) => void;
  updateStep: (key: string, patch: Partial<DraftStep>) => void;
  removeStep: (key: string) => void;
  reorderStep: (key: string, direction: -1 | 1) => void;

  addBranch: (branch: DraftBranch) => void;
  updateBranch: (key: string, patch: Partial<DraftBranch>) => void;
  removeBranch: (key: string) => void;
}

export const useCreatorStore = create<CreatorStore>((set) => ({
  draft: emptyDraft(),

  reset: () => set({ draft: emptyDraft() }),

  updateMeta: (patch) =>
    set((state) => ({ draft: { ...state.draft, meta: { ...state.draft.meta, ...patch } } })),

  addResource: (resource) =>
    set((state) => ({ draft: { ...state.draft, resources: [...state.draft.resources, resource] } })),

  updateResource: (key, patch) =>
    set((state) => ({
      draft: {
        ...state.draft,
        resources: state.draft.resources.map((r) => (r.key === key ? { ...r, ...patch } : r)),
      },
    })),

  removeResource: (key) =>
    set((state) => ({
      draft: {
        ...state.draft,
        resources: state.draft.resources.filter((r) => r.key !== key),
        // A resource being removed can no longer be required by any step.
        steps: mapSteps(state.draft.steps, (s) => ({
          ...s,
          requiresResources: s.requiresResources.filter((k) => k !== key),
        })),
      },
    })),

  reorderResource: (key, direction) =>
    set((state) => {
      const list = [...state.draft.resources];
      const index = list.findIndex((r) => r.key === key);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= list.length) return state;
      [list[index], list[target]] = [list[target], list[index]];
      return { draft: { ...state.draft, resources: list } };
    }),

  addStep: (step, parentKey) =>
    set((state) => {
      if (parentKey === null) {
        return { draft: { ...state.draft, steps: [...state.draft.steps, step] } };
      }
      const steps = mapSteps(state.draft.steps, (s) =>
        s.key === parentKey ? { ...s, steps: [...s.steps, step] } : s,
      );
      return { draft: { ...state.draft, steps } };
    }),

  updateStep: (key, patch) =>
    set((state) => ({
      draft: {
        ...state.draft,
        steps: mapSteps(state.draft.steps, (s) => (s.key === key ? { ...s, ...patch } : s)),
      },
    })),

  removeStep: (key) =>
    set((state) => {
      const remaining = removeStepByKey(state.draft.steps, key);
      // A removed step (or its now-gone descendants) can no longer be
      // depended on, required, or activated by anything else.
      const stillExists = new Set<string>();
      const collect = (list: DraftStep[]) => {
        for (const s of list) {
          stillExists.add(s.key);
          collect(s.steps);
        }
      };
      collect(remaining);
      const cleaned = mapSteps(remaining, (s) => ({
        ...s,
        dependsOn: s.dependsOn.filter((k) => stillExists.has(k)),
      }));
      return {
        draft: {
          ...state.draft,
          steps: cleaned,
          branches: state.draft.branches.map((b) => ({
            ...b,
            options: b.options.map((o) => ({
              ...o,
              activatesSteps: o.activatesSteps.filter((k) => stillExists.has(k)),
            })),
          })),
        },
      };
    }),

  reorderStep: (key, direction) =>
    set((state) => {
      const slot = findStepSlot(state.draft.steps, key);
      if (!slot) return state;
      const { list, index } = slot;
      const target = index + direction;
      if (target < 0 || target >= list.length) return state;
      // Mutate a deep-cloned tree so React/zustand sees a fresh top-level
      // reference and every ancestor re-renders.
      const cloned: DraftStep[] = JSON.parse(JSON.stringify(state.draft.steps));
      const clonedSlot = findStepSlot(cloned, key)!;
      const clonedList = clonedSlot.list;
      [clonedList[index], clonedList[target]] = [clonedList[target], clonedList[index]];
      return { draft: { ...state.draft, steps: cloned } };
    }),

  addBranch: (branch) =>
    set((state) => ({ draft: { ...state.draft, branches: [...state.draft.branches, branch] } })),

  updateBranch: (key, patch) =>
    set((state) => ({
      draft: {
        ...state.draft,
        branches: state.draft.branches.map((b) => (b.key === key ? { ...b, ...patch } : b)),
      },
    })),

  removeBranch: (key) =>
    set((state) => ({
      draft: { ...state.draft, branches: state.draft.branches.filter((b) => b.key !== key) },
    })),
}));
