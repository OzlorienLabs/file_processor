import { Circle, Download, Film, MonitorUp, Pause, Play, RotateCcw, Square, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { RegionFields } from '../../components/RegionSelect/RegionFields';
import { RegionSelect } from '../../components/RegionSelect/RegionSelect';
import { ToolMark } from '../../components/ToolMark/ToolMark';
import { downloadBlob } from '../../lib/download';
import { errorMessage } from '../../lib/errors';
import { formatBytes } from '../../lib/files';
import { handOffVideo } from '../../lib/media-handoff';
import {
  browserSessionEnvironment,
  createRecordingSession,
  type RecordingSession,
} from '../../lib/recording-session';
import type { Region } from '../../lib/region';
import {
  browserCaptureEnvironment,
  CaptureCancelledError,
  composeRecordingStream,
  startCapture,
  type Capture,
  type RecordingStream,
} from '../../lib/screen-capture';
import {
  DEFAULT_RECORDER_SETTINGS,
  formatClock,
  formatFromMime,
  isCaptureSupported,
  pickMimeType,
  QUALITY_BITRATES,
  RECORDING_FRAME_RATES,
  recordingFileName,
  supportedFormats,
  type CaptureArea,
  type CaptureSurface,
  type RecorderSettings,
  type RecordingQuality,
} from '../../lib/screen-recording';

type Phase = 'idle' | 'starting' | 'selecting' | 'countdown' | 'recording' | 'paused' | 'finishing' | 'done';

interface Recording {
  file: File;
  url: string;
  durationMs: number;
}

/** Everything that must be torn down when a recording ends or the page is left. */
interface Live {
  capture?: Capture;
  composed?: RecordingStream;
  session?: RecordingSession;
  countdown?: ReturnType<typeof setTimeout>;
}

const SURFACES: Array<{ value: CaptureSurface; label: string; note: string }> = [
  { value: 'browser', label: 'Browser tab', note: 'one tab, with its sound' },
  { value: 'window', label: 'Window', note: 'one app window' },
  { value: 'monitor', label: 'Entire screen', note: 'everything you see' },
];

const AREAS: Array<{ value: CaptureArea; label: string; note: string }> = [
  { value: 'full', label: 'All of it', note: 'starts right away' },
  { value: 'region', label: 'Part of it', note: 'drag to select' },
];

const QUALITIES: Array<{ value: RecordingQuality; label: string }> = [
  { value: 'standard', label: 'Standard · 2.5 Mbps' },
  { value: 'high', label: 'High · 6 Mbps' },
  { value: 'max', label: 'Maximum · 12 Mbps' },
];

/** A centred box to start from, so "Part of it" shows a crop straight away. */
const STARTING_REGION: Region = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };

const HEADINGS: Record<Phase, string> = {
  idle: 'Ready to record',
  starting: 'Choose what to share',
  selecting: 'Drag over the picture to pick the area',
  countdown: 'Get ready…',
  recording: 'Recording',
  paused: 'Paused',
  finishing: 'Finishing the video…',
  done: 'Recording finished',
};

