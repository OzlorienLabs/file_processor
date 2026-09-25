import {
  Camera,
  Check,
  Copy,
  Download,
  FileDown,
  FileUp,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { RegionFields } from '../../components/RegionSelect/RegionFields';
import { RegionSelect } from '../../components/RegionSelect/RegionSelect';
import { ToolMark } from '../../components/ToolMark/ToolMark';
import { getCaptureStore, type CaptureRecord, type CaptureStore } from '../../lib/capture-history';
import { downloadBlob } from '../../lib/download';
import { formatBytes } from '../../lib/files';
import type { Region } from '../../lib/region';
import {
  browserCaptureEnvironment,
  CaptureCancelledError,
  startCapture,
  type Capture,
  type CaptureEnvironment,
} from '../../lib/screen-capture';
import {
  isCaptureSupported,
  type CaptureArea,
  type CaptureSurface,
} from '../../lib/screen-recording';
import {
  blobToCaptureData,
  captureFrame,
  copyImageToClipboard,
  dataUrlToBlob,
  getImageBlobFromPasteEvent,
  readImageFromClipboard,
  screenshotFileName,
} from '../../lib/screenshot';

const SURFACES: { value: CaptureSurface; label: string; note: string }[] = [
  { value: 'monitor', label: 'Entire screen', note: 'everything on your display' },
  { value: 'window', label: 'Window', note: 'a single app or window' },
  { value: 'browser', label: 'Browser tab', note: 'just this or another tab' },
];

const AREAS: { value: CaptureArea; label: string; note: string }[] = [
  { value: 'full', label: 'All of it', note: 'capture the complete frame' },
  { value: 'region', label: 'Part of it', note: 'crop to any chosen rectangle' },
];

const STARTING_REGION: Region = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };

export interface ScreenCaptureWorkspaceProps {
  env?: CaptureEnvironment;
  store?: CaptureStore;
}

export type CapturePhase = 'idle' | 'starting' | 'selecting' | 'countdown' | 'viewing';

