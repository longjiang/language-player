import ExpoModulesCore

/** One base-text + optional-reading pair, mirroring RubySegment from @langplayer/utils. */
internal struct RubySegmentRecord: Record {
  @Field
  var text: String = ""

  @Field
  var reading: String? = nil
}
