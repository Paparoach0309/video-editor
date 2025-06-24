import { useState, useRef, useEffect, useCallback } from "react";
import { createFFmpeg, fetchFile } from "@ffmpeg/ffmpeg";

const ffmpeg = createFFmpeg({
  log: true,
  progress: (progress: { ratio: number }) => {
    const { ratio } = progress;
    console.log(`Прогресс обработки: ${(ratio * 100).toFixed(1)}%`);
  },
});

type Frame = {
  time: number;
  image: string;
};

export default function VideoPlayer() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [trimmedSrc, setTrimmedSrc] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [cursorTime, setCursorTime] = useState(0);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [trimStart, setTrimStart] = useState(0);
  const [trimDuration, setTrimDuration] = useState(5);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    ffmpeg.setProgress((progress: { ratio: number }) => {
      setProcessingProgress(progress.ratio);
    });
  }, []);

  useEffect(() => {
    (async () => {
      if (!ffmpegReady) {
        setError(null);
        try {
          await ffmpeg.load();
          setFfmpegReady(true);
        } catch (e) {
          setError("Ошибка при загрузке FFmpeg");
        }
      }
    })();
  }, [ffmpegReady]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setTrimmedSrc(null);
      setFrames([]);
      setCursorTime(0);
      setTrimStart(0);
      setTrimDuration(5);
      setError(null);
      setProcessingProgress(0);
    }
  };

  const trimVideo = async () => {
    if (!ffmpegReady || !videoSrc) return;

    setError(null);
    setProcessingProgress(0);

    try {
      const fileData = await fetchFile(videoSrc);
      ffmpeg.FS("writeFile", "input.mp4", fileData);

      await ffmpeg.run(
        "-ss",
        trimStart.toString(),
        "-i",
        "input.mp4",
        "-t",
        trimDuration.toString(),
        "-c",
        "copy",
        "output.mp4"
      );

      const data = ffmpeg.FS("readFile", "output.mp4");
      const trimmedBlob = new Blob([data.buffer], { type: "video/mp4" });
      const trimmedUrl = URL.createObjectURL(trimmedBlob);
      setTrimmedSrc(trimmedUrl);
    } catch (err) {
      setError("Ошибка при обрезке видео");
      console.error(err);
    }
  };

  const captureFrames = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const frameCount = 10;
    const interval = video.duration / frameCount;
    const thumbnails: Frame[] = [];

    for (let i = 0; i <= frameCount; i++) {
      const time = i * interval;
      await new Promise<void>((resolve) => {
        const handler = () => {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnails.push({ time, image: canvas.toDataURL() });
          video.removeEventListener("seeked", handler);
          resolve();
        };
        video.addEventListener("seeked", handler);
        video.currentTime = time;
      });
    }
    setFrames(thumbnails);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateCursor = () => {
      if (!video.paused && !video.ended) {
        setCursorTime(video.currentTime);
      }
    };

    const onEnded = () => {
      setCursorTime(video.duration);
    };

    video.addEventListener("timeupdate", updateCursor);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", updateCursor);
      video.removeEventListener("ended", onEnded);
    };
  }, [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      captureFrames();
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata);

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
    };
  }, [videoSrc, captureFrames]);

  const onTimelineClick = (time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time;
  };

  const getCursorPosition = () => {
    const video = videoRef.current;
    const timeline = timelineRef.current;
    if (!video || !timeline || video.duration === 0) return 0;

    const ratio = cursorTime / video.duration;
    const width = timeline.clientWidth;

    return Math.min(ratio * width, width);
  };

  return (
    <div
      style={{
        padding: 20,
      }}
    >
      <button
        disabled={!ffmpegReady}
        style={{
          marginBottom: 10,
          padding: "8px 16px",
          fontSize: 16,
          backgroundColor: ffmpegReady ? "#4caf50" : "#9e9e9e",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: ffmpegReady ? "default" : "wait",
        }}
      >
        {ffmpegReady ? "FFmpeg загружен" : "Загрузка FFmpeg..."}
      </button>

      {error && (
        <div
          style={{
            color: "white",
            backgroundColor: "#e53935",
            padding: "10px 15px",
            borderRadius: 4,
            marginBottom: 10,
            boxShadow: "0 0 5px rgba(229, 57, 53, 0.7)",
          }}
          role="alert"
        >
          {error}
        </div>
      )}

      <input
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        style={{
          padding: "6px 12px",
          fontSize: 16,
          borderRadius: 4,
          border: "1px solid #ccc",
          marginBottom: 10,
          cursor: "pointer",
        }}
      />

      {videoSrc && (
        <>
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            width={600}
            style={{
              marginTop: 20,
              display: "block",
              borderRadius: 8,
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          />

          <canvas
            ref={canvasRef}
            width={160}
            height={90}
            style={{ display: "none" }}
          />

          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 15,
            }}
          >
            <label style={{ fontSize: 14 }}>
              Начало (сек):
              <input
                type="number"
                min={0}
                step={0.1}
                value={trimStart}
                onChange={(e) => setTrimStart(parseFloat(e.target.value))}
                style={{
                  marginLeft: 6,
                  width: 80,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  fontSize: 14,
                }}
              />
            </label>

            <label style={{ fontSize: 14 }}>
              Длительность (сек):
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={trimDuration}
                onChange={(e) => setTrimDuration(parseFloat(e.target.value))}
                style={{
                  marginLeft: 6,
                  width: 80,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid #ccc",
                  fontSize: 14,
                }}
              />
            </label>

            <button
              onClick={trimVideo}
              disabled={!ffmpegReady}
              style={{
                padding: "8px 16px",
                fontSize: 16,
                backgroundColor: ffmpegReady ? "#4caf50" : "#ededed",
                color: ffmpegReady ? "white" : "black",
                border: "none",
                borderRadius: 4,
                cursor: ffmpegReady ? "pointer" : 'not-allowed',
              }}
            >
              Обрезать видео
            </button>
          </div>

          {processingProgress > 0 && processingProgress < 1 && (
            <div
              style={{
                marginTop: 15,
                backgroundColor: "#eee",
                borderRadius: 6,
                height: 16,
                overflow: "hidden",
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)",
                width: 600,
                userSelect: "none",
              }}
              aria-label="Прогресс обработки видео"
            >
              <div
                style={{
                  width: `${(processingProgress * 100).toFixed(2)}%`,
                  height: "100%",
                  backgroundColor: "#4caf50",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          )}
          {processingProgress > 0 && processingProgress < 1 && (
            <div style={{ marginTop: 5, fontSize: 14, color: "#333" }}>
              Обработка: {(processingProgress * 100).toFixed(1)}%
            </div>
          )}

          <div
            ref={timelineRef}
            style={{
              position: "relative",
              display: "flex",
              gap: 6,
              marginTop: 25,
              overflowX: "auto",
              height: 60,
              alignItems: "center",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: "6px 8px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
              backgroundColor: "#fafafa",
              userSelect: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: getCursorPosition(),
                width: 3,
                height: 60,
                backgroundColor: "crimson",
                pointerEvents: "none",
                borderRadius: 2,
                transition: "left 0.1s linear",
                boxShadow: "0 0 6px crimson",
              }}
            />

            {frames.map((frame, index) => (
              <img
                key={index}
                src={frame.image}
                alt={`Кадр ${index + 1}`}
                width={100}
                height={56}
                style={{
                  objectFit: "cover",
                  cursor: "pointer",
                  borderRadius: 6,
                  border: "2px solid transparent",
                  transition: "border-color 0.2s ease",
                }}
                onClick={() => onTimelineClick(frame.time)}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.borderColor = "#2196f3")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.borderColor = "transparent")
                }
              />
            ))}
          </div>
        </>
      )}

      {trimmedSrc && (
        <>
          <h3 style={{ marginTop: 30, fontWeight: 600, color: "#333" }}>
            Обрезанное видео:
          </h3>
          <video
            src={trimmedSrc}
            controls
            width={600}
            style={{
              marginTop: 10,
              borderRadius: 8,
              boxShadow: "0 3px 10px rgba(0,0,0,0.15)",
              backgroundColor: "#000",
            }}
          />
          <a
            href={trimmedSrc}
            download="trimmed-video.mp4"
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "10px 20px",
              backgroundColor: "#2196f3",
              color: "white",
              fontWeight: "600",
              borderRadius: 6,
              textDecoration: "none",
              cursor: "pointer",
              boxShadow: "0 3px 7px rgba(33, 150, 243, 0.6)",
              userSelect: "none",
            }}
          >
            Скачать обрезанное видео
          </a>
        </>
      )}
    </div>
  );
}
