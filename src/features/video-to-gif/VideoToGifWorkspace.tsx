import { Crosshair, Download, Film, MonitorUp, Trash2, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { RegionFields } from '../../components/RegionSelect/RegionFields';
import { RegionSelect } from '../../components/RegionSelect/RegionSelect';
import { ToolMark } from '../../components/ToolMark/ToolMark';
import { downloadBlob } from '../../lib/download';
import { errorMessage, isAbortError } from '../../lib/errors';
import { assertFilesAllowed, formatBytes, safeBaseName, type FilePolicy } from '../../lib/files';
import { clearHandedOffVideo, peekHandedOffVideo } from '../../lib/media-handoff';
import { FULL_REGION, isFullRegion, toPixelRect, type Region } from '../../lib/region';
import { createVideoGrabber, probeVideo, type VideoInfo } from '../../lib/video-frames';
import {
  encodeGif,
  formatSeconds,
  GIF_COLOURS,
  GIF_FRAME_RATES,
  GIF_SPEEDS,
  MAX_GIF_FRAMES,
  planFrames,
  scaledHeight,
  widthChoices,
  type GifResult,
} from '../../lib/video-to-gif';

const policy: FilePolicy = {
  accept: ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v', 'video/x-matroska'],
  extensions: ['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv'],
  maxBytes: 1024 * 1024 * 1024,
  maxFiles: 1,
};

interface Source {
  file: File;
  url: string;
  info: VideoInfo;
}

interface Made extends GifResult {
  url: string;
  name: string;
}

/** Shortest clip the trim controls allow. */
const MIN_CLIP = 0.1;
const STARTING_CROP: Region = { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };

/** 800 px (or the whole picture, if narrower): sharp, yet a reasonable file. */
const defaultWidth = (cropWidth: number) => Math.min(800, cropWidth);

interface TrimRowProps {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  onPlayhead: () => void;
}

function TrimRow({ id, label, value, max, onChange, onPlayhead }: TrimRowProps) {
  return (
    <div className="gif-trim-row">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="range" min={0} max={max} step={0.05} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{formatSeconds(value)}</strong>
      <button className="button button-secondary" type="button" onClick={onPlayhead}>
        <Crosshair aria-hidden="true" size={14} /> {label} at playhead
      </button>
    </div>
  );
}

export function VideoToGifWorkspace() {
  const inputId = useId();
  const [source, setSource] = useState<Source>();
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [cropOn, setCropOn] = useState(false);
  const [region, setRegion] = useState<Region>(FULL_REGION);
  const [width, setWidth] = useState(800);
  const [fps, setFps] = useState(15);
  const [speed, setSpeed] = useState(1);
  const [colours, setColours] = useState(256);
  const [dither, setDither] = useState(false);
  const [loop, setLoop] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [made, setMade] = useState<Made>();
  const [error, setError] = useState('');
  const player = useRef<HTMLVideoElement>(null);
  const resultPanel = useRef<HTMLElement>(null);
  const controller = useRef<AbortController | undefined>(undefined);

  const sourceUrl = source?.url;
  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

  const madeUrl = made?.url;
  useEffect(() => () => {
    if (madeUrl) URL.revokeObjectURL(madeUrl);
  }, [madeUrl]);

  useEffect(() => () => controller.current?.abort(), []);

  // A finished GIF lands below the trim controls; bring it into view.
  useEffect(() => {
    if (madeUrl) resultPanel.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [madeUrl]);

  const receive = async (file: File) => {
    try {
      assertFilesAllowed([file], policy);
    } catch (reason) {
      setError(errorMessage(reason, 'That file could not be added.'));
      return;
    }
    controller.current?.abort();
    setError('');
    setLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const info = await probeVideo(url);
      const crop = toPixelRect(FULL_REGION, info.width, info.height);
      setSource({ file, url, info });
      setStart(0);
      setEnd(info.duration);
      setCropOn(false);
      setRegion(FULL_REGION);
      setWidth(defaultWidth(crop.width));
      setMade(undefined);
      setProgress(undefined);
    } catch (reason) {
      URL.revokeObjectURL(url);
      setError(errorMessage(reason, 'That video could not be opened.'));
    } finally {
      setLoading(false);
    }
  };

  // A recording handed over from the screen recorder opens straight away. The microtask
  // keeps state updates out of the effect body (and StrictMode's first pass cancels itself).
  useEffect(() => {
    const file = peekHandedOffVideo();
    if (!file) return;
    let live = true;
    void Promise.resolve().then(() => {
      if (live) void receive(file);
    });
    return () => {
      live = false;
    };
    // Only ever on mount: the hand-off is a one-time delivery.
  }, []);

  const remove = () => {
    controller.current?.abort();
    clearHandedOffVideo();
    setSource(undefined);
    setMade(undefined);
    setProgress(undefined);
    setError('');
  };

  const choose = (files: FileList | File[] | null | undefined) => {
    const file = files?.[0];
    if (!file) return;
    clearHandedOffVideo();
    void receive(file);
  };

  // The trim controls only exist alongside the player, so it is always mounted here.
  const playhead = () => player.current!.currentTime;

  const seek = (time: number) => {
    player.current!.currentTime = time;
  };

  const duration = source?.info.duration ?? 0;
  const changeStart = (value: number) => {
    const next = Math.min(Math.max(0, value), Math.max(0, end - MIN_CLIP));
    setStart(next);
    seek(next);
  };
  const changeEnd = (value: number) => {
    const next = Math.max(Math.min(duration, value), Math.min(duration, start + MIN_CLIP));
    setEnd(next);
    seek(next);
  };

  const toggleCrop = (on: boolean) => {
    setCropOn(on);
    if (on && isFullRegion(region)) setRegion(STARTING_CROP);
  };

  const frame = source ? toPixelRect(cropOn ? region : FULL_REGION, source.info.width, source.info.height) : undefined;
  const choices = frame ? widthChoices(frame.width) : [];
  const outWidth = choices.includes(width) ? width : (choices.find((choice) => choice <= width) ?? choices[choices.length - 1] ?? width);
  const outHeight = frame ? scaledHeight(frame.width, frame.height, outWidth) : 0;
  const plan = source ? planFrames(start, end, fps, speed) : undefined;
  const frameCount = plan?.times.length ?? 0;
  const tooLong = frameCount > MAX_GIF_FRAMES;
  const working = progress !== undefined;

  const create = async () => {
    // The button is disabled until a video is loaded.
    const current = source!;
    const crop = frame!;
    const planned = plan!;
    const next = new AbortController();
    controller.current = next;
    setMade(undefined);
    setError('');
    setProgress({ done: 0, total: planned.times.length });
    let grabber: Awaited<ReturnType<typeof createVideoGrabber>> | undefined;
    try {
      grabber = await createVideoGrabber(current.url, crop, outWidth, outHeight);
      const gif = await encodeGif({
        grabber,
        plan: planned,
        settings: { colors: colours, dither, loop },
        signal: next.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setMade({ ...gif, url: URL.createObjectURL(gif.blob), name: `${safeBaseName(current.file.name)}.gif` });
      setProgress(undefined);
    } catch (reason) {
      setProgress(undefined);
      if (!isAbortError(reason)) setError(errorMessage(reason, 'The GIF could not be created.'));
    } finally {
      grabber?.release();
      controller.current = undefined;
    }
  };

  const cancel = () => {
    controller.current?.abort();
    setProgress(undefined);
  };

  const percent = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  const video = source ? (
    <video
      className="gif-video"
      ref={player}
      src={source.url}
      controls={!cropOn}
      playsInline
      preload="auto"
      aria-label={`Video: ${source.file.name}`}
    />
  ) : null;

  return (
    <div className="ed-grid video-to-gif" data-panes="side">
      <aside className="ed-pane g" data-pad="true" aria-label="GIF settings">
        <div className="recorder-selects">
          <label className="field-label">
            GIF width
            <select value={outWidth} disabled={!source || working} onChange={(event) => setWidth(Number(event.target.value))}>
              {(choices.length ? choices : [width]).map((choice, index) => (
                <option key={choice} value={choice}>
                  {choice} px{index === 0 && frame ? ' · full size' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Frame rate
            <select value={fps} disabled={working} onChange={(event) => setFps(Number(event.target.value))}>
              {GIF_FRAME_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} fps
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Speed
            <select value={speed} disabled={working} onChange={(event) => setSpeed(Number(event.target.value))}>
              {GIF_SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Colours
            <select value={colours} disabled={working} onChange={(event) => setColours(Number(event.target.value))}>
              {GIF_COLOURS.map((value) => (
                <option key={value} value={value}>
                  {value}
                  {value === 256 ? ' · best' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="recorder-toggles" disabled={working}>
          <legend>Options</legend>
          <label className="flow-extra">
            <input type="checkbox" checked={dither} onChange={(event) => setDither(event.target.checked)} />
            <span>Smooth gradients (dithering)</span>
          </label>
          <label className="flow-extra">
            <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
            <span>Loop forever</span>
          </label>
          <label className="flow-extra">
            <input type="checkbox" checked={cropOn} disabled={!source} onChange={(event) => toggleCrop(event.target.checked)} />
            <span>Crop to an area</span>
          </label>
        </fieldset>
        <p className="flow-hint">
          Each frame gets its own 256-colour palette and only changed pixels are redrawn, so screen text stays crisp. Turn
          dithering on for camera footage and soft gradients.
        </p>

        {source && cropOn ? (
          <RegionFields
            frameWidth={source.info.width}
            frameHeight={source.info.height}
            region={region}
            onChange={setRegion}
            disabled={working}
          />
        ) : null}

        {source ? (
          <p className={`gif-estimate${tooLong ? ' is-over' : ''}`} role="status">
            {frameCount} {frameCount === 1 ? 'frame' : 'frames'} · {outWidth} × {outHeight} px · plays{' '}
            {formatSeconds(frameCount / fps)}
            {tooLong ? ` — over the ${MAX_GIF_FRAMES}-frame limit; shorten the clip, lower the frame rate, or raise the speed.` : ''}
          </p>
        ) : null}

        {working ? (
          <div className="gif-working">
            <div className="flow-working-head">
              <strong>
                Frame {progress!.done} of {progress!.total}
              </strong>
              <span>{percent}%</span>
            </div>
            <div
              className="flow-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="GIF progress"
            >
              <div className="flow-fill" style={{ width: `${percent}%` }} />
            </div>
            <button className="button button-secondary" type="button" onClick={cancel}>
              <X aria-hidden="true" size={15} /> Cancel
            </button>
          </div>
        ) : (
          <button
            className="button button-primary flow-run"
            type="button"
            disabled={!source || tooLong || loading}
            onClick={() => void create()}
          >
            <Film aria-hidden="true" size={16} /> {source ? 'Create GIF' : 'Choose a video first'}
          </button>
        )}
      </aside>

      <section className="ed-pane g gif-main" aria-label="Video to GIF">
        {source ? (
          <>
            <div className="ed-head">
              <span className="flow-file-name">
                <strong>{source.file.name}</strong>
                <span>
                  {source.info.width} × {source.info.height} · {formatSeconds(source.info.duration)} · {formatBytes(source.file.size)}
                </span>
              </span>
              <span className="spacer" />
              <button className="button button-secondary" type="button" disabled={working} onClick={remove}>
                <Trash2 aria-hidden="true" size={15} /> Remove video
              </button>
            </div>

            <div className="gif-body scroll">
              <div className="gif-stage">
                {cropOn ? (
                  <RegionSelect
                    frameWidth={source.info.width}
                    frameHeight={source.info.height}
                    region={region}
                    onChange={setRegion}
                    label="Area to keep"
                  >
                    {video}
                  </RegionSelect>
                ) : (
                  video
                )}
              </div>

              <fieldset className="gif-trim" disabled={working}>
                <legend>Trim</legend>
                <TrimRow id={`${inputId}-start`} label="Start" value={start} max={duration} onChange={changeStart} onPlayhead={() => changeStart(playhead())} />
                <TrimRow id={`${inputId}-end`} label="End" value={end} max={duration} onChange={changeEnd} onPlayhead={() => changeEnd(playhead())} />
                <p className="flow-hint">
                  Clip: {formatSeconds(start)} – {formatSeconds(end)} ({formatSeconds(end - start)})
                  {cropOn ? '. Drag over the picture to choose the area; turn crop off to use the player controls.' : ''}
                </p>
              </fieldset>

              {made ? (
                <section className="gif-result gi" aria-label="Your GIF" ref={resultPanel}>
                  <div className="gif-result-head">
                    <strong>Your GIF</strong>
                    <span role="status">
                      {made.width} × {made.height} · {made.frames} {made.frames === 1 ? 'frame' : 'frames'} ·{' '}
                      {formatSeconds(made.duration)} · {formatBytes(made.blob.size)}
                    </span>
                    <span className="spacer" />
                    <button className="button button-primary" type="button" onClick={() => downloadBlob(made.blob, made.name)}>
                      <Download aria-hidden="true" size={15} /> Download GIF
                    </button>
                  </div>
                  <div className="gif-result-image">
                    <img src={made.url} alt={`GIF made from ${source.file.name}`} width={made.width} height={made.height} />
                  </div>
                </section>
              ) : null}
            </div>
          </>
        ) : (
          <div
            className="flow-drop gif-drop"
            data-dragging={dragging}
            data-testid="dropzone"
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              choose(event.dataTransfer.files);
            }}
          >
            <label className="flow-drop-target" htmlFor={inputId}>
              <span className="flow-drop-mark drift" aria-hidden="true">
                <ToolMark tool="video-to-gif" />
              </span>
              <strong>{loading ? 'Opening the video…' : 'Drop a video, or click to choose'}</strong>
              <span className="flow-drop-accept">MP4 · WebM · MOV · screen recordings</span>
              <span className="flow-drop-size">Up to 1 GB · converted in this tab, never uploaded</span>
            </label>
            <input
              className="sr-only"
              id={inputId}
              type="file"
              aria-label="Choose a video"
              accept={[...policy.accept, ...policy.extensions.map((extension) => `.${extension}`)].join(',')}
              onChange={(event) => {
                const files = Array.from(event.target.files!);
                event.target.value = '';
                choose(files);
              }}
            />
            <Link className="button button-secondary gif-record-link" to="/en/screen-recorder">
              <MonitorUp aria-hidden="true" size={15} /> Record your screen first
            </Link>
          </div>
        )}

        {error ? (
          <p className="field-error gif-message" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
