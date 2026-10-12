import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { backupFileName, makeBackup, parseBackup, planRestore } from './catalog/backup';
import { applyFilter, DEFAULT_FILTER, type LibraryFilter } from './catalog/filters';
import { applyPreset, presetSettings, type Preset } from './catalog/presets';
import { COLOR_LABELS, type CatalogPhoto, type PhotoChanges } from './catalog/types';
import { useCatalog } from './catalog/useCatalog';
import { BASE_CONTRAST } from './color/colorSpaces';
import { backupIsDue, markBackedUp } from './catalog/backupReminder';
import { BackupMenu } from './components/BackupMenu';
import { CropPanel } from './components/CropPanel';
import { DevelopPanel } from './components/DevelopPanel';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { ExportDialog, type ExportOutput } from './components/ExportDialog';
import { GroupDialog } from './components/GroupDialog';
import { PresetsSection } from './components/PresetsSection';
import { FilterBar } from './components/FilterBar';
import { ImportStatus } from './components/ImportStatus';
import { InfoPanel } from './components/InfoPanel';
import { LibraryGrid } from './components/LibraryGrid';
import { LibraryPanel } from './components/LibraryPanel';
import { PhotoMeta } from './components/PhotoMeta';
import { TopBar, type Module } from './components/TopBar';
import { Viewer, type Exporter } from './components/Viewer';
import { ACCEPTED_FILE_TYPES } from './decode/fileTypes';
import { developParams } from './develop/developMath';
import { cropPixelSize, frameSize, isDefaultGeometry, type Geometry } from './develop/geometry';
import { DEFAULT_RECIPE, type Recipe } from './develop/recipe';
import {
  applyGroups,
  DEFAULT_COPY_GROUPS,
  type CopiedSettings,
  type SettingsGroup,
} from './develop/settingsGroups';
import { useDevelop } from './develop/useDevelop';
import { exportPhotos } from './export/batchExport';
import { exportFileName, type ExportSettings } from './export/exportSettings';
import { withDevelopedPhoto } from './export/offscreen';
import { renderThumbnail } from './export/thumbnails';
import type { Capability } from './platform/capabilities';
import { usePhotoLoader } from './photos/usePhotoLoader';
import type { Histogram } from './render/histogram';

/** Below this width (e.g. iPad in portrait) the library panel starts hidden to give the photo room. */
const NARROW_SCREEN_PX = 1024;
/** Below this width (phones) side panels float over the photo, so both start hidden. */
const PHONE_SCREEN_PX = 760;
/** Wait this long after an edit before refreshing the photo's thumbnail. */
const THUMBNAIL_DELAY_MS = 700;

interface AppProps {
  /** Injectable capability detection, used by tests. */
  detectCapabilities?: () => Promise<Capability[]>;
}

