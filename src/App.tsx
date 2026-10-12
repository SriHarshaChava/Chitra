import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BASE_CONTRAST } from './color/colorSpaces';
import { DevelopPanel } from './components/DevelopPanel';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { LibraryPanel } from './components/LibraryPanel';
import { TopBar } from './components/TopBar';
import { Viewer } from './components/Viewer';
import { ACCEPTED_FILE_TYPES } from './decode/fileTypes';
import { CropPanel } from './components/CropPanel';
import { ExportDialog } from './components/ExportDialog';
import type { Exporter } from './components/Viewer';
import { developParams } from './develop/developMath';
import { cropPixelSize, frameSize, isDefaultGeometry, type Geometry } from './develop/geometry';
import { DEFAULT_RECIPE } from './develop/recipe';
import { photoKey } from './develop/recipeStore';
import { useDevelop } from './develop/useDevelop';
import type { Histogram } from './render/histogram';
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
  const [showingBefore, setShowingBefore] = useState(false);
  const [cropRequested, setCropRequested] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const exporterRef = useRef<Exporter>(null);
  const [histogram, setHistogram] = useState<Histogram>();
  const fileInput = useRef<HTMLInputElement>(null);
  const session = usePhotoSession();

  const file = session.selected?.file;
  const develop = useDevelop(file ? photoKey(file) : null);
  const current = session.current;
  const source = current?.image;

  // Why the sliders are unavailable, if they are.
  const disabledReason = !current
    ? 'Open a photo to start editing.'
    : current.isPreview
      ? 'Showing the camera preview — editing starts when the RAW is developed.'
      : current.status !== 'ready'
        ? 'Loading…'
        : undefined;

  // RAW files get the default contrast curve; JPEGs and TIFFs are already finished images.
  const baseContrast = source?.kind === 'linear' ? BASE_CONTRAST : 0;
  const settings = useMemo(() => {
    if (!source || source.isPreview) return null;
    return developParams(showingBefore ? DEFAULT_RECIPE : develop.recipe, baseContrast);
  }, [source, showingBefore, develop.recipe, baseContrast]);

  // Crop tool: only while the photo can be edited.
  const cropMode = cropRequested && !disabledReason;
  const geometry = develop.recipe.geometry;
  const frame = source ? frameSize(frameSize(source, source.rotation), geometry.rotate) : null;
  const cropSize =
    frame && !isDefaultGeometry(geometry) ? cropPixelSize(frame, geometry.crop) : undefined;
  const { preview: previewRecipe, commit: commitRecipe, recipe } = develop;
  const previewGeometry = useCallback(
    (g: Geometry) => previewRecipe({ ...recipe, geometry: g }),
    [previewRecipe, recipe],
  );
  const commitGeometry = useCallback(
    (g: Geometry) => commitRecipe({ ...recipe, geometry: g }),
    [commitRecipe, recipe],
  );
  const toggleCrop = useCallback(() => setCropRequested((v) => !v), []);

  const openFiles = useCallback(() => fileInput.current?.click(), []);
  const closeExport = useCallback(() => setShowExport(false), []);
  // Export always uses the real edits (not the "Before" view).
  const exportDevelop = useMemo(
    () => (source ? developParams(develop.recipe, baseContrast) : null),
    [source, develop.recipe, baseContrast],
  );
  const toggleBefore = useCallback(() => setShowingBefore((v) => !v), []);

  // Keyboard shortcuts.
  const { selectRelative } = session;
  const { undo, redo } = develop;
  const editable = !disabledReason;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && editable && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (command && editable && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        setShowExport(true);
        return;
      }
      if (command && editable && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (cropMode && (event.key === 'Enter' || event.key === 'Escape')) {
        setCropRequested(false);
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if (command) return;
      if (event.key.toLowerCase() === 'r' && editable) setCropRequested((v) => !v);
      if (event.key === 'ArrowRight') selectRelative(1);
      if (event.key === 'ArrowLeft') selectRelative(-1);
      if (event.key === '\\' && editable) setShowingBefore((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectRelative, undo, redo, editable, cropMode]);

  const layoutClass = [
    'workspace',
    showLibrary ? 'with-library' : '',
    showDevelop ? 'with-develop' : '',
  ]
    .filter(Boolean)
    .join(' ');

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
        onExport={() => setShowExport(true)}
        canExport={editable}
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
          current={current}
          fileName={file?.name}
          fileSize={file?.size}
          settings={settings}
          showingBefore={showingBefore && editable}
          geometry={geometry}
          cropMode={cropMode}
          onGeometryPreview={previewGeometry}
          onGeometryCommit={commitGeometry}
          onToggleCrop={toggleCrop}
          canCrop={editable}
          exporterRef={exporterRef}
          onOpenFiles={openFiles}
          onHistogram={setHistogram}
          onGpuReset={session.reload}
        />
        {showDevelop && (
          <DevelopPanel
            histogram={current ? histogram : undefined}
            info={current?.info}
            fileName={file?.name}
            fileSize={file?.size}
            develop={develop}
            disabledReason={disabledReason}
            showingBefore={showingBefore}
            onToggleBefore={toggleBefore}
            cropSize={cropSize}
            cropPanel={
              cropMode && frame ? (
                <CropPanel
                  geometry={geometry}
                  frame={frame}
                  onPreview={previewGeometry}
                  onCommit={commitGeometry}
                  onDone={toggleCrop}
                />
              ) : undefined
            }
          />
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
      {showExport && editable && file && frame && (
        <ExportDialog
          fileName={file.name}
          fullSize={cropPixelSize(frame, geometry.crop)}
          onClose={closeExport}
          onExport={(settings, onProgress) => {
            const exporter = exporterRef.current;
            if (!exporter) return Promise.reject(new Error('The viewer is not ready.'));
            return exporter.exportPhoto({ geometry, develop: exportDevelop, settings, onProgress });
          }}
        />
      )}
      {showDiagnostics && (
        <DiagnosticsPanel onClose={closeDiagnostics} detect={detectCapabilities} />
      )}
    </div>
  );
}