export function ScreenRecorderWorkspace() {
  const navigate = useNavigate();
  const support = useMemo(() => ({ capture: isCaptureSupported(), formats: supportedFormats() }), []);
  const [settings, setSettings] = useState<RecorderSettings>(() => ({
    ...DEFAULT_RECORDER_SETTINGS,
    format: support.formats[0] ?? DEFAULT_RECORDER_SETTINGS.format,
  }));
  const [phase, setPhase] = useState<Phase>('idle');
  const [region, setRegion] = useState<Region>(STARTING_REGION);
  const [preview, setPreview] = useState<MediaStream>();
  const [sourceSize, setSourceSize] = useState({ width: 1920, height: 1080 });
  const [count, setCount] = useState(0);
  const [clock, setClock] = useState({ elapsed: 0, bytes: 0 });
  const [recording, setRecording] = useState<Recording>();
  const [cropMode, setCropMode] = useState<RecordingStream['cropMode']>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const live = useRef<Live>({});

  const busy = phase !== 'idle' && phase !== 'done';
  const canRecord = support.capture && support.formats.length > 0;

  useEffect(() => {
    const state = live.current;
    return () => {
      clearTimeout(state.countdown);
      void state.session?.stop().catch(() => undefined);
      state.composed?.dispose();
      state.capture?.stop();
    };
  }, []);

  const recordingUrl = recording?.url;
  useEffect(() => () => {
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  }, [recordingUrl]);

  useEffect(() => {
    if (phase !== 'recording' && phase !== 'paused') return;
    const timer = setInterval(() => {
      // A session exists for as long as the phase is recording or paused.
      const session = live.current.session!;
      setClock({ elapsed: session.elapsed(), bytes: session.bytes() });
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  const update = (patch: Partial<RecorderSettings>) => setSettings((current) => ({ ...current, ...patch }));

  /** Stops sharing and the microphone and forgets every live object. */
  const release = () => {
    const state = live.current;
    clearTimeout(state.countdown);
    state.composed?.dispose();
    state.capture?.stop();
    live.current = {};
    setPreview(undefined);
    setCount(0);
  };

  /** Only reachable while a session runs: the Stop button, or the share ending mid-recording. */
  const finish = async () => {
    const session = live.current.session!;
    setPhase('finishing');
    try {
      const result = await session.stop();
      release();
      if (!result.blob.size) throw new Error('The recording came out empty. Try again, and keep sharing for at least a second.');
      const format = formatFromMime(result.mimeType);
      const file = new File([result.blob], recordingFileName(format), { type: result.blob.type });
      setRecording({ file, url: URL.createObjectURL(file), durationMs: result.durationMs });
      setPhase('done');
    } catch (reason) {
      release();
      setError(errorMessage(reason, 'The recording could not be finished.'));
      setPhase('idle');
    }
  };

  const onSourceEnded = () => {
    if (live.current.session) {
      void finish();
      return;
    }
    release();
    setPhase('idle');
  };

  /** Runs once sharing has started (cancelling a countdown clears its timer first). */
  const beginSession = () => {
    const capture = live.current.capture!;
    live.current.countdown = undefined;
    try {
      const mimeType = pickMimeType(settings.format) ?? pickMimeType(support.formats[0]);
      if (!mimeType) throw new Error('This browser cannot record video.');
      const composed = composeRecordingStream(
        capture,
        settings.area === 'region' ? region : undefined,
        settings.fps,
        browserCaptureEnvironment(),
      );
      live.current.composed = composed;
      const session = createRecordingSession(
        composed.stream,
        { mimeType, videoBitsPerSecond: QUALITY_BITRATES[settings.quality] },
        browserSessionEnvironment(),
      );
      live.current.session = session;
      session.start();
      setCropMode(composed.cropMode);
      setPreview(composed.stream);
      setClock({ elapsed: 0, bytes: 0 });
      setCount(0);
      setPhase('recording');
    } catch (reason) {
      release();
      setError(errorMessage(reason, 'Recording could not start.'));
      setPhase('idle');
    }
  };

  const tick = (remaining: number) => {
    if (remaining === 0) {
      beginSession();
      return;
    }
    setCount(remaining);
    live.current.countdown = setTimeout(() => tick(remaining - 1), 1000);
  };

  const beginRecording = () => {
    if (settings.countdown) {
      setPhase('countdown');
      tick(3);
    } else {
      beginSession();
    }
  };

  const share = async () => {
    setError('');
    setWarnings([]);
    setCropMode(undefined);
    setPhase('starting');
    try {
      const capture = await startCapture(settings, browserCaptureEnvironment());
      live.current.capture = capture;
      setWarnings(capture.warnings);
      const track = capture.display.getVideoTracks()[0];
      track?.addEventListener('ended', onSourceEnded);
      const size = track?.getSettings();
      if (size?.width && size.height) setSourceSize({ width: size.width, height: size.height });
      setPreview(capture.display);
      if (settings.area === 'region') {
        setPhase('selecting');
      } else {
        beginRecording();
      }
    } catch (reason) {
      release();
      setPhase('idle');
      setError(reason instanceof CaptureCancelledError ? reason.message : errorMessage(reason, 'Screen sharing could not start.'));
    }
  };

  const cancel = () => {
    release();
    setPhase('idle');
  };

  const pause = () => {
    live.current.session?.pause();
    setPhase('paused');
  };

  const resume = () => {
    live.current.session?.resume();
    setPhase('recording');
  };

  const discard = () => {
    setRecording(undefined);
    setWarnings([]);
    setCropMode(undefined);
    setPhase('idle');
  };

  const makeGif = (file: File) => {
    handOffVideo(file);
    void navigate('/en/video-to-gif');
  };

  const showLive = phase === 'selecting' || phase === 'countdown' || phase === 'recording' || phase === 'paused';
  const liveVideo = (
    <video
      className="recorder-video"
      ref={(node) => {
        // The element remounts as the stage changes; reattach without reloading an unchanged stream.
        // The live stages only render while a stream is being previewed.
        if (node && node.srcObject !== preview) node.srcObject = preview as MediaStream;
      }}
      aria-label={phase === 'selecting' ? 'Shared screen' : 'Live recording preview'}
      autoPlay
      muted
      playsInline
    />
  );

  return (
    <div className="ed-grid screen-recorder" data-panes="side">
      <aside className="ed-pane g" data-pad="true" aria-label="Recording settings">
        <fieldset className="flow-options" disabled={busy}>
          <legend>What to record</legend>
          {SURFACES.map((option) => (
            <label className="flow-option ctl" key={option.value}>
              <input
                type="radio"
                name="recorder-surface"
                checked={settings.surface === option.value}
                onChange={() => update({ surface: option.value })}
              />
              <span className="flow-radio" aria-hidden="true" />
              <span className="flow-option-label">{option.label}</span>
              <span className="flow-option-note">{option.note}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flow-options" disabled={busy}>
          <legend>Area</legend>
          {AREAS.map((option) => (
            <label className="flow-option ctl" key={option.value}>
              <input
                type="radio"
                name="recorder-area"
                checked={settings.area === option.value}
                onChange={() => update({ area: option.value })}
              />
              <span className="flow-radio" aria-hidden="true" />
              <span className="flow-option-label">{option.label}</span>
              <span className="flow-option-note">{option.note}</span>
            </label>
          ))}
        </fieldset>

        <div className="recorder-selects">
          <label className="field-label">
            Frame rate
            <select
              value={settings.fps}
              disabled={busy}
              onChange={(event) => update({ fps: Number(event.target.value) })}
            >
              {RECORDING_FRAME_RATES.map((fps) => (
                <option key={fps} value={fps}>
                  {fps} fps
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Video quality
            <select
              value={settings.quality}
              disabled={busy}
              onChange={(event) => update({ quality: event.target.value as RecordingQuality })}
            >
              {QUALITIES.map((quality) => (
                <option key={quality.value} value={quality.value}>
                  {quality.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            File format
            <select
              value={settings.format}
              disabled={busy || support.formats.length < 2}
              onChange={(event) => update({ format: event.target.value as RecorderSettings['format'] })}
            >
              {(support.formats.length ? support.formats : [settings.format]).map((format) => (
                <option key={format} value={format}>
                  {format === 'webm' ? 'WebM' : 'MP4'}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="recorder-toggles" disabled={busy}>
          <legend>Options</legend>
          <label className="flow-extra">
            <input type="checkbox" checked={settings.systemAudio} onChange={(event) => update({ systemAudio: event.target.checked })} />
            <span>Tab or system sound</span>
          </label>
          <label className="flow-extra">
            <input type="checkbox" checked={settings.microphone} onChange={(event) => update({ microphone: event.target.checked })} />
            <span>Microphone voice-over</span>
          </label>
          <label className="flow-extra">
            <input type="checkbox" checked={settings.cursor} onChange={(event) => update({ cursor: event.target.checked })} />
            <span>Show the mouse pointer</span>
          </label>
          <label className="flow-extra">
            <input type="checkbox" checked={settings.countdown} onChange={(event) => update({ countdown: event.target.checked })} />
            <span>3-second countdown</span>
          </label>
        </fieldset>
        <p className="flow-hint">
          Your browser asks what to share and shows its own sharing bar. The video is made in this tab and stays in memory until
          you download it.
        </p>
      </aside>

      <section className="ed-pane g recorder-main" aria-label="Screen recording">
        <div className="ed-head">
          <h2>{HEADINGS[phase]}</h2>
          <span className="spacer" />
          {phase === 'recording' || phase === 'paused' ? (
            <span className="ed-pill gi recorder-clock" data-state={phase} role="timer" aria-label="Recording time">
              <span className="recorder-dot" aria-hidden="true" />
              {formatClock(clock.elapsed)} · {formatBytes(clock.bytes)}
            </span>
          ) : null}
        </div>

        <div className="recorder-stage">
          {!canRecord ? (
            <div className="recorder-empty">
              <span className="flow-drop-mark" aria-hidden="true">
                <ToolMark tool="screen-recorder" />
              </span>
              <strong>Screen recording is not available here</strong>
              <p>
                It needs a desktop browser that can share the screen and record video, such as Chrome, Edge, Firefox, or
                Safari. Phones and tablets do not offer screen sharing to web pages.
              </p>
            </div>
          ) : phase === 'done' && recording ? (
            <video className="recorder-video" src={recording.url} controls playsInline aria-label="Finished recording" />
          ) : showLive ? (
            phase === 'selecting' ? (
              <RegionSelect
                frameWidth={sourceSize.width}
                frameHeight={sourceSize.height}
                region={region}
                onChange={setRegion}
                label="Area to record"
              >
                {liveVideo}
              </RegionSelect>
            ) : (
              <div className="recorder-live">
                {liveVideo}
                {phase === 'countdown' ? (
                  <span className="recorder-count" aria-live="assertive">
                    {count}
                  </span>
                ) : null}
              </div>
            )
          ) : (
            <div className="recorder-empty">
              <span className="flow-drop-mark drift" aria-hidden="true">
                <ToolMark tool="screen-recorder" />
              </span>
              <strong>Record a tab, a window, or your screen</strong>
              <p>
                Choose the source in your browser’s picker. {settings.area === 'region' ? 'You then drag over the picture to pick the part to record.' : 'Recording starts as soon as you share.'}
              </p>
            </div>
          )}
        </div>

        {phase === 'selecting' ? (
          <div className="recorder-region">
            <RegionFields frameWidth={sourceSize.width} frameHeight={sourceSize.height} region={region} onChange={setRegion} />
          </div>
        ) : null}

        <div className="ed-bar g recorder-bar">
          {phase === 'idle' || phase === 'starting' ? (
            <button className="button button-primary" type="button" disabled={!canRecord || phase === 'starting'} onClick={() => void share()}>
              <MonitorUp aria-hidden="true" size={16} /> {phase === 'starting' ? 'Waiting for the share picker…' : 'Choose what to record'}
            </button>
          ) : null}
          {phase === 'selecting' ? (
            <>
              <button className="button button-primary" type="button" onClick={beginRecording}>
                <Circle aria-hidden="true" size={15} /> Start recording
              </button>
              <button className="button button-secondary" type="button" onClick={cancel}>
                <X aria-hidden="true" size={15} /> Stop sharing
              </button>
            </>
          ) : null}
          {phase === 'countdown' ? (
            <button className="button button-secondary" type="button" onClick={cancel}>
              <X aria-hidden="true" size={15} /> Cancel
            </button>
          ) : null}
          {phase === 'recording' || phase === 'paused' ? (
            <>
              <button className="button button-primary" type="button" onClick={() => void finish()}>
                <Square aria-hidden="true" size={15} /> Stop recording
              </button>
              {phase === 'recording' ? (
                <button className="button button-secondary" type="button" onClick={pause}>
                  <Pause aria-hidden="true" size={15} /> Pause
                </button>
              ) : (
                <button className="button button-secondary" type="button" onClick={resume}>
                  <Play aria-hidden="true" size={15} /> Resume
                </button>
              )}
            </>
          ) : null}
          {phase === 'finishing' ? <span className="ed-note" role="status">Finishing the video…</span> : null}
          {phase === 'done' && recording ? (
            <>
              <button className="button button-primary" type="button" onClick={() => downloadBlob(recording.file, recording.file.name)}>
                <Download aria-hidden="true" size={15} /> Download {formatFromMime(recording.file.type) === 'mp4' ? 'MP4' : 'WebM'}
              </button>
              <button className="button button-secondary" type="button" onClick={() => makeGif(recording.file)}>
                <Film aria-hidden="true" size={15} /> Make a GIF
              </button>
              <button className="button button-secondary" type="button" onClick={discard}>
                <RotateCcw aria-hidden="true" size={15} /> Record again
              </button>
              <span className="spacer" />
              <span className="ed-note" role="status">
                {formatClock(recording.durationMs)} · {formatBytes(recording.file.size)} · {recording.file.name}
              </span>
            </>
          ) : null}
        </div>

        {error ? (
          <p className="field-error recorder-message" role="alert">
            {error}
          </p>
        ) : null}
        {warnings.map((warning) => (
          <p className="inline-note recorder-message" key={warning}>
            {warning}
          </p>
        ))}
        {cropMode === 'canvas' && (phase === 'recording' || phase === 'paused') ? (
          <p className="inline-note recorder-message">
            This browser crops the area by redrawing it, which slows down while this tab is hidden. Keep FileKit visible
            (for example in its own window) for a smooth recording.
          </p>
        ) : null}
      </section>
    </div>
  );
}
