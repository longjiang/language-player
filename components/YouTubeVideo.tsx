// @/components/YouTubeVideo.tsx
// YouTube player using the YouTube IFrame API.
// Uses a native <iframe> on web and react-native-webview on iOS/Android.
// Replaces react-native-youtube-iframe with a single cross-platform implementation.

import { useRef, useEffect, useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import {
  useVideoWithTranscriptContext,
} from "@/contexts/VideoWithTranscriptContext";
import { PLAYER_STATES } from "@/constants/PlayerStates";

const IS_WEB = Platform.OS === "web";

// ── Types ──────────────────────────────────────────────────────────────────

interface YouTubeVideoProps {
  youtubeId: string;
  autoplay?: boolean;
  mute?: boolean;
  startTime?: number;
  height?: number;
  controls?: boolean;
}

/** Union of messages the injected YouTube page sends back to us. */
interface YouTubeMessage {
  type: "ready" | "stateChange" | "currentTime" | "duration" | "error";
  duration?: number;
  state?: number;
  time?: number;
  data?: unknown;
}

/** Commands we send into the YouTube player. */
interface YouTubeCommand {
  command: "play" | "pause" | "seekTo" | "mute" | "unmute" | "startPoll" | "stopPoll";
  seconds?: number;
}

// ── Injected HTML + YouTube IFrame API ─────────────────────────────────────

const buildYouTubeHTML = (
  videoId: string,
  startTime: number,
  showControls: boolean,
): string => {
  const escapedId = videoId.replace(/[\\`]/g, "\\$&");
  return `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; height:100%; background:#000; overflow:hidden; }
  #player { width:100%; height:100%; }
</style>
</head>
<body>
<div id="player"></div>
<script>
  var tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  var firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  var player;
  var pollTimer = null;
  var queuedCommands = [];

  function postMessage(msg) {
    var payload = JSON.stringify(msg);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(payload);
    } else {
      window.parent.postMessage(payload, '*');
    }
  }

  function executeCommand(cmd) {
    if (!player || typeof player.playVideo !== 'function') {
      queuedCommands.push(cmd);
      return;
    }
    try {
      switch (cmd.command) {
        case 'play':       player.playVideo(); break;
        case 'pause':      player.pauseVideo(); break;
        case 'seekTo':     player.seekTo(cmd.seconds, true); break;
        case 'mute':       player.mute(); break;
        case 'unmute':     player.unMute(); break;
        case 'startPoll':  startPolling(); break;
        case 'stopPoll':   stopPolling(); break;
        default: break;
      }
    } catch(e) {}
  }

  function flushQueuedCommands() {
    while (queuedCommands.length) {
      executeCommand(queuedCommands.shift());
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function() {
      if (player && player.getCurrentTime) {
        postMessage({ type: 'currentTime', time: player.getCurrentTime() });
      }
    }, 200);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  window.onYouTubeIframeAPIReady = function() {
    player = new YT.Player('player', {
      videoId: '${escapedId}',
      playerVars: {
        start: ${Math.floor(startTime)},
        rel: 0,
        modestbranding: 1,
        controls: ${showControls ? 1 : 0},
        cc_load_policy: 1,
        cc_lang_pref: 'us',
        playsinline: 1,
        origin: (window.location && window.location.origin) || 'https://www.youtube.com',
      },
      events: {
        onReady: function() {
          postMessage({ type: 'ready', duration: player.getDuration() });
          flushQueuedCommands();
        },
        onStateChange: function(event) {
          postMessage({ type: 'stateChange', state: event.data });
        },
        onError: function(event) {
          postMessage({ type: 'error', data: event.data });
        },
      }
    });
  };

  // Listen for commands from the parent
  window.addEventListener('message', function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.command) executeCommand(msg);
    } catch(err) {}
  });
</script>
</body>
</html>`;
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Send a JSON command into the player (works for both iframe and WebView). */
const postCommandToPlayer = (
  target: HTMLIFrameElement | WebView | null,
  command: YouTubeCommand,
) => {
  const json = JSON.stringify(command);
  if (!target) return;
  if (IS_WEB) {
    (target as HTMLIFrameElement).contentWindow?.postMessage(json, "*");
  } else {
    (target as WebView).postMessage(json);
  }
};

// ── Component ──────────────────────────────────────────────────────────────

export const YouTubeVideo: React.FC<YouTubeVideoProps> = ({
  youtubeId,
  autoplay = false,
  mute = false,
  startTime = 0,
  height = 300,
  controls = true,
}) => {
  // Single ref — typed as any to satisfy both iframe (web) and WebView (native)
  const playerRef = useRef<HTMLIFrameElement | WebView | null>(null);

  // ── Context (same try/catch pattern as before) ─────────────────────────
  let playbackState: PLAYER_STATES = PLAYER_STATES.UNSTARTED;
  let currentTime = 0;
  let inVideoWithTranscriptProvider = false;
  let playVideo = autoplay;
  let seekTime: number | undefined;
  let resetSeekTime: () => void = () => {};
  let updatePlaybackState: (state: PLAYER_STATES) => void = () => {};
  let updateCurrentTime: (time: number, isSeeking?: boolean) => void = () => {};
  let updateDuration: (duration: number) => void = () => {};
  let updatePlayVideo: (isPlaying: boolean) => void = () => {};

  try {
    const context = useVideoWithTranscriptContext();
    playbackState = context.playbackState;
    currentTime = context.currentTime;
    resetSeekTime = context.resetSeekTime;
    updatePlaybackState = context.updatePlaybackState;
    updateCurrentTime = context.updateCurrentTime;
    updateDuration = context.updateDuration;
    playVideo = context.playVideo;
    updatePlayVideo = context.updatePlayVideo;
    inVideoWithTranscriptProvider = true;
    seekTime = context.seekTime;
  } catch (_error) {
    // Not wrapped in a VideoWithTranscriptProvider — operate standalone
  }

  // ── Memoize injected HTML ──────────────────────────────────────────────
  const html = useMemo(
    () => buildYouTubeHTML(youtubeId, startTime, controls),
    [youtubeId, startTime, controls],
  );

  // ── Shared message handler (dispatches incoming player messages) ───────
  const handleMessage = useCallback(
    (data: YouTubeMessage) => {
      switch (data.type) {
        case "ready":
          if (inVideoWithTranscriptProvider && data.duration != null) {
            updateDuration(data.duration);
            postCommandToPlayer(playerRef.current, { command: "startPoll" });
          }
          break;
        case "stateChange":
          if (
            inVideoWithTranscriptProvider &&
            data.state != null &&
            data.state !== playbackState
          ) {
            updatePlaybackState(data.state as PLAYER_STATES);
            if (data.state === PLAYER_STATES.PLAYING) {
              updatePlayVideo(true);
            } else if (data.state === PLAYER_STATES.PAUSED) {
              updatePlayVideo(false);
            }
          }
          break;
        case "currentTime":
          if (
            inVideoWithTranscriptProvider &&
            playbackState === PLAYER_STATES.PLAYING &&
            data.time != null
          ) {
            updateCurrentTime(data.time);
          }
          break;
        case "duration":
          if (inVideoWithTranscriptProvider && data.duration != null) {
            updateDuration(data.duration);
          }
          break;
        case "error":
          console.warn("[YouTubeVideo] Player error:", data.data);
          break;
        default:
          break;
      }
    },
    [
      inVideoWithTranscriptProvider,
      playbackState,
      updatePlaybackState,
      updatePlayVideo,
      updateCurrentTime,
      updateDuration,
    ],
  );

  // ── Native message handler (WebView onMessage) ─────────────────────────
  const onWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        handleMessage(JSON.parse(event.nativeEvent.data));
      } catch (_e) { /* ignore malformed */ }
    },
    [handleMessage],
  );

  // ── Web message handler (window postMessage listener) ──────────────────
  useEffect(() => {
    if (!IS_WEB) return;

    const listener = (event: MessageEvent) => {
      // Only accept messages from our own iframe
      const iframe = playerRef.current as HTMLIFrameElement | null;
      if (!iframe || event.source !== iframe.contentWindow) return;
      try {
        handleMessage(JSON.parse(event.data));
      } catch (_e) { /* ignore malformed */ }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [handleMessage]);

  // ── Sync play / pause ──────────────────────────────────────────────────
  const prevPlayRef = useRef(playVideo);
  useEffect(() => {
    if (prevPlayRef.current !== playVideo) {
      postCommandToPlayer(playerRef.current, {
        command: playVideo ? "play" : "pause",
      });
    }
    prevPlayRef.current = playVideo;
  }, [playVideo]);

  // ── Sync mute ──────────────────────────────────────────────────────────
  const prevMuteRef = useRef(mute);
  useEffect(() => {
    if (prevMuteRef.current !== mute) {
      postCommandToPlayer(playerRef.current, {
        command: mute ? "mute" : "unmute",
      });
    }
    prevMuteRef.current = mute;
  }, [mute]);

  // ── Handle seek (context-driven) ───────────────────────────────────────
  const prevSeekRef = useRef(seekTime);
  useEffect(() => {
    if (
      inVideoWithTranscriptProvider &&
      seekTime !== undefined &&
      seekTime !== prevSeekRef.current
    ) {
      postCommandToPlayer(playerRef.current, {
        command: "seekTo",
        seconds: currentTime,
      });
      resetSeekTime();
    }
    prevSeekRef.current = seekTime;
  }, [seekTime, currentTime, inVideoWithTranscriptProvider, resetSeekTime]);

  // ── Cleanup polling on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      postCommandToPlayer(playerRef.current, { command: "stopPoll" });
    };
  }, []);

  // ── Shared style ───────────────────────────────────────────────────────
  const playerStyle = useMemo(
    () => ({
      height,
      width: "100%" as const,
      backgroundColor: "#000" as const,
      border: "none" as const,
      // opacity 0.99 workaround for Android rendering quirk
      ...(IS_WEB ? {} : { opacity: 0.99 as const }),
    }),
    [height],
  );

  // ── Render ─────────────────────────────────────────────────────────────
  if (IS_WEB) {
    return (
      <iframe
        ref={(el) => {
          (playerRef as React.MutableRefObject<HTMLIFrameElement | null>).current = el;
        }}
        key={`${youtubeId}-${startTime}`}
        srcDoc={html}
        style={playerStyle}
        title={`YouTube video ${youtubeId}`}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
      />
    );
  }

  return (
    <WebView
      ref={playerRef as React.Ref<WebView>}
      key={`${youtubeId}-${startTime}`}
      source={{ html }}
      style={playerStyle}
      javaScriptEnabled
      domStorageEnabled
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      onMessage={onWebViewMessage}
      onShouldStartLoadWithRequest={(request) => {
        if (
          request.url.startsWith("about:blank") ||
          request.url.startsWith("data:text/html") ||
          request.url.includes("youtube.com/embed/")
        ) {
          return true;
        }
        return false;
      }}
      allowsAirPlayForMediaPlayback
    />
  );
};