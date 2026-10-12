import { useCallback, useState } from 'react';
import { DevelopPanel } from './components/DevelopPanel';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { LibraryPanel } from './components/LibraryPanel';
import { TopBar } from './components/TopBar';
import { Viewer } from './components/Viewer';
import type { Capability } from './platform/capabilities';

/** Below this width (e.g. iPad in portrait) the library panel starts hidden to give the photo room. */
const NARROW_SCREEN_PX = 1024;
/** Below this width (phones) side panels float over the photo, so both start hidden. */
const PHONE_SCREEN_PX = 760;

interface AppProps {
  /** Injectable capability detection, used by tests. */
  detectCapabilities?: () => Promise<Capability[]>;
}

export function App({ detectCapabilities }: AppProps) {
  const [showLibrary, setShowLibrary] = useState(() => window.innerWidth >= NARROW_SCREEN_PX);
  const [showDevelop, setShowDevelop] = useState(() => window.innerWidth > PHONE_SCREEN_PX);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const closeDiagnostics = useCallback(() => setShowDiagnostics(false), []);

  const layoutClass = [
    'workspace',
    showLibrary ? 'with-library' : '',
    showDevelop ? 'with-develop' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="app">
      <TopBar
        showLibrary={showLibrary}
        showDevelop={showDevelop}
        onToggleLibrary={() => setShowLibrary((v) => !v)}
        onToggleDevelop={() => setShowDevelop((v) => !v)}
        onOpenDiagnostics={() => setShowDiagnostics(true)}
      />
      <div className={layoutClass}>
        {showLibrary && <LibraryPanel />}
        <Viewer />
        {showDevelop && <DevelopPanel />}
      </div>
      {showDiagnostics && (
        <DiagnosticsPanel onClose={closeDiagnostics} detect={detectCapabilities} />
      )}
    </div>
  );
}
