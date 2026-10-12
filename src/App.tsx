import { useCallback, useEffect, useRef, useState } from 'react';
import { DevelopPanel } from './components/DevelopPanel';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { LibraryPanel } from './components/LibraryPanel';
import { TopBar } from './components/TopBar';
import { Viewer } from './components/Viewer';
import { ACCEPTED_FILE_TYPES } from './decode/fileTypes';
import type { Capability } from './platform/capabilities';
import { usePhotoSession } from './photos/usePhotoSession';

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
  const [dragging, setDragging] = useState(false);
  const closeDiagnostics = useCallback(() => setShowDiagnostics(false), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const session = usePhotoSession();

  const openFiles = useCallback(() => fileInput.current?.click(), []);

  // Left/right arrow keys move between opened photos.
  const { selectRelative } = session;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey) return;
      if (event.key === 'ArrowRight') selectRelative(1);
      if (event.key === 'ArrowLeft') selectRelative(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectRelative]);

  const layoutClass = [
    'workspace',
    showLibrary ? 'with-library' : '',
    showDevelop ? 'with-develop' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const file = session.selected?.file;

  return (
    <div
      className={`app${dragging ? ' app-dragging' : ''}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        session.addFiles(event.dataTransfer.files);
      }}
    >
      <TopBar
        showLibrary={showLibrary}
        showDevelop={showDevelop}
        onToggleLibrary={() => setShowLibrary((v) => !v)}
        onToggleDevelop={() => setShowDevelop((v) => !v)}
        onOpenDiagnostics={() => setShowDiagnostics(true)}
      />
      <div className={layoutClass}>
        {showLibrary && (
          <LibraryPanel
            photos={session.photos}
            selectedId={session.selected?.id}
            rejected={session.rejected}
            onOpenFiles={openFiles}
            onSelect={session.select}
          />
        )}
        <Viewer
          current={session.current}
          fileName={file?.name}
          fileSize={file?.size}
          onOpenFiles={openFiles}
        />
        {showDevelop && (
          <DevelopPanel current={session.current} fileName={file?.name} fileSize={file?.size} />
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES}
        hidden
        data-testid="file-input"
        onChange={(event) => {
          if (event.target.files) session.addFiles(event.target.files);
          event.target.value = ''; // allow re-opening the same file
        }}
      />

      {dragging && <div className="drop-hint">Drop photos to open them</div>}
      {showDiagnostics && (
        <DiagnosticsPanel onClose={closeDiagnostics} detect={detectCapabilities} />
      )}
    </div>
  );
}
