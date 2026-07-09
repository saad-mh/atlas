import { useCallback, useState } from "react";
import "./App.css";
import "./creator/creator.css";
import { loadAtsx, markStep, pickAtsxFile } from "./api";
import type { AtsxStatus, StepStatus } from "./types";
import { ResourcesView } from "./views/ResourcesView";
import { ProcessView } from "./views/ProcessView";
import { StateView } from "./views/StateView";
import { CreatorWizard } from "./creator/CreatorWizard";
import { useCreatorStore } from "./creator/store";

type Tab = "state" | "process" | "resources";
type Mode = "landing" | "reader" | "creator";

function App() {
  const [mode, setMode] = useState<Mode>("landing");
  const [filePath, setFilePath] = useState<string | null>(null);
  const [status, setStatus] = useState<AtsxStatus | null>(null);
  const [tab, setTab] = useState<Tab>("state");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  const openFileAt = useCallback(async (path: string) => {
    setError(null);
    setLoading(true);
    try {
      const data = await loadAtsx(path);
      setFilePath(path);
      setStatus(data);
      setTab("state");
      setMode("reader");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

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
    await openFileAt(path);
  }, [openFileAt]);

  const startCreator = useCallback(() => {
    useCreatorStore.getState().reset();
    setMode("creator");
  }, []);

  const exitCreator = useCallback(() => {
    const draft = useCreatorStore.getState().draft;
    const hasContent =
      draft.meta.title.trim() !== "" ||
      draft.resources.length > 0 ||
      draft.steps.length > 0 ||
      draft.branches.length > 0;
    if (hasContent && !window.confirm("Leaving now will discard this in-progress build. Continue?")) {
      return;
    }
    useCreatorStore.getState().reset();
    setMode("landing");
  }, []);

  const openExported = useCallback(
    async (path: string) => {
      useCreatorStore.getState().reset();
      await openFileAt(path);
    },
    [openFileAt],
  );

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

  if (mode === "creator") {
    return (
      <div className="app">
        {error && (
          <div className="banner banner--error">
            <p>{error}</p>
            <button className="banner__dismiss" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        <CreatorWizard onExit={exitCreator} onOpenExported={openExported} />
      </div>
    );
  }

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
        <div className="app-header__actions">
          {mode === "reader" && (
            <button className="secondary-button" onClick={() => setMode("landing")}>
              Home
            </button>
          )}
          {mode === "reader" && (
            <button className="open-button" onClick={openFile} disabled={loading}>
              {loading ? "Opening…" : "Open .atsx file"}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="banner banner--error">
          <p>{error}</p>
          <button className="banner__dismiss" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {mode === "landing" && (
        <div className="landing">
          <p className="landing__tagline">One file in, one file out. What do you want to do?</p>
          <div className="landing__actions">
            <button type="button" className="landing__option" onClick={openFile} disabled={loading}>
              <span className="landing__option-title">{loading ? "Opening…" : "Open a .atsx"}</span>
              <span className="landing__option-desc">Load an existing build and track your progress.</span>
            </button>
            <button type="button" className="landing__option landing__option--primary" onClick={startCreator}>
              <span className="landing__option-title">Create a new .atsx</span>
              <span className="landing__option-desc">Build a manifest from scratch: meta, resources, process, branches.</span>
            </button>
          </div>
        </div>
      )}

      {mode === "reader" && status && (
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
