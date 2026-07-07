import { useCallback, useState } from "react";
import "./App.css";
import { loadAtsx, markStep, pickAtsxFile } from "./api";
import type { AtsxStatus, StepStatus } from "./types";
import { ResourcesView } from "./views/ResourcesView";
import { ProcessView } from "./views/ProcessView";
import { StateView } from "./views/StateView";

type Tab = "state" | "process" | "resources";

function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [status, setStatus] = useState<AtsxStatus | null>(null);
  const [tab, setTab] = useState<Tab>("state");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  const openFile = useCallback(async () => {
    setError(null);
    let path: string | null;
    try {
      path = await pickAtsxFile();
    } catch (e) {
      setError(String(e));
      return;
    }
    if (!path) return;

    setLoading(true);
    try {
      const data = await loadAtsx(path);
      setFilePath(path);
      setStatus(data);
      setTab("state");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMark = useCallback(
    async (stepId: string, next: StepStatus) => {
      if (!filePath) return;
      setMarking(stepId);
      setError(null);
      try {
        const data = await markStep(filePath, stepId, next);
        setStatus(data);
      } catch (e) {
        setError(String(e));
      } finally {
        setMarking(null);
      }
    },
    [filePath],
  );

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__title">
          <span className="app-header__logo">ATLAS</span>
          {status && (
            <span className="app-header__build">
              {status.meta.title} · v{status.meta.version}
            </span>
          )}
        </div>
        <button className="open-button" onClick={openFile} disabled={loading}>
          {loading ? "Opening…" : "Open .atsx file"}
        </button>
      </header>

      {error && (
        <div className="banner banner--error">
          <p>{error}</p>
          <button className="banner__dismiss" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {!status ? (
        <div className="empty-state empty-state--main">
          <p>Open a .atsx file to see its resources, process, and progress.</p>
        </div>
      ) : (
        <>
          <nav className="tab-bar">
            <button className={`tab${tab === "state" ? " tab--active" : ""}`} onClick={() => setTab("state")}>
              State
            </button>
            <button className={`tab${tab === "process" ? " tab--active" : ""}`} onClick={() => setTab("process")}>
              Process
            </button>
            <button className={`tab${tab === "resources" ? " tab--active" : ""}`} onClick={() => setTab("resources")}>
              Resources
            </button>
          </nav>
          <main className="app-main">
            {tab === "state" && <StateView status={status} />}
            {tab === "process" && <ProcessView status={status} onMark={handleMark} marking={marking} />}
            {tab === "resources" && <ResourcesView resources={status.resources} />}
          </main>
        </>
      )}
    </div>
  );
}

export default App;