export function App({ detectCapabilities }: AppProps) {
  const [module, setModule] = useState<Module>('library');
  const [showLibrary, setShowLibrary] = useState(() => window.innerWidth >= NARROW_SCREEN_PX);
  const [showDevelop, setShowDevelop] = useState(() => window.innerWidth > PHONE_SCREEN_PX);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showingBefore, setShowingBefore] = useState(false);
  const [cropRequested, setCropRequested] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [histogram, setHistogram] = useState<Histogram>();
  const [filter, setFilter] = useState<LibraryFilter>(DEFAULT_FILTER);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopiedSettings | null>(null);
  const [copyGroups, setCopyGroups] = useState<SettingsGroup[]>(DEFAULT_COPY_GROUPS);
  const [groupDialog, setGroupDialog] = useState<'copy' | 'preset' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [backupDue, setBackupDue] = useState(backupIsDue);
  const exporterRef = useRef<Exporter>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const closeDiagnostics = useCallback(() => setShowDiagnostics(false), []);

  const catalog = useCatalog();
  const allPhotos = useMemo(() => catalog.photos ?? [], [catalog.photos]);
  const visible = useMemo(() => applyFilter(allPhotos, filter), [allPhotos, filter]);
  const activePhoto = allPhotos.find((p) => p.id === activeId) ?? null;
  const selectedPhotos = allPhotos.filter((p) => selected.has(p.id));

  // Only the Develop module decodes the full photo.
  const loader = usePhotoLoader(
    module === 'develop' ? (activePhoto?.id ?? null) : null,
    catalog.getFile,
  );
  const current = loader.current;
  const source = current?.image;

  // ---- Editing ----
  const thumbnailTimer = useRef(0);
  const { setThumbnail } = catalog;
  const refreshThumbnail = useCallback(
    (photoId: string, recipe: Recipe, baseContrast: number) => {
      window.clearTimeout(thumbnailTimer.current);
      thumbnailTimer.current = window.setTimeout(() => {
        exporterRef.current
          ?.makeThumbnail(recipe.geometry, developParams(recipe, baseContrast))
          .then((blob) => setThumbnail(photoId, blob))
          .catch(() => {
            // The photo was closed before the thumbnail was made; it updates next time.
          });
      }, THUMBNAIL_DELAY_MS);
    },
    [setThumbnail],
  );

  // RAW files get the default contrast curve; JPEGs and TIFFs are already finished images.
  const baseContrast = source?.kind === 'linear' ? BASE_CONTRAST : 0;
  const { update: updatePhotos } = catalog;
  const saveRecipe = useCallback(
    (id: string, recipe: Recipe) => {
      updatePhotos([id], { recipe, editedAt: Date.now() });
      refreshThumbnail(id, recipe, baseContrast);
    },
    [updatePhotos, refreshThumbnail, baseContrast],
  );
  const develop = useDevelop(activePhoto, saveRecipe);

  // Why the sliders are unavailable, if they are.
  const disabledReason = !current
    ? 'Choose a photo to start editing.'
    : current.isPreview
      ? 'Showing the camera preview — editing starts when the RAW is developed.'
      : current.status !== 'ready'
        ? 'Loading…'
        : undefined;
  const editable = module === 'develop' && !disabledReason;

  // Photos imported without a thumbnail (TIFF) get one once they are developed.
  const missingThumbnail = Boolean(activePhoto && !catalog.thumbnails[activePhoto.id]);
  const activeIdForThumbnail = activePhoto?.id;
  useEffect(() => {
    if (editable && missingThumbnail && activeIdForThumbnail) {
      refreshThumbnail(activeIdForThumbnail, develop.recipe, baseContrast);
    }
  }, [
    editable,
    missingThumbnail,
    activeIdForThumbnail,
    develop.recipe,
    baseContrast,
    refreshThumbnail,
  ]);

  const settings = useMemo(() => {
    if (!source || source.isPreview) return null;
    return developParams(showingBefore ? DEFAULT_RECIPE : develop.recipe, baseContrast);
  }, [source, showingBefore, develop.recipe, baseContrast]);
  // Export always uses the real edits (not the "Before" view).
  const exportDevelop = useMemo(
    () => (source ? developParams(develop.recipe, baseContrast) : null),
    [source, develop.recipe, baseContrast],
  );

  // Crop tool: only while the photo can be edited.
  const cropMode = cropRequested && editable;
  const geometry = develop.recipe.geometry;
  const frame = source ? frameSize(frameSize(source, source.rotation), geometry.rotate) : null;
  const cropSize =
    frame && !isDefaultGeometry(geometry) ? cropPixelSize(frame, geometry.crop) : undefined;
  const {
    preview: previewRecipe,
    commit: commitRecipe,
    recipe,
    remember: rememberHistory,
  } = develop;
  const previewGeometry = useCallback(
    (g: Geometry) => previewRecipe({ ...recipe, geometry: g }),
    [previewRecipe, recipe],
  );
  const commitGeometry = useCallback(
    (g: Geometry) => commitRecipe({ ...recipe, geometry: g }),
    [commitRecipe, recipe],
  );
  const toggleCrop = useCallback(() => setCropRequested((v) => !v), []);
  const toggleBefore = useCallback(() => setShowingBefore((v) => !v), []);
  const closeExport = useCallback(() => setShowExport(false), []);
  const closeGroupDialog = useCallback(() => setGroupDialog(null), []);

  // ---- Library ----
  const openFiles = useCallback(() => fileInput.current?.click(), []);
  const { importFiles: importIntoCatalog } = catalog;
  const importFiles = useCallback(
    async (files: File[]) => {
      const ids = await importIntoCatalog(files);
      if (ids.length === 0) return;
      setSelected(new Set(ids));
      setActiveId(ids[0]!);
    },
    [importIntoCatalog],
  );

  const openInDevelop = useCallback((id: string) => {
    setActiveId(id);
    setSelected(new Set([id]));
    setModule('develop');
  }, []);

  const selectInGrid = useCallback(
    (id: string, mode: 'single' | 'toggle' | 'range') => {
      setActiveId(id);
      setSelected((current) => {
        if (mode === 'single') return new Set([id]);
        if (mode === 'toggle') {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }
        // Range: from the active photo to this one, in the visible order.
        const from = visible.findIndex((p) => p.id === activeId);
        const to = visible.findIndex((p) => p.id === id);
        if (from === -1 || to === -1) return new Set([id]);
        const [a, b] = from < to ? [from, to] : [to, from];
        return new Set(visible.slice(a, b + 1).map((p) => p.id));
      });
    },
    [visible, activeId],
  );

  const moveActive = useCallback(
    (offset: number) => {
      if (visible.length === 0) return;
      const index = visible.findIndex((p) => p.id === activeId);
      const next = visible[Math.min(visible.length - 1, Math.max(0, index + offset))]!;
      setActiveId(next.id);
      setSelected(new Set([next.id]));
    },
    [visible, activeId],
  );

  /** Photos that rating/flag/label changes apply to. */
  const targetIds = useMemo(
    () =>
      module === 'library'
        ? allPhotos.filter((p) => selected.has(p.id)).map((p) => p.id)
        : activeId
          ? [activeId]
          : [],
    [module, selected, activeId, allPhotos],
  );
  const changeTargets = useCallback(
    (changes: PhotoChanges) => {
      if (targetIds.length > 0) updatePhotos(targetIds, changes);
    },
    [targetIds, updatePhotos],
  );

  /** Photos chosen for library-wide tools (paste, presets, export). */
  const toolPhotos = useMemo(
    () => allPhotos.filter((p) => targetIds.includes(p.id)),
    [allPhotos, targetIds],
  );

  // Pasted settings, presets and restores change photos that aren't open, so their
  // thumbnails are refreshed in the background, one photo at a time.
  const { getFile } = catalog;
  const refreshInBackground = useCallback(
    (photos: CatalogPhoto[]) => {
      for (const photo of photos) {
        getFile(photo.id)
          .then((file) =>
            withDevelopedPhoto(file, photo.recipe, (d) =>
              renderThumbnail(d.renderer, d.gpu, d.layout, photo.recipe.geometry, d.develop),
            ),
          )
          .then((blob) => setThumbnail(photo.id, blob))
          .catch((e: unknown) => console.error(e));
      }
    },
    [getFile, setThumbnail],
  );

  const { updateEach } = catalog;
  /** Changes the recipe of the target photos: through undo history in Develop. */
  const changeRecipes = useCallback(
    (change: (recipe: Recipe) => Recipe) => {
      if (module === 'develop') {
        if (editable) commitRecipe(change(recipe));
        return;
      }
      const now = Date.now();
      rememberHistory(toolPhotos); // so Undo in Develop can take the change back
      const updated = toolPhotos.map((p) => ({ ...p, recipe: change(p.recipe), editedAt: now }));
      updateEach(updated.map((p) => ({ id: p.id, changes: { recipe: p.recipe, editedAt: now } })));
      refreshInBackground(updated);
    },
    [
      module,
      editable,
      commitRecipe,
      recipe,
      toolPhotos,
      updateEach,
      refreshInBackground,
      rememberHistory,
    ],
  );

  const copySettings = useCallback(
    (groups: SettingsGroup[]) => {
      const source = module === 'develop' ? recipe : toolPhotos[0]?.recipe;
      if (!source) return;
      setCopyGroups(groups);
      setCopied({ recipe: source, groups });
      setGroupDialog(null);
      setNotice('Settings copied. Select photos and paste with Ctrl/⌘ Shift V.');
    },
    [module, recipe, toolPhotos],
  );

  const pasteSettings = useCallback(() => {
    if (!copied) return;
    changeRecipes((r) => applyGroups(r, copied.recipe, copied.groups));
  }, [copied, changeRecipes]);

  const applyPresetToTargets = useCallback(
    (preset: Preset) => changeRecipes((r) => applyPreset(r, preset)),
    [changeRecipes],
  );

  const { savePreset, deletePreset } = catalog;
  const saveNewPreset = useCallback(
    (groups: SettingsGroup[], name: string) => {
      void savePreset({
        id: crypto.randomUUID(),
        name,
        builtIn: false,
        ...presetSettings(recipe, groups),
        createdAt: Date.now(),
      });
      setGroupDialog(null);
    },
    [savePreset, recipe],
  );

  const removePreset = useCallback(
    (preset: Preset) => {
      if (window.confirm(`Delete the preset "${preset.name}"?`)) void deletePreset(preset.id);
    },
    [deletePreset],
  );

  const backUpLibrary = useCallback(() => {
    const text = makeBackup(allPhotos, catalog.userPresets);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    markBackedUp();
    setBackupDue(false);
    setNotice(
      `Library backup saved (${allPhotos.length} photos). Keep it with your original photos.`,
    );
  }, [allPhotos, catalog.userPresets]);

  const restoreLibrary = useCallback(
    async (file: File) => {
      try {
        const backup = parseBackup(await file.text());
        const plan = planRestore(allPhotos, backup);
        rememberHistory(allPhotos.filter((p) => plan.updates.some((u) => u.id === p.id)));
        updateEach(plan.updates);
        for (const preset of backup.presets) await savePreset(preset);
        const restoredIds = new Set(plan.updates.map((u) => u.id));
        refreshInBackground(
          allPhotos
            .filter((p) => restoredIds.has(p.id))
            .map((p) => ({ ...p, ...plan.updates.find((u) => u.id === p.id)!.changes })),
        );
        setNotice(
          `Restored ${plan.updates.length} photo${plan.updates.length === 1 ? '' : 's'}` +
            (backup.presets.length ? ` and ${backup.presets.length} presets` : '') +
            '.' +
            (plan.missing.length
              ? ` Not in the library (import them, then restore again): ${plan.missing.join(', ')}.`
              : ''),
        );
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
      }
    },
    [allPhotos, updateEach, savePreset, refreshInBackground, rememberHistory],
  );

  const runBatchExport = useCallback(
    async (
      exportSettings: ExportSettings,
      onProgress: (fraction: number, current?: string) => void,
    ): Promise<ExportOutput> => exportPhotos(toolPhotos, getFile, exportSettings, onProgress),
    [toolPhotos, getFile],
  );

  const { remove: removeFromCatalog } = catalog;
  const removeSelected = useCallback(async () => {
    const ids = targetIds;
    if (ids.length === 0) return;
    const ok = window.confirm(
      `Remove ${ids.length === 1 ? 'this photo' : `${ids.length} photos`} from the library?\n\n` +
        'The copy stored in Chitra and its edits will be deleted. Your original files on ' +
        'your camera card, computer or Files app are not affected.',
    );
    if (!ok) return;
    await removeFromCatalog(ids);
    setSelected(new Set());
    if (activeId && ids.includes(activeId)) {
      setActiveId(null);
      setModule('library');
    }
  }, [targetIds, removeFromCatalog, activeId]);

  const switchModule = useCallback(
    (next: Module) => {
      if (next === 'develop' && !activeId) return;
      setCropRequested(false);
      setModule(next);
    },
    [activeId],
  );

  // ---- Keyboard shortcuts ----
  const { undo, redo } = develop;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (command && editable && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (command && editable && key === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (command && key === 'e' && (editable || (module === 'library' && targetIds.length))) {
        event.preventDefault();
        setShowExport(true);
        return;
      }
      if (command && event.shiftKey && key === 'c' && (editable || targetIds.length === 1)) {
        event.preventDefault();
        setGroupDialog('copy');
        return;
      }
      if (command && event.shiftKey && key === 'v') {
        event.preventDefault();
        pasteSettings();
        return;
      }
      if (command && module === 'library' && key === 'a') {
        event.preventDefault();
        setSelected(new Set(visible.map((p) => p.id)));
        return;
      }
      if (cropMode && (event.key === 'Enter' || event.key === 'Escape')) {
        setCropRequested(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, select, textarea, [role="dialog"]')) return;
      if (command || event.altKey) return;

      if (/^[0-5]$/.test(key)) return changeTargets({ rating: Number(key) });
      if (/^[6-9]$/.test(key)) return changeTargets({ label: COLOR_LABELS[Number(key) - 6]! });
      if (key === 'p') return changeTargets({ flag: 'pick' });
      if (key === 'x') return changeTargets({ flag: 'reject' });
      if (key === 'u') return changeTargets({ flag: null });
      if (key === 'g') return switchModule('library');
      if (key === 'd' || (module === 'library' && event.key === 'Enter')) {
        return switchModule('develop');
      }
      if (event.key === 'ArrowRight') return moveActive(1);
      if (event.key === 'ArrowLeft') return moveActive(-1);
      if (module === 'library' && (event.key === 'Delete' || event.key === 'Backspace')) {
        void removeSelected();
        return;
      }
      if (key === 'r' && editable) setCropRequested((v) => !v);
      if (event.key === '\\' && editable) setShowingBefore((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    undo,
    redo,
    editable,
    cropMode,
    module,
    visible,
    changeTargets,
    switchModule,
    moveActive,
    removeSelected,
    targetIds,
    pasteSettings,
  ]);

  const layoutClass = [
    'workspace',
    module === 'develop' && showLibrary ? 'with-library' : '',
    showDevelop ? 'with-develop' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const metaPanel = (photos: CatalogPhoto[]) =>
    photos.length > 0 ? (
      <section className="panel-section">
        <h2 className="section-title">Rating &amp; keywords</h2>
        <PhotoMeta key={photos[0]!.id} photos={photos} onChange={changeTargets} />
      </section>
    ) : null;

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
        void importFiles([...event.dataTransfer.files]);
      }}
    >
      <TopBar
        module={module}
        onModule={switchModule}
        canDevelop={Boolean(activePhoto)}
        showLibrary={showLibrary}
        showDevelop={showDevelop}
        onToggleLibrary={() => setShowLibrary((v) => !v)}
        onToggleDevelop={() => setShowDevelop((v) => !v)}
        onOpenDiagnostics={() => setShowDiagnostics(true)}
        onExport={() => setShowExport(true)}
        canExport={editable || (module === 'library' && targetIds.length > 0)}
      />

      {module === 'library' ? (
        <div className={layoutClass}>
          <main className="library" aria-label="Library">
            <div className="library-toolbar">
              <button type="button" className="button button-primary" onClick={openFiles}>
                Import photos…
              </button>
              <FilterBar
                filter={filter}
                onChange={setFilter}
                shown={visible.length}
                total={allPhotos.length}
              />
              <BackupMenu
                onBackup={backUpLibrary}
                onRestore={(file) => void restoreLibrary(file)}
                remind={backupDue && allPhotos.length > 0}
              />
            </div>
            {catalog.error && (
              <p className="panel-warning library-error" role="alert">
                {catalog.error}
              </p>
            )}
            {catalog.photos === null ? (
              <div className="viewer-overlay-center">
                <div className="spinner" aria-hidden="true" />
              </div>
            ) : (
              <LibraryGrid
                photos={visible}
                thumbnails={catalog.thumbnails}
                selected={selected}
                activeId={activeId}
                onSelect={selectInGrid}
                onOpen={openInDevelop}
                onImport={openFiles}
                emptyBecauseFiltered={allPhotos.length > 0}
              />
            )}
          </main>
          {showDevelop && (
            <aside className="panel panel-right" aria-label="Photo details">
              {selectedPhotos.length === 0 ? (
                <p className="panel-note">Select a photo to see its details.</p>
              ) : (
                <>
                  {metaPanel(selectedPhotos)}
                  {selectedPhotos.length === 1 && (
                    <section className="panel-section">
                      <h2 className="section-title">Info</h2>
                      <InfoPanel
                        info={selectedPhotos[0]!.info}
                        fileName={selectedPhotos[0]!.name}
                        fileSize={selectedPhotos[0]!.size}
                      />
                    </section>
                  )}
                  <div className="panel-section library-actions">
                    <button type="button" className="button" onClick={() => setShowExport(true)}>
                      Export{' '}
                      {selectedPhotos.length === 1 ? 'photo' : `${selectedPhotos.length} photos`}…
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={!copied}
                      onClick={pasteSettings}
                      title="Paste copied settings (Ctrl/⌘ Shift V)"
                    >
                      Paste settings
                    </button>
                    {selectedPhotos.length === 1 && (
                      <button
                        type="button"
                        className="button"
                        onClick={() => setGroupDialog('copy')}
                      >
                        Copy settings…
                      </button>
                    )}
                    <select
                      className="preset-select"
                      aria-label="Apply preset"
                      value=""
                      onChange={(event) => {
                        const preset = catalog.presets.find((p) => p.id === event.target.value);
                        if (preset) applyPresetToTargets(preset);
                      }}
                    >
                      <option value="">Apply preset…</option>
                      {catalog.presets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {selectedPhotos.length === 1 && (
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => openInDevelop(selectedPhotos[0]!.id)}
                      >
                        Edit in Develop
                      </button>
                    )}
                    <button type="button" className="button" onClick={() => void removeSelected()}>
                      Remove from library
                    </button>
                  </div>
                </>
              )}
            </aside>
          )}
        </div>
      ) : (
        <div className={layoutClass}>
          {showLibrary && (
            <LibraryPanel
              photos={visible}
              thumbnails={catalog.thumbnails}
              activeId={activeId}
              onImport={openFiles}
              onSelect={(id) => {
                setActiveId(id);
                setSelected(new Set([id]));
              }}
            />
          )}
          <Viewer
            current={current}
            fileName={activePhoto?.name}
            fileSize={activePhoto?.size}
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
            onGpuReset={loader.reload}
          />
          {showDevelop && (
            <DevelopPanel
              histogram={current ? histogram : undefined}
              info={current?.info ?? activePhoto?.info}
              fileName={activePhoto?.name}
              fileSize={activePhoto?.size}
              develop={develop}
              disabledReason={editable ? undefined : disabledReason}
              showingBefore={showingBefore}
              onToggleBefore={toggleBefore}
              cropSize={cropSize}
              meta={activePhoto ? metaPanel([activePhoto]) : null}
              presets={
                <PresetsSection
                  presets={catalog.presets}
                  disabled={!editable}
                  canPaste={Boolean(copied)}
                  onApply={applyPresetToTargets}
                  onDelete={removePreset}
                  onSaveNew={() => setGroupDialog('preset')}
                  onCopy={() => setGroupDialog('copy')}
                  onPaste={pasteSettings}
                />
              }
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
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES}
        hidden
        data-testid="file-input"
        onChange={(event) => {
          if (event.target.files) void importFiles([...event.target.files]);
          event.target.value = ''; // allow importing the same file again
        }}
      />

      <ImportStatus
        progress={catalog.importing}
        report={catalog.report}
        onDismiss={catalog.dismissReport}
      />
      {dragging && <div className="drop-hint">Drop photos to import them</div>}
      {showExport && module === 'develop' && editable && activePhoto && frame && (
        <ExportDialog
          count={1}
          fullSize={cropPixelSize(frame, geometry.crop)}
          onClose={closeExport}
          onExport={async (exportSettings, onProgress) => {
            const exporter = exporterRef.current;
            if (!exporter) throw new Error('The viewer is not ready.');
            const result = await exporter.exportPhoto({
              geometry,
              develop: exportDevelop,
              settings: exportSettings,
              onProgress,
            });
            const file = new File(
              [result.bytes as Uint8Array<ArrayBuffer>],
              exportFileName(activePhoto.name, exportSettings.format),
              { type: result.mimeType },
            );
            return { file, files: [file], failed: [], width: result.width, height: result.height };
          }}
        />
      )}
      {showExport && module === 'library' && toolPhotos.length > 0 && (
        <ExportDialog count={toolPhotos.length} onClose={closeExport} onExport={runBatchExport} />
      )}
      {groupDialog === 'copy' && (
        <GroupDialog
          title="Copy settings"
          confirmLabel="Copy"
          initialGroups={copyGroups}
          onConfirm={(groups) => copySettings(groups)}
          onClose={closeGroupDialog}
        />
      )}
      {groupDialog === 'preset' && (
        <GroupDialog
          title="Save as preset"
          confirmLabel="Save preset"
          askName
          initialGroups={DEFAULT_COPY_GROUPS}
          disabledGroups={['geometry']}
          onConfirm={saveNewPreset}
          onClose={closeGroupDialog}
        />
      )}
      {notice && (
        <div className="toast toast-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            className="icon-button toast-close"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
          >
            ✕
          </button>
        </div>
      )}
      {showDiagnostics && (
        <DiagnosticsPanel onClose={closeDiagnostics} detect={detectCapabilities} />
      )}
    </div>
  );
}
