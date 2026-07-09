import { useCreatorStore } from "../store";
import { slugify } from "../slug";
import { emptyResource, emptySubstitute, type DraftResource, type ResourceKind } from "../types";

const TYPE_OPTIONS: ResourceKind[] = ["hardware", "software", "other"];

export function ResourcesStep() {
  const resources = useCreatorStore((s) => s.draft.resources);
  const addResource = useCreatorStore((s) => s.addResource);

  return (
    <div className="creator-step">
      <h2>Resources</h2>
      <p className="creator-step__hint">
        Anything required before or during the build: parts, dependencies, tools.
      </p>
      <p className="creator-step__note">
        Resources are referenced by their <code>id</code> in steps. The <code>id</code> is auto-generated from the name, but can be edited if needed.
      </p>

      {resources.length === 0 && <p className="empty-state">No resources yet.</p>}

      <div className="card-list">
        {resources.map((resource, i) => (
          <ResourceCard key={resource.key} resource={resource} index={i} count={resources.length} />
        ))}
      </div>

      <button type="button" className="add-button" onClick={() => addResource(emptyResource())}>
        + Add resource
      </button>
    </div>
  );
}

function ResourceCard({ resource, index, count }: { resource: DraftResource; index: number; count: number }) {
  const updateResource = useCreatorStore((s) => s.updateResource);
  const removeResource = useCreatorStore((s) => s.removeResource);
  const reorderResource = useCreatorStore((s) => s.reorderResource);

  const handleNameChange = (name: string) => {
    updateResource(resource.key, resource.idManual ? { name } : { name, id: slugify(name) });
  };

  const handleIdChange = (raw: string) => {
    const id = slugify(raw);
    if (id === "") {
      updateResource(resource.key, { id: slugify(resource.name), idManual: false });
    } else {
      updateResource(resource.key, { id, idManual: true });
    }
  };

  const updateSub = (key: string, patch: Partial<{ name: string; note: string }>) => {
    updateResource(resource.key, {
      substitutes: resource.substitutes.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    });
  };
  const addSub = () => updateResource(resource.key, { substitutes: [...resource.substitutes, emptySubstitute()] });
  const removeSub = (key: string) =>
    updateResource(resource.key, { substitutes: resource.substitutes.filter((s) => s.key !== key) });

  return (
    <div className="card">
      <div className="card__header">
        <span className="card__title">{resource.name || "Untitled resource"}</span>
        <div className="card__actions">
          <button type="button" className="icon-button" disabled={index === 0} onClick={() => reorderResource(resource.key, -1)} aria-label="Move up">
            ↑
          </button>
          <button type="button" className="icon-button" disabled={index === count - 1} onClick={() => reorderResource(resource.key, 1)} aria-label="Move down">
            ↓
          </button>
          <button type="button" className="icon-button icon-button--danger" onClick={() => removeResource(resource.key)} aria-label="Remove resource">
            ✕
          </button>
        </div>
      </div>

      <div className="card__grid">
        <label className="field">
          <span className="field__label">Name</span>
          <input type="text" value={resource.name} onChange={(e) => handleNameChange(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Id</span>
          <input type="text" value={resource.id} onChange={(e) => handleIdChange(e.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Type</span>
          <select value={resource.type} onChange={(e) => updateResource(resource.key, { type: e.target.value as ResourceKind })}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={resource.required}
            onChange={(e) => updateResource(resource.key, { required: e.target.checked })}
          />
          <span>Required</span>
        </label>

        {resource.type === "hardware" && (
          <>
            <label className="field">
              <span className="field__label">Quantity</span>
              <input
                type="number"
                min="0"
                value={resource.quantity}
                onChange={(e) => updateResource(resource.key, { quantity: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">Unit</span>
              <input
                type="text"
                value={resource.unit}
                onChange={(e) => updateResource(resource.key, { unit: e.target.value })}
                placeholder="pcs"
              />
            </label>
          </>
        )}

        <label className="field field--wide">
          <span className="field__label">Source</span>
          <input
            type="text"
            value={resource.source}
            onChange={(e) => updateResource(resource.key, { source: e.target.value })}
            placeholder="URL, store name, or package registry"
          />
        </label>
      </div>

      <div className="sub-section">
        <span className="field__label">Substitutes</span>
        {resource.substitutes.map((sub) => (
          <div className="repeatable-list__row" key={sub.key}>
            <input
              type="text"
              value={sub.name}
              onChange={(e) => updateSub(sub.key, { name: e.target.value })}
              placeholder="substitute name"
            />
            <input
              type="text"
              value={sub.note}
              onChange={(e) => updateSub(sub.key, { note: e.target.value })}
              placeholder="note (optional)"
            />
            <button type="button" className="icon-button" onClick={() => removeSub(sub.key)} aria-label="Remove substitute">
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="link-button" onClick={addSub}>
          + Add substitute
        </button>
      </div>
    </div>
  );
}
