require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'SaveAppDocumentThumbnailing'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = { :type => 'Proprietary', :text => 'Private SaveApp module. All rights reserved.' }
  s.author = package['author']
  s.homepage = package['homepage']
  s.source = { :git => 'https://github.com/LuanRigatti/SaveApp.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true

  s.frameworks = 'QuickLookThumbnailing', 'UIKit'
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
