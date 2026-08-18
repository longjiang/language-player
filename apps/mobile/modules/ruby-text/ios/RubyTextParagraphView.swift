import CoreText
import ExpoModulesCore
import UIKit

/**
 * Paragraph-level ruby renderer (iOS only).
 *
 * Unlike RubyTextView (one UILabel per token), this view puts an entire
 * block of tokens into ONE attributed string rendered by a single
 * UITextView. Core Text can then see every neighbor glyph while laying out
 * the line, so CTRubyAlignment/CTRubyOverhang can actually compute against
 * adjacent tokens (JIS-style overhang into punctuation blanks and at line
 * edges) instead of being confined to one token's box.
 *
 * Fabric/Yoga does not measure custom host views, so JS renders an invisible
 * RN Text with the same font/line-height and passes the exact box via
 * `style`. Taps are mapped back to a token id using UITextView's UITextInput
 * geometry (closestPosition → UTF-16 offset → run lookup).
 */
internal final class RubyTextParagraphView: ExpoView {
  /// Last mounted paragraph view, so the JS side can pull diagnostics through
  /// the module when a paragraph renders blank (dev builds only).
  internal static weak var lastDiagnosticsView: RubyTextParagraphView?

  private let textView = UITextView()
  let onTokenTap = EventDispatcher()
  let onLineGrid = EventDispatcher()
  /// Cheap key of the last emitted line grid (content length + width) — the
  /// grid depends only on those, so this dedupes re-layouts without paying
  /// for the in-memory replica layout.
  private var lastGridKey = ""

  var runs: [RubyTextParagraphRun] = [] { didSet { rebuild() } }
  var fontSize: Double = 16 { didSet { rebuild() } }
  var lineHeight: Double = 26 { didSet { rebuild() } }
  var readingSize: Double = 9 { didSet { rebuild() } }
  var isRtl = false { didSet { rebuild() } }
  var fontFamily: String? { didSet { rebuild() } }

  private var attributedString: NSAttributedString?
  /// Whether the current attributed string has been applied to a real
  /// (non-zero) text container. UITextView lays out lazily: setting
  /// attributedText while the container is still zero-sized can leave the
  /// text blank even after the frame is set, so we re-apply once bounds exist.
  private var hasLaidOutText = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    RubyTextParagraphView.lastDiagnosticsView = self
    print("[LP Mobile] [RubyTextParagraph] init textKit=\(textView.textLayoutManager != nil ? "2" : "1") textLayoutManager=\(String(describing: textView.textLayoutManager))")

    isOpaque = false
    clipsToBounds = false