export function ScreenCaptureWorkspace({
  env = browserCaptureEnvironment(),
  store = getCaptureStore(),
}: ScreenCaptureWorkspaceProps) {
  const canCapture = useMemo(() => isCaptureSupported(), []);
  const [tab, setTab] = useState<'capture' | 'history'>('capture');

  // Capture settings
  const [surface, setSurface] = useState<CaptureSurface>('monitor');
  const [area, setArea] = useState<CaptureArea>('full');
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [quality, setQuality] = useState(0.92);
  const [delay, setDelay] = useState<0 | 3>(0);
  const [region, setRegion] = useState<Region>(STARTING_REGION);

  // Stream & preview state
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [capture, setCapture] = useState<Capture | undefined>(undefined);
  const [frameDimensions, setFrameDimensions] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const [countdown, setCountdown] = useState(0);

  // History & Active Capture
  const [history, setHistory] = useState<CaptureRecord[]>([]);
  const [search, setSearch] = useState('');
  const [activeCapture, setActiveCapture] = useState<CaptureRecord | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [confirmClear, setConfirmClear] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load history records from store
  const refreshHistory = useCallback(async () => {
    try {
      const records = await store.list();
      setHistory(records);
    } catch {
      // Ignore history failure
    }
  }, [store]);

  useEffect(() => {
    let active = true;
    store
      .list()
      .then((records) => {
        if (active) setHistory(records);
      })
      .catch(() => {
        // Ignore initial history failure
      });
    return () => {
      active = false;
    };
  }, [store]);

  // Clean up any ongoing timer on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const stopActiveStream = useCallback(() => {
    if (capture) {
      capture.stop();
      setCapture(undefined);
    }
  }, [capture]);

  const handleStreamEnded = useCallback(() => {
    stopActiveStream();
    setPhase((prev) => (prev === 'selecting' || prev === 'countdown' ? 'idle' : prev));
  }, [stopActiveStream]);

  // Start screen share picker
  const startStream = async () => {
    stopActiveStream();
    setActiveCapture(undefined);
    setMessage(undefined);
    setPhase('starting');
    try {
      const cap = await startCapture(
        {
          surface,
          area,
          fps: 30,
          quality: 'high',
          format: 'webm',
          systemAudio: false,
          microphone: false,
          cursor: true,
          countdown: false,
        },
        env,
      );

      const videoTrack = cap.display.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener('ended', handleStreamEnded);
        const settings = videoTrack.getSettings();
        if (settings.width && settings.height) {
          setFrameDimensions({ width: settings.width, height: settings.height });
        }
      }

      setCapture(cap);
      setPhase('selecting');
    } catch (err) {
      if (err instanceof CaptureCancelledError) {
        setMessage('Selection was cancelled. Choose a screen or window when ready.');
      } else {
        setMessage((err as Error)?.message || 'Could not start screen sharing.');
      }
      setPhase('idle');
    }
  };

  // Helper to import an image blob directly into history and display it
  const importImageBlob = useCallback(
    async (blob: Blob, successNotice: string) => {
      try {
        const imageInfo = await blobToCaptureData(blob);
        const filename = screenshotFileName(imageInfo.format);
        const record = await store.save({
          name: filename,
          format: imageInfo.format,
          width: imageInfo.width,
          height: imageInfo.height,
          sizeBytes: imageInfo.sizeBytes,
          dataUrl: imageInfo.dataUrl,
        });

        stopActiveStream();
        setActiveCapture(record);
        setPhase('viewing');
        setMessage(successNotice);
        void refreshHistory();
      } catch (err) {
        setMessage((err as Error)?.message || 'Could not process clipboard image.');
      }
    },
    [store, stopActiveStream, refreshHistory],
  );

  // Copy from clipboard button action
  const copyFromClipboard = async () => {
    setMessage(undefined);
    try {
      const blob = await readImageFromClipboard();
      await importImageBlob(blob, 'Image copied from clipboard and saved to history.');
    } catch (err) {
      setMessage((err as Error)?.message || 'No image found on system clipboard.');
    }
  };

  // Listen for global Cmd+V / Ctrl+V paste containing an image
  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const blob = getImageBlobFromPasteEvent(event);
      if (blob) {
        event.preventDefault();
        void importImageBlob(blob, 'Image pasted from clipboard and saved to history.');
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [importImageBlob]);

  // Execute snapshot grab
  const executeSnap = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const snap = await captureFrame(video, {
        region: area === 'region' ? region : undefined,
        format,
        quality,
        frameWidth: video.videoWidth || frameDimensions.width,
        frameHeight: video.videoHeight || frameDimensions.height,
      });

      const filename = screenshotFileName(format);
      const record = await store.save({
        name: filename,
        format,
        width: snap.width,
        height: snap.height,
        sizeBytes: snap.sizeBytes,
        dataUrl: snap.dataUrl,
      });

      stopActiveStream();
      setActiveCapture(record);
      setPhase('viewing');
      void refreshHistory();
    } catch (err) {
      setMessage((err as Error)?.message || 'Failed to capture screenshot.');
      setPhase('selecting');
    }
  }, [area, region, format, quality, frameDimensions, store, stopActiveStream, refreshHistory]);

  // Trigger snapshot (or countdown if delay > 0)
  const takeSnapshot = () => {
    if (delay > 0) {
      setPhase('countdown');
      setCountdown(delay);
      let remaining = delay;
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          setCountdown(0);
          void executeSnap();
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    } else {
      void executeSnap();
    }
  };

  const cancelCountdown = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(0);
    setPhase('selecting');
  };

  // Download active screenshot
  const downloadActive = () => {
    if (!activeCapture) return;
    const blob = dataUrlToBlob(activeCapture.dataUrl);
    downloadBlob(blob, activeCapture.name);
  };

  // Copy active screenshot to clipboard
  const copyActive = async () => {
    if (!activeCapture) return;
    try {
      const blob = dataUrlToBlob(activeCapture.dataUrl);
      await copyImageToClipboard(blob);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      setMessage((err as Error)?.message || 'Failed to copy to clipboard.');
    }
  };

  // Delete active screenshot
  const deleteActive = async () => {
    if (!activeCapture) return;
    await store.remove(activeCapture.id);
    setActiveCapture(undefined);
    setPhase('idle');
    void refreshHistory();
  };

  // Clear all history
  const handleClearHistory = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    await store.clear();
    setConfirmClear(false);
    if (activeCapture) {
      setActiveCapture(undefined);
      setPhase('idle');
    }
    void refreshHistory();
  };

  // Export history JSON
  const handleExportJson = async () => {
    const json = await store.exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, `filekit-captures-${new Date().toISOString().slice(0, 10)}.json`);
  };

  // Import history JSON
  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text();
      const res = await store.importJson(text);
      setMessage(`Imported ${res.imported} captures (${res.skipped} skipped).`);
      void refreshHistory();
    } catch (err) {
      setMessage((err as Error)?.message || 'Failed to import backup.');
    }
  };

  const filteredHistory = history.filter((item) =>
    item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const liveVideo = (
    <video
      ref={(node) => {
        videoRef.current = node;
        if (node && capture?.display && node.srcObject !== capture.display) {
          node.srcObject = capture.display;
        }
      }}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (v.videoWidth && v.videoHeight) {
          setFrameDimensions({ width: v.videoWidth, height: v.videoHeight });
        }
      }}
      autoPlay
      playsInline
      muted
      className="recorder-video"
      aria-label="Screen video feed"
    />
  );

  return (
    <div className="ed-grid screen-capture" data-panes="side">
      {/* Sidebar: Mode Tabs & Options */}
      <aside className="ed-pane g side-list" data-pad="true" aria-label="Screen capture settings and history">
        <div className="capture-tab-nav" role="tablist" aria-label="Capture modes">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'capture'}
            className={`button ${tab === 'capture' ? 'button-primary' : 'button-secondary'}`}
            onClick={() => {
              setTab('capture');
              if (phase === 'viewing') {
                stopActiveStream();
                setActiveCapture(undefined);
                setPhase('idle');
              }
            }}
          >
            Capture
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'history'}
            className={`button ${tab === 'history' ? 'button-primary' : 'button-secondary'}`}
            onClick={() => {
              setTab('history');
              setConfirmClear(false);
            }}
          >
            History {history.length > 0 ? `(${history.length})` : ''}
          </button>
        </div>

        {tab === 'capture' ? (
          <>
            <fieldset className="flow-options" disabled={phase === 'starting' || phase === 'countdown'}>
              <legend>What to capture</legend>
              {SURFACES.map((opt) => (
                <label className="flow-option ctl" key={opt.value}>
                  <input
                    type="radio"
                    name="capture-surface"
                    checked={surface === opt.value}
                    onChange={() => setSurface(opt.value)}
                  />
                  <span className="flow-radio" aria-hidden="true" />
                  <span className="flow-option-label">{opt.label}</span>
                  <span className="flow-option-note">{opt.note}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="flow-options" disabled={phase === 'starting' || phase === 'countdown'}>
              <legend>Area</legend>
              {AREAS.map((opt) => (
                <label className="flow-option ctl" key={opt.value}>
                  <input
                    type="radio"
                    name="capture-area"
                    checked={area === opt.value}
                    onChange={() => setArea(opt.value)}
                  />
                  <span className="flow-radio" aria-hidden="true" />
                  <span className="flow-option-label">{opt.label}</span>
                  <span className="flow-option-note">{opt.note}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="flow-options" disabled={phase === 'starting' || phase === 'countdown'}>
              <legend>Format</legend>
              <label className="flow-option ctl">
                <input
                  type="radio"
                  name="capture-format"
                  checked={format === 'png'}
                  onChange={() => setFormat('png')}
                />
                <span className="flow-radio" aria-hidden="true" />
                <span className="flow-option-label">PNG</span>
                <span className="flow-option-note">lossless & crisp</span>
              </label>
              <label className="flow-option ctl">
                <input
                  type="radio"
                  name="capture-format"
                  checked={format === 'jpeg'}
                  onChange={() => setFormat('jpeg')}
                />
                <span className="flow-radio" aria-hidden="true" />
                <span className="flow-option-label">JPEG</span>
                <span className="flow-option-note">smaller compressed size</span>
              </label>
            </fieldset>

            {format === 'jpeg' && (
              <div className="gif-trim">
                <div className="gif-trim-row">
                  <span>JPEG Quality</span>
                  <input
                    type="range"
                    min="30"
                    max="100"
                    step="5"
                    value={Math.round(quality * 100)}
                    onChange={(e) => setQuality(Number(e.target.value) / 100)}
                  />
                  <strong>{Math.round(quality * 100)}%</strong>
                </div>
              </div>
            )}

            <fieldset className="flow-options" disabled={phase === 'starting' || phase === 'countdown'}>
              <legend>Timer</legend>
              <label className="flow-option ctl">
                <input
                  type="radio"
                  name="capture-delay"
                  checked={delay === 0}
                  onChange={() => setDelay(0)}
                />
                <span className="flow-radio" aria-hidden="true" />
                <span className="flow-option-label">Immediate</span>
                <span className="flow-option-note">snap when clicked</span>
              </label>
              <label className="flow-option ctl">
                <input
                  type="radio"
                  name="capture-delay"
                  checked={delay === 3}
                  onChange={() => setDelay(3)}
                />
                <span className="flow-radio" aria-hidden="true" />
                <span className="flow-option-label">3 seconds</span>
                <span className="flow-option-note">countdown before snap</span>
              </label>
            </fieldset>

            {(phase === 'idle' || phase === 'viewing') && (
              <div className="capture-start-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={startStream}
                  disabled={!canCapture}
                >
                  <Camera size={16} /> Choose screen to capture
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={copyFromClipboard}
                  title="Copy an image from system clipboard into history"
                >
                  <Copy size={16} /> Copy from clipboard
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* History Search with cleanly aligned suffix icon */}
            <label className="field-label" htmlFor="capture-search">
              <span className="sr-only">Search captures</span>
              <span className="input-with-suffix">
                <input
                  id="capture-search"
                  type="search"
                  placeholder="Search captures…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search capture history"
                />
                <Search size={15} aria-hidden="true" />
              </span>
            </label>

            {filteredHistory.length === 0 ? (
              <p className="hint">No captures saved yet.</p>
            ) : (
              <ul aria-label="Saved captures list">
                {filteredHistory.map((item) => {
                  const isCurrent = activeCapture?.id === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="capture-history-row"
                        aria-current={isCurrent}
                        onClick={() => {
                          setActiveCapture(item);
                          setPhase('viewing');
                        }}
                      >
                        <img src={item.dataUrl} alt="" className="capture-history-thumb" />
                        <div className="capture-history-info">
                          <strong>{item.name}</strong>
                          <small>
                            {item.width} × {item.height} · {formatBytes(item.sizeBytes)} · {item.format.toUpperCase()}
                          </small>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="capture-actions-footer">
              <div className="capture-actions-row">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={handleExportJson}
                  disabled={history.length === 0}
                  title="Export history backup JSON"
                >
                  <FileDown size={14} /> Export
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  title="Import backup JSON"
                >
                  <FileUp size={14} /> Import
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportJson(file);
                    e.target.value = '';
                  }}
                />
              </div>

              {history.length > 0 && (
                <button
                  type="button"
                  className={`button ${confirmClear ? 'button-danger' : 'button-secondary'}`}
                  onClick={handleClearHistory}
                >
                  <Trash2 size={14} />
                  {confirmClear ? 'Confirm clear all?' : 'Clear history'}
                </button>
              )}
            </div>
          </>
        )}
      </aside>

      {/* Main Workspace Stage */}
      <section className="ed-pane g capture-main" aria-label="Screen capture preview and stage">
        <header className="ed-head">
          <h2>
            {phase === 'viewing' && activeCapture
              ? activeCapture.name
              : phase === 'selecting' || phase === 'countdown'
              ? 'Ready to snap screenshot'
              : 'Screen capture'}
          </h2>
          <div className="ed-head-meta">
            {phase === 'viewing' && activeCapture && (
              <>
                <span className="badge">{activeCapture.format.toUpperCase()}</span>
                <span className="badge">{activeCapture.width} × {activeCapture.height}</span>
                <span className="badge">{formatBytes(activeCapture.sizeBytes)}</span>
              </>
            )}
            {phase === 'selecting' && (
              <span className="badge">
                {frameDimensions.width} × {frameDimensions.height}
              </span>
            )}
          </div>
        </header>

        {message && (
          <p className="recorder-message banner" role="status">
            {message}
          </p>
        )}

        {/* Center interactive stage */}
        <div className="recorder-stage">
          {!canCapture ? (
            <div className="recorder-empty">
              <span className="flow-drop-mark" aria-hidden="true">
                <ToolMark tool="screen-capture" />
              </span>
              <strong>Screen capture is not available here</strong>
              <p>
                This browser doesn&apos;t support the screen sharing API required to capture screenshots.
                Use a desktop browser like Chrome, Edge, Firefox, or Safari.
              </p>
            </div>
          ) : phase === 'idle' ? (
            <div className="recorder-empty">
              <span className="flow-drop-mark drift" aria-hidden="true">
                <ToolMark tool="screen-capture" />
              </span>
              <strong>Capture your screen</strong>
              <p>
                Take a high-resolution screenshot of your entire screen, an application window, or a browser tab.
                Crop to any custom area and save as PNG or JPEG.
              </p>
              <div className="capture-empty-actions">
                <button type="button" className="button button-primary" onClick={startStream}>
                  <Camera size={16} /> Choose what to capture
                </button>
                <button type="button" className="button button-secondary" onClick={copyFromClipboard}>
                  <Copy size={16} /> Copy from clipboard
                </button>
              </div>
            </div>
          ) : phase === 'starting' ? (
            <div className="recorder-empty">
              <span className="flow-drop-mark drift" aria-hidden="true">
                <ToolMark tool="screen-capture" />
              </span>
              <strong>Waiting for screen selection…</strong>
              <p>Pick a display, window, or tab from the system prompt to continue.</p>
            </div>
          ) : (phase === 'selecting' || phase === 'countdown') ? (
            area === 'region' ? (
              <RegionSelect
                frameWidth={frameDimensions.width}
                frameHeight={frameDimensions.height}
                region={region}
                onChange={setRegion}
                label="Area to capture"
              >
                {liveVideo}
                {phase === 'countdown' && <span className="recorder-count">{countdown}</span>}
              </RegionSelect>
            ) : (
              <div className="recorder-live">
                {liveVideo}
                {phase === 'countdown' && <span className="recorder-count">{countdown}</span>}
              </div>
            )
          ) : phase === 'viewing' && activeCapture ? (
            <div className="recorder-live">
              <img
                src={activeCapture.dataUrl}
                alt={activeCapture.name}
                className="recorder-video"
                style={{ objectFit: 'contain' }}
              />
            </div>
          ) : null}
        </div>

        {/* Region input fields if cropping is active during live stream */}
        {(phase === 'selecting' || phase === 'countdown') && area === 'region' && (
          <div className="recorder-region">
            <RegionFields
              frameWidth={frameDimensions.width}
              frameHeight={frameDimensions.height}
              region={region}
              onChange={setRegion}
            />
          </div>
        )}

        {/* Bottom Actions Bar */}
        <div className="recorder-bar">
          {(phase === 'selecting' || phase === 'countdown') && (
            <>
              {phase === 'countdown' ? (
                <button type="button" className="button button-secondary" onClick={cancelCountdown}>
                  <X size={16} /> Cancel countdown
                </button>
              ) : (
                <button type="button" className="button button-primary" onClick={takeSnapshot}>
                  <Camera size={16} /> Snap screenshot
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  stopActiveStream();
                  setPhase('idle');
                }}
              >
                <X size={16} /> Stop sharing
              </button>
            </>
          )}

          {phase === 'viewing' && activeCapture && (
            <>
              <button type="button" className="button button-primary" onClick={downloadActive}>
                <Download size={16} /> Download {activeCapture.format.toUpperCase()}
              </button>
              <button type="button" className="button button-secondary" onClick={copyActive}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied to clipboard!' : 'Copy to clipboard'}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  stopActiveStream();
                  setActiveCapture(undefined);
                  setTab('capture');
                  setPhase('idle');
                }}
              >
                <Camera size={16} /> Capture again
              </button>
              <button type="button" className="button button-secondary" onClick={deleteActive} title="Delete capture">
                <Trash2 size={16} /> Delete
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
