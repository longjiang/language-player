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
#if DEBUG
  /// One-shot line-fragment dump per rebuild (diagnostic only).
  private var didLogLineFragments = false
#endif

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    RubyTextParagraphView.lastDiagnosticsView = self

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
#if DEBUG
    if !didLogLineFragments {
      DispatchQueue.main.async { [weak self] in self?.logLineFragments() }
    }
#endif
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
    print("[LP Mobile] [RubyTextParagraph] rebuild runs=\(runs.count) chars=\(attributedString?.length ?? -1) readingSlotLineHeight=\(lineHeight)")
#if DEBUG
    didLogLineFragments = false
    if let attributedString {
      attributedString.enumerateAttribute(
        NSAttributedString.Key(kCTRubyAnnotationAttributeName as String),
        in: NSRange(location: 0, length: attributedString.length),
        options: []
      ) { value, range, _ in
        guard value != nil else { return }
        let base = (attributedString.string as NSString).substring(with: range)
        print("[LP Mobile] [RubyTextParagraph] ruby-attr range=\(range.location)..<\(range.location + range.length) base=\"\(base)\" baseLen=\(range.length)")
      }
    }
#endif
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

#if DEBUG
  /** Dump the line fragments (and their character ranges) once per rebuild,
   *  so a ruby annotation split across a line break is visible in the log. */
  private func logLineFragments() {
    guard !didLogLineFragments,
          let attributedText = textView.attributedText,
          attributedText.length > 0 else { return }
    didLogLineFragments = true
    let layoutManager = textView.layoutManager
    let glyphRange = layoutManager.glyphRange(for: textView.textContainer)
    guard glyphRange.location != NSNotFound, glyphRange.length > 0 else {
      didLogLineFragments = false
      return
    }
    var rubyRanges: [NSRange] = []
    attributedText.enumerateAttribute(
      NSAttributedString.Key(kCTRubyAnnotationAttributeName as String),
      in: NSRange(location: 0, length: attributedText.length),
      options: []
    ) { value, range, _ in
      if value != nil { rubyRanges.append(range) }
    }
    var glyphIndex = glyphRange.location
    var lineIndex = 0
    while glyphIndex < NSMaxRange(glyphRange) {
      var effectiveGlyphRange = NSRange()
      let rect = layoutManager.lineFragmentRect(forGlyphAt: glyphIndex, effectiveRange: &effectiveGlyphRange)
      if effectiveGlyphRange.length == 0 {
        didLogLineFragments = false
        break
      }
      let charRange = layoutManager.characterRange(forGlyphRange: effectiveGlyphRange, actualGlyphRange: nil)
      let lineText = (attributedText.string as NSString).substring(with: charRange)
      let hasRuby = rubyRanges.contains { NSIntersectionRange($0, charRange).length > 0 }
      if hasRuby {
        print("[LP Mobile] [RubyTextParagraph] line[\(lineIndex)] glyphs=\(effectiveGlyphRange.location)..<\(NSMaxRange(effectiveGlyphRange)) chars=\(charRange.location)..<\(NSMaxRange(charRange)) rect=\(rect) text=\"\(lineText)\"")
      }
      lineIndex += 1
      glyphIndex = NSMaxRange(effectiveGlyphRange)
    }
  }
#endif

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
