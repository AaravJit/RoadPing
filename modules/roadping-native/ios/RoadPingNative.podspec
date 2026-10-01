# Local Expo module (autolinked from ./modules). PushToTalk and ActivityKit are
# weak-linked (as is CarPlay, used only by the gated scaffold) so the app still launches on iOS versions without them; every
# use is behind an availability check.
Pod::Spec.new do |s|
  s.name           = 'RoadPingNative'
  s.version        = '1.0.0'
  s.summary        = 'RoadPing push-to-talk, live location and Live Activity bridge'
  s.description    = 'Apple PushToTalk channel, Core Location while live, and the RoadPing Live Activity.'
  s.license        = 'UNLICENSED'
  s.author         = 'RoadPing'
  s.homepage       = 'https://github.com/AaravJit/RoadPing'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: 'https://github.com/AaravJit/RoadPing.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.frameworks = 'AVFoundation', 'CoreLocation', 'UIKit'
  s.weak_frameworks = 'PushToTalk', 'ActivityKit', 'CarPlay'
end