    textView.isEditable = false
    textView.isSelectable = false
    textView.isScrollEnabled = false
    textView.textContainerInset = .zero
    textView.textContainer.lineFragmentPadding = 0
    textView.backgroundColor = .clear
    textView.isOpaque = false
    textView.clipsToBounds = false
    addSubview(textView)

    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
    addGestureRecognizer(tap)
  }

  internal var diagnostics: [String: Any] {
    [
      "runs": runs.count,
      "chars": attributedString?.length ?? -1,
      "bounds": String(describing: bounds),
      "tvFrame": String(describing: textView.frame),
      "tvTextLen": textView.attributedText?.length ?? -1,
      "tvText": String(textView.text.prefix(40)),
      "runTexts": runs.prefix(8).map(\.text),
      "textKit": textView.textLayoutManager != nil ? "2" : "1",
      "readingSize": readingSize,
      "fontFamily": fontFamily ?? "nil",
    ]
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let frameChanged = textView.frame.size != bounds.size
    textView.frame = bounds
    if let attributedString, (!hasLaidOutText || frameChanged), bounds.width > 0, bounds.height > 0 {
      textView.attributedText = attributedString
      hasLaidOutText = true
    }
    print("[LP Mobile] [RubyTextParagraph] layout bounds=\(bounds) tvFrame=\(textView.frame) textLen=\(textView.attributedText?.length ?? -1)")
    // ⚠️ DO NOT re-add layoutManager access here (e.g. a debug-only
    // logLineFragments dump): forcing `textView.layoutManager` glyph layout
    // after layout breaks CTRubyAnnotation painting on iPadOS 26.6 (readings
    // silently never draw in Debug builds; Release was unaffected only
    // because the code was #if DEBUG). See build ledger — 2026-08-16.
    emitLineGridIfChanged()
  }

  @objc
  private func handleTap(_ gesture: UITapGestureRecognizer) {
    let point = gesture.location(in: textView)
    guard let position = textView.closestPosition(to: point) else { return }
    let offset = textView.offset(from: textView.beginningOfDocument, to: position)
    guard let run = run(atUtf16Offset: offset), run.tappable else { return }
    onTokenTap(["tokenId": run.tokenId])
  }

  private func run(atUtf16Offset offset: Int) -> RubyTextParagraphRun? {
    let total = runs.reduce(0) { $0 + ($1.text as NSString).length }
    guard total > 0 else { return nil }
    let clamped = min(max(offset, 0), total - 1)
    var cursor = 0
    for run in runs {
      cursor += (run.text as NSString).length
      if clamped < cursor {
        return run
      }
    }
    return runs.last
  }

  private func rebuild() {
    attributedString = makeAttributedString()
    hasLaidOutText = false
    if bounds.width > 0, bounds.height > 0 {
      textView.attributedText = attributedString
      hasLaidOutText = true
    }
    print("[LP Mobile] [RubyTextParagraph] rebuild runs=\(runs.count) chars=\(attributedString?.length ?? -1) readingSlotLineHeight=\(lineHeight) readingSize=\(readingSize) fontFamily=\(fontFamily ?? "nil") readingFont=\(makeReadingFont().fontName)")
    emitLineGridIfChanged()
  }

  /// Line grid of the base text exactly as this paragraph lays out WITH its
  /// ruby annotations — the reading band pushes the base text's baseline down
  /// inside each pinned line box, so a ruby-free RN Text cannot reproduce it.
  /// Measured on a throwaway in-memory TextKit 2 layout (same attributed
  /// string, same width): never touches the live textView, so it can't trip
  /// the CTRubyAnnotation painting bug (see layoutSubviews note).
  private func makeLineGrid() -> [[String: Double]] {
    guard let attributedString, bounds.width > 0, bounds.height > 0 else { return [] }
    let contentStorage = NSTextContentStorage()
    contentStorage.attributedString = attributedString
    let layoutManager = NSTextLayoutManager()
    contentStorage.addTextLayoutManager(layoutManager)
    let container = NSTextContainer(size: CGSize(width: bounds.width, height: .greatestFiniteMagnitude))
    container.lineFragmentPadding = 0
    layoutManager.textContainer = container
    let range = contentStorage.documentRange
    layoutManager.ensureLayout(for: range)

    var grid: [[String: Double]] = []
    layoutManager.enumerateTextLayoutFragments(from: range.location, options: [.ensuresLayout]) { fragment in
      let frame = fragment.layoutFragmentFrame
      // Base text baseline offset from the line top: the first text line
      // fragment's glyph origin (the glyph origin IS the baseline origin).
      var ascender = Double(frame.size.height)
      if let line = fragment.textLineFragments.first {
        ascender = Double(line.glyphOrigin.y)
      }
      grid.append([
        "y": Double(frame.origin.y),
        "height": Double(frame.size.height),
        "ascender": ascender,
      ])
      return true
    }
    return grid
  }

  /// Emits the base-text line grid to JS when it changed (mount, re-layout,
  /// width change, content change, font/line-height prop change).
  private func emitLineGridIfChanged() {
    guard let attributedString, bounds.width > 0, bounds.height > 0 else { return }
    let key = "\(attributedString.length):\(Int(bounds.width)):\(Int(lineHeight)):\(Int(readingSize)):\(Int(fontSize)):\(isRtl ? 1 : 0):\(fontFamily ?? "")"
    guard key != lastGridKey else { return }
    lastGridKey = key
    let grid = makeLineGrid()
    guard !grid.isEmpty else { return }
    let sig = grid
      .map { "\(Int($0["y"] ?? 0)):\(Int($0["height"] ?? 0)):\(Int($0["ascender"] ?? 0))" }
      .joined(separator: "|")
    print("[LP Mobile] [RubyTextParagraph] line-grid lines=\(grid.count) sig=\(sig)")
    onLineGrid(["lines": grid])
  }

  private func makeAttributedString() -> NSAttributedString? {
    guard !runs.isEmpty else { return nil }

    let paragraph = NSMutableParagraphStyle()
    // Every line gets the same box: base line height + reserved reading slot.
    // Ruby lines and plain lines therefore stay uniform, mirroring the
    // per-token views' reserveReadingSlot behavior.
    paragraph.minimumLineHeight = CGFloat(lineHeight)
    paragraph.maximumLineHeight = CGFloat(lineHeight)
    paragraph.lineBreakMode = .byWordWrapping
    if isRtl {
      paragraph.baseWritingDirection = .rightToLeft
    }

    let result = NSMutableAttributedString()
    for (runIndex, run) in runs.enumerated() {
      let runFontSize = run.fontSize ?? fontSize
      let baseFont = makeFont(size: CGFloat(runFontSize), weight: run.bold ? .bold : .regular)
      var attributes: [NSAttributedString.Key: Any] = [
        .font: baseFont,
        .foregroundColor: run.color.withAlphaComponent(CGFloat(run.opacity)),
        .paragraphStyle: paragraph,
      ]
      if run.underline {
        attributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
      }
      if run.italic {
        attributes[.obliqueness] = 0.25
      }
      if let background = run.background {
        attributes[.backgroundColor] = background.withAlphaComponent(CGFloat(run.backgroundAlpha))
      }

      let range = NSRange(location: result.length, length: (run.text as NSString).length)
      result.append(NSAttributedString(string: run.text, attributes: attributes))

      if let reading = run.reading, !reading.isEmpty {
        let readingFont = makeReadingFont()
        let readingAttributes: [String: Any] = [
          kCTFontAttributeName as String: readingFont,
          kCTForegroundColorAttributeName as String: run.readingColor.withAlphaComponent(CGFloat(run.opacity)),
        ]
#if DEBUG
        let syllables = reading.split(separator: " ").count
        print("[LP Mobile] [RubyTextParagraph] attach-ruby run=\(runIndex) range=\(range.location)..<\(range.location + range.length) baseChars=\(range.length) syllables=\(syllables) reading=\"\(reading)\"")
#endif
        let annotation = CTRubyAnnotationCreateWithAttributes(
          .center,
          .auto,
          .before,
          reading as CFString,
          readingAttributes as CFDictionary
        )
        result.addAttribute(
          NSAttributedString.Key(kCTRubyAnnotationAttributeName as String),
          value: annotation,
          range: range
        )
      }
    }
    return result
  }

  private func makeFont(size: CGFloat, weight: UIFont.Weight) -> UIFont {
    if let family = fontFamily, !family.isEmpty {
      if weight == .bold, let boldFont = UIFont(name: "\(family)-Bold", size: size) {
        return boldFont
      }
      if let font = UIFont(name: family, size: size) {
        return font
      }
    }
    return UIFont.systemFont(ofSize: size, weight: weight)
  }

  /** Readings follow the base font family (serif/sans-serif setting), falling
   *  back to the system font when no family is set. Missing glyphs (e.g. kana
   *  in Georgia) cascade through Core Text's font fallback. */
  private func makeReadingFont() -> UIFont {
    if let family = fontFamily, !family.isEmpty, let font = UIFont(name: family, size: CGFloat(readingSize)) {
      return font
    }
    return UIFont.systemFont(ofSize: CGFloat(readingSize), weight: .regular)
  }
}
