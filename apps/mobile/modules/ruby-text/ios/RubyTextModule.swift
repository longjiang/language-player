import ExpoModulesCore

public final class RubyTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RubyText")

    // Capability probe: the paragraph renderer is added in the same native
    // build as this function. JS only asks for the RubyTextParagraph view
    // manager when the probe returns true — requireNativeViewManager does
    // not throw for a missing view, it returns a placeholder that fails at
    // render time and blanks every token.
    Function("isParagraphRendererAvailable") {
      true
    }

    // Dev diagnostics: returns the state of the paragraph view with the given
    // React tag, so a blank render can be diagnosed per-component instead of
    // reading whatever view was created last.
    Function("getParagraphDiagnosticsForTag") { (viewTag: Int) -> [String: Any] in
      guard let appContext = self.appContext,
            let view = appContext.findView(withTag: viewTag, ofType: RubyTextParagraphView.self) else {
        return ["mounted": false, "tag": viewTag]
      }
      var diagnostics = view.diagnostics
      diagnostics["tag"] = viewTag
      return diagnostics
    }

    View(RubyTextView.self) {
      Events("onTap")

      // Parse as raw dictionaries: the [RubySegmentRecord] record converter
      // choked on NSNull for a missing reading, silently blanking every token
      // that contained a kana-only segment. `reading` is explicitly optional
      // here so null/missing values map to nil instead of failing the array.
      Prop("segments") { (view: RubyTextView, segments: [[String: Any]]) in
        view.segments = segments.compactMap { dict in
          guard let text = dict["text"] as? String else { return nil }
          return RubySegmentRecord(text: text, reading: dict["reading"] as? String)
        }
      }

      Prop("reserveReadingSlot") { (view: RubyTextView, reserve: Bool) in
        view.reserveReadingSlot = reserve
      }

      Prop("fontSize") { (view: RubyTextView, size: Double) in
        view.fontSize = size
      }

      Prop("lineHeight") { (view: RubyTextView, height: Double) in
        view.lineHeight = height
      }

      Prop("readingSize") { (view: RubyTextView, size: Double) in
        view.readingSize = size
      }

      Prop("rubyPull") { (view: RubyTextView, pull: Double) in
        view.rubyPull = pull
      }

      Prop("color") { (view: RubyTextView, color: UIColor?) in
        view.color = color ?? .label
      }

      Prop("readingColor") { (view: RubyTextView, color: UIColor?) in
        view.readingColor = color ?? .secondaryLabel
      }

      Prop("fontWeight") { (view: RubyTextView, weight: String) in
        view.fontWeight = weight
      }

      Prop("underline") { (view: RubyTextView, underline: Bool) in
        view.underline = underline
      }

      Prop("italic") { (view: RubyTextView, italic: Bool) in
        view.italic = italic
      }

      Prop("fontFamily") { (view: RubyTextView, family: String?) in
        view.fontFamily = family
      }
    }

    View(RubyTextParagraphView.self) {
      Events("onTokenTap", "onLineGrid", "onSelection")

      // Same raw-dictionary parsing as `segments` above: Expo's record
      // converter chokes on NSNull for an absent optional field, so missing
      // `reading`/`background` keys must map to nil here instead.
      Prop("runs") { (view: RubyTextParagraphView, runs: [[String: Any]]) in
        view.runs = runs.compactMap { dict in
          guard let text = dict["text"] as? String else { return nil }
          return RubyTextParagraphRun(
            text: text,
            reading: dict["reading"] as? String,
            tokenId: (dict["tokenId"] as? NSNumber)?.intValue ?? 0,
            fontSize: (dict["fontSize"] as? NSNumber)?.doubleValue,
            tappable: dict["tappable"] as? Bool ?? false,
            color: UIColor(lpHex: dict["color"] as? String) ?? .label,
            readingColor: UIColor(lpHex: dict["readingColor"] as? String) ?? .secondaryLabel,
            bold: dict["bold"] as? Bool ?? false,
            underline: dict["underline"] as? Bool ?? false,
            italic: dict["italic"] as? Bool ?? false,
            background: UIColor(lpHex: dict["background"] as? String),
            backgroundAlpha: (dict["backgroundAlpha"] as? NSNumber)?.doubleValue ?? 1,
            opacity: (dict["opacity"] as? NSNumber)?.doubleValue ?? 1
          )
        }
      }

      Prop("fontSize") { (view: RubyTextParagraphView, size: Double) in
        view.fontSize = size
      }

      Prop("lineHeight") { (view: RubyTextParagraphView, height: Double) in
        view.lineHeight = height
      }

      Prop("readingSize") { (view: RubyTextParagraphView, size: Double) in
        view.readingSize = size
      }

      Prop("isRtl") { (view: RubyTextParagraphView, rtl: Bool) in
        view.isRtl = rtl
      }

      Prop("textAlign") { (view: RubyTextParagraphView, alignment: String) in
        view.textAlign = alignment
      }

      Prop("fontFamily") { (view: RubyTextParagraphView, family: String?) in
        view.fontFamily = family
      }

      Prop("language") { (view: RubyTextParagraphView, language: String?) in
        view.language = language
      }

      Prop("rubyFontFamily") { (view: RubyTextParagraphView, family: String?) in
        view.rubyFontFamily = family
      }

      Prop("diagnosticMetrics") { (view: RubyTextParagraphView, on: Bool) in
        view.diagnosticMetrics = on
      }

      Prop("clearSelection") { (view: RubyTextParagraphView, nonce: Int) in
        view.clearSelection = nonce
      }
    }
  }
}
