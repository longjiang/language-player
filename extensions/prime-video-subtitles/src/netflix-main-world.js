/**
 * Netflix MAIN world script — injected via <script src> at document_start.
 *
 * Hooks JSON.parse BEFORE Netflix's JavaScript loads. When the playback
 * manifest is intercepted, subtitle track metadata is extracted and posted
 * back to the content script via window.postMessage.
 *
 * This MUST be an external file (not inline) to bypass Netflix's CSP.
 * Injected synchronously via DOM <script> tag — the browser blocks parsing
 * until this script executes, guaranteeing JSON.parse is hooked in time.
 *
 * Approach proven by NflxMultiSubs (gmertes/NflxMultiSubs, v3.0.3, 229★).
 */
(function () {
  'use strict';

  // Guard against double-injection
  if (window.__lpvNetflixActive) return;
  window.__lpvNetflixActive = true;

  var originalParse = JSON.parse;
  var netflixSubsLoaded = false;

  JSON.parse = function (text) {
    var data = originalParse(text);

    if (!netflixSubsLoaded && data && data.result) {
      var tracks =
        data.result.timedtexttracks ||
        data.result.textTracks ||
        data.result.timedTextTracks ||
        data.result.subtitleTracks ||
        data.result.ttTracks;

      if (tracks && tracks.length > 0) {
        netflixSubsLoaded = true;

        // Extract track metadata: language, URL, format
        var trackList = [];
        var formats = ['webvtt-lssdh-ios8', 'dfxp-ls-sdh', 'imsc1.1', 'simplesdh'];

        for (var i = 0; i < tracks.length; i++) {
          var t = tracks[i];
          if (t.isNoneTrack) continue;

          var dl = t.ttDownloadables || t.downloadables || {};
          var url = '';
          var fmt = '';

          for (var j = 0; j < formats.length; j++) {
            var d = dl[formats[j]];
            if (d) {
              var urls = d.downloadUrls;
              if (!urls && d.urls) {
                urls = [];
                for (var k = 0; k < d.urls.length; k++) {
                  urls.push(d.urls[k].url);
                }
              }
              if (urls && urls.length > 0) {
                url = typeof urls[0] === 'string' ? urls[0] : Object.values(urls)[0];
                fmt = formats[j];
                break;
              }
            }
          }

          if (url) {
            trackList.push({
              language: t.language || t.languageCode || '',
              languageCode: t.language || t.languageCode || '',
              trackType: t.trackType || '',
              isNoneTrack: false,
              url: url,
              format: fmt,
            });
          }
        }

        // Restore original JSON.parse immediately — no ongoing overhead
        JSON.parse = originalParse;

        // Post tracks back to the content script
        window.postMessage(
          {
            source: 'lpv-netflix',
            type: 'netflixTracks',
            tracks: trackList,
          },
          '*'
        );

        console.log(
          '[LanguagePlayer] MAIN: intercepted ' + trackList.length + ' Netflix tracks, JSON.parse restored'
        );
      }
    }

    return data;
  };

  console.log('[LanguagePlayer] MAIN: JSON.parse monkeypatch active (sync injection)');
})();
