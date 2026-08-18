package expo.modules.rubytext

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.util.Log

class RubyTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RubyText")

    // Capability probe: matches iOS so JS only mounts RubyTextParagraph when
    // this build has the paragraph view.
    Function("isParagraphRendererAvailable") {
      true
    }

    View(RubyTextView::class) {
      Events("onTap")

      // Parse as raw dictionaries (same as iOS): the Record converter falls
      // back to reflection when Introspectable metadata is missing, and the
      // reflection path can drop segments whose optional `reading` key is
      // absent — blanking every ruby-bearing token.
      Prop("segments") { view: RubyTextView, segments: List<Map<String, Any?>> ->
        view.segments = segments.mapNotNull { dict ->
          val text = dict["text"] as? String ?: return@mapNotNull null
          RubySegmentRecord(text = text, reading = dict["reading"] as? String)
        }
        Log.i("LP Mobile", "[RubyText] segments prop -> ${view.segments.size} runs (first=${view.segments.firstOrNull()?.text})")
      }

      Prop("reserveReadingSlot") { view: RubyTextView, reserve: Boolean ->
        view.reserveReadingSlot = reserve
      }

      Prop("fontSize") { view: RubyTextView, size: Float ->
        view.fontSize = size
      }

      Prop("lineHeight") { view: RubyTextView, height: Float ->
        view.lineHeight = height
      }

      Prop("readingSize") { view: RubyTextView, size: Float ->
        view.readingSize = size
      }

      Prop("rubyPull") { view: RubyTextView, pull: Float ->
        view.rubyPull = pull
      }

      Prop("color") { view: RubyTextView, color: String ->
        view.color = parseColorSafely(color)
      }

      Prop("readingColor") { view: RubyTextView, color: String ->
        view.readingColor = parseColorSafely(color)
      }

      Prop("fontWeight") { view: RubyTextView, weight: String ->
        view.fontWeight = weight
      }

      Prop("underline") { view: RubyTextView, underline: Boolean ->
        view.underline = underline
      }

      Prop("fontFamily") { view: RubyTextView, family: String? ->
        view.fontFamily = family
      }
    }

    View(RubyTextParagraphView::class) {
      Events("onTokenTap", "onSelection")

      Prop("runs") { view: RubyTextParagraphView, runs: List<Map<String, Any?>> ->
        view.runs = runs.mapNotNull { dict ->
          val text = dict["text"] as? String ?: return@mapNotNull null
          RubyParagraphRun(
            tokenId = (dict["tokenId"] as? Number)?.toInt() ?: 0,
            text = text,
            reading = dict["reading"] as? String,
            fontSize = (dict["fontSize"] as? Number)?.toFloat(),
            tappable = dict["tappable"] as? Boolean ?: false,
            color = parseColorSafely(dict["color"] as? String ?: ""),
            readingColor = parseColorSafely(dict["readingColor"] as? String ?: ""),
            bold = dict["bold"] as? Boolean ?: false,
            underline = dict["underline"] as? Boolean ?: false,
            italic = dict["italic"] as? Boolean ?: false,
            background = dict["background"]?.let { parseColorSafely(it as? String ?: "") },
            backgroundAlpha = (dict["backgroundAlpha"] as? Number)?.toFloat() ?: 1f,
            opacity = (dict["opacity"] as? Number)?.toFloat() ?: 1f
          )
        }
        Log.i("LP Mobile", "[RubyText] paragraph runs prop -> ${view.runs.size} runs (first=${view.runs.firstOrNull()?.text})")
      }

      Prop("fontSize") { view: RubyTextParagraphView, size: Float ->
        view.fontSize = size
      }

      Prop("lineHeight") { view: RubyTextParagraphView, height: Float ->
        view.lineHeight = height
      }

      Prop("readingSize") { view: RubyTextParagraphView, size: Float ->
        view.readingSize = size
      }

      Prop("isRtl") { view: RubyTextParagraphView, rtl: Boolean ->
        view.isRtl = rtl
      }

      Prop("fontFamily") { view: RubyTextParagraphView, family: String? ->
        view.fontFamily = family
      }

      Prop("clearSelection") { view: RubyTextParagraphView, nonce: Int ->
        view.clearSelection = nonce
      }
    }
  }
}
