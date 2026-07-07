import { useMemo, useState } from "react";
import type { Resource } from "../types";

interface ResourceNode extends Resource {
  children: ResourceNode[];
}

// README §4.3: resources are always a flat list; subassemblies nest via
// `part_of`, not array nesting. Rebuild the tree client-side, as the spec
// says readers should.
function buildTree(resources: Resource[]): ResourceNode[] {
  const nodes = new Map<string, ResourceNode>();
  resources.forEach((r) => nodes.set(r.id, { ...r, children: [] }));
  const roots: ResourceNode[] = [];
  nodes.forEach((node) => {
    const parent = node.part_of ? nodes.get(node.part_of) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export function ResourcesView({ resources }: { resources: Resource[] }) {
  const tree = useMemo(() => buildTree(resources), [resources]);

  if (resources.length === 0) {
    return <p className="empty-state">No resources declared.</p>;
  }

  return (
    <div className="resource-list">
      {tree.map((node) => (
        <ResourceRow key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}

function ResourceRow({ node, depth }: { node: ResourceNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const [subsOpen, setSubsOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const hasSubs = node.substitutes.length > 0;

  return (
    <div className="resource-row" style={{ marginLeft: depth * 24 }}>
      <div className={`resource-card${node.required ? "" : " resource-card--optional"}`}>
        <div className="resource-card__main">
          {hasChildren ? (
            <button className="disclosure" onClick={() => setExpanded((v) => !v)} aria-label="Toggle sub-assembly">
              {expanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="disclosure disclosure--spacer" />
          )}
          <span className={`resource-type resource-type--${node.type}`}>{node.type}</span>
          <span className="resource-name">{node.name}</span>
          {node.quantity != null && (
            <span className="resource-qty">
              {node.quantity} {node.unit}
            </span>
          )}
          {!node.required && <span className="badge badge--optional">optional</span>}
        </div>
        {(node.bundle || node.source) && (
          <div className="resource-card__meta">
            {node.bundle && <span>bundled: {node.bundle}</span>}
            {node.source && <span>source: {node.source}</span>}
          </div>
        )}
        {hasSubs && (
          <div className="resource-card__substitutes">
            <button className="link-button" onClick={() => setSubsOpen((v) => !v)}>
              {subsOpen ? "Hide" : "Show"} {node.substitutes.length} substitute{node.substitutes.length > 1 ? "s" : ""}
            </button>
            {subsOpen && (
              <ul className="substitute-list">
                {node.substitutes.map((s, i) => (
                  <li key={i}>
                    <strong>{s.name}</strong>
                    {s.note && <span className="substitute-note"> — {s.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="resource-children">
          {node.children.map((child) => (
            <ResourceRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
