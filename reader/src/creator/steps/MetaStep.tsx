import { useCreatorStore } from "../store";
import { slugify } from "../slug";

const KIND_OPTIONS = ["software", "hardware", "hybrid", "process"] as const;

export function MetaStep() {
  const meta = useCreatorStore((s) => s.draft.meta);
  const updateMeta = useCreatorStore((s) => s.updateMeta);

  const handleTitleChange = (title: string) => {
    updateMeta(meta.idManual ? { title } : { title, id: slugify(title) });
  };

  const handleIdChange = (raw: string) => {
    const id = slugify(raw);
    if (id === "") {
      updateMeta({ id: slugify(meta.title), idManual: false });
    } else {
      updateMeta({ id, idManual: true });
    }
  };

  const handleAuthorChange = (index: number, value: string) => {
    const authors = [...meta.authors];
    authors[index] = value;
    updateMeta({ authors });
  };

  const addAuthor = () => updateMeta({ authors: [...meta.authors, ""] });
  const removeAuthor = (index: number) =>
    updateMeta({ authors: meta.authors.filter((_, i) => i !== index) });

  return (
    <div className="creator-step">
      <h2>Meta</h2>
      <p className="creator-step__hint">Identity and authorship for this build.</p>

      <label className="field">
        <span className="field__label">Title</span>
        <input
          type="text"
          value={meta.title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="How to have unlimited octopuses"
          autoFocus
        />
      </label>

      <label className="field">
        <span className="field__label">
          id <span className="field__label-note">(editable)</span>
        </span>
        <input type="text" value={meta.id} onChange={(e) => handleIdChange(e.target.value)} />
      </label>

      <label className="field">
        <span className="field__label">Kind</span>
        <select value={meta.kind} onChange={(e) => updateMeta({ kind: e.target.value as typeof meta.kind })}>
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">Version</span>
        <input type="text" value={meta.version} onChange={(e) => updateMeta({ version: e.target.value })} />
      </label>

      <div className="field">
        <span className="field__label">Authors</span>
        <div className="repeatable-list">
          {meta.authors.map((author, i) => (
            <div className="repeatable-list__row" key={i}>
              <input
                type="text"
                value={author}
                onChange={(e) => handleAuthorChange(i, e.target.value)}
                placeholder="author name"
              />
              <button type="button" className="icon-button" onClick={() => removeAuthor(i)} aria-label="Remove author">
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="link-button" onClick={addAuthor}>
            + Add author
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field__label">License</span>
        <input type="text" value={meta.license} onChange={(e) => updateMeta({ license: e.target.value })} placeholder="MIT" />
      </label>

      <label className="field">
        <span className="field__label">Description</span>
        <textarea
          value={meta.description}
          onChange={(e) => updateMeta({ description: e.target.value })}
          rows={4}
        />
      </label>
    </div>
  );
}
