require 'json'
require 'pathname'

SAVEAPP_EXPO_WIDGETS_VERSION = '58.0.26'.freeze
SAVEAPP_EXPO_WIDGETS_POD_TARGET = 'ExpoWidgets'.freeze
SAVEAPP_EXPO_WIDGETS_ALLOWED_PRODUCT_TYPES = [
  'com.apple.product-type.library.static',
  'com.apple.product-type.framework'
].freeze
SAVEAPP_EXPO_WIDGETS_RENDERER = 'node_modules/expo-widgets/ios/Widgets/Buttons.swift'.freeze
SAVEAPP_QUICK_SAVE_SOURCES = [
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveQueue.swift'
].freeze

def saveapp_quick_save_canonical_path(path, context)
  File.realpath(path.to_s)
rescue Errno::ENOENT, Errno::ENOTDIR => error
  raise "SaveApp quick-save could not resolve #{context}: #{path} (#{error.class})."
end

def saveapp_quick_save_source_phase(target)
  phases = target.build_phases.grep(Xcodeproj::Project::Object::PBXSourcesBuildPhase)
  unless phases.length == 1
    raise "SaveApp quick-save expected one existing Compile Sources phase in #{target.name}; found #{phases.length}."
  end
  phases.first
end

def saveapp_quick_save_native_target(project)
  targets = project.native_targets.select { |target| target.name == SAVEAPP_EXPO_WIDGETS_POD_TARGET }
  unless targets.length == 1
    raise "SaveApp quick-save expected exactly one PBXNativeTarget named #{SAVEAPP_EXPO_WIDGETS_POD_TARGET}; found #{targets.length}."
  end

  target = targets.first
  non_native_targets = project.targets.select do |candidate|
    candidate.name == SAVEAPP_EXPO_WIDGETS_POD_TARGET && !candidate.is_a?(Xcodeproj::Project::Object::PBXNativeTarget)
  end
  unless non_native_targets.empty?
    raise "SaveApp quick-save found non-native target(s) also named #{SAVEAPP_EXPO_WIDGETS_POD_TARGET}; refusing an ambiguous CocoaPods target."
  end

  unless SAVEAPP_EXPO_WIDGETS_ALLOWED_PRODUCT_TYPES.include?(target.product_type)
    raise "SaveApp quick-save expected #{SAVEAPP_EXPO_WIDGETS_POD_TARGET} to be a static library or framework target; found product type #{target.product_type.inspect}."
  end
  target
end

def saveapp_quick_save_build_files_for_paths(project, target, phase, expected_paths)
  expected_by_basename = expected_paths.each_with_object({}) do |path, result|
    basename = File.basename(path)
    result[basename] ||= []
    result[basename] << path
  end

  phase.files.each_with_object([]) do |build_file, result|
    file_ref = build_file.file_ref
    next unless file_ref && file_ref.isa == 'PBXFileReference'

    basename = File.basename(file_ref.path.to_s.tr('\\', '/'))
    next unless expected_by_basename.key?(basename)

    resolved_path = saveapp_quick_save_canonical_path(file_ref.real_path, "PBXFileReference in #{target.name}")
    next unless expected_paths.include?(resolved_path)

    result << [build_file, file_ref, resolved_path]
  end
end

def saveapp_quick_save_verify_build_file_membership(project, target, phase, original_path, quick_save_paths)
  expected_paths = [original_path] + quick_save_paths
  expected_basenames = expected_paths.map { |path| File.basename(path) }.uniq
  targets_by_build_file = Hash.new { |hash, key| hash[key] = [] }

  project.native_targets.each do |native_target|
    native_target.build_phases.each do |build_phase|
      next unless build_phase.respond_to?(:files)

      build_phase.files.each do |build_file|
        targets_by_build_file[build_file.uuid] << [native_target.uuid, build_phase.uuid]
      end
    end
  end

  project.objects.each do |object|
    next unless object.isa == 'PBXBuildFile'

    file_ref = object.file_ref
    next unless file_ref && expected_basenames.include?(File.basename(file_ref.path.to_s.tr('\\', '/')))

    resolved_path = saveapp_quick_save_canonical_path(
      file_ref.real_path,
      "PBXBuildFile reference in #{target.name}"
    )
    next unless expected_paths.include?(resolved_path)

    memberships = targets_by_build_file[object.uuid]
    if resolved_path == original_path
      unless memberships.empty?
        raise 'SaveApp quick-save renderer replacement is incomplete: the original Widgets/Buttons.swift still has a PBXBuildFile membership.'
      end
      next
    end

    unless memberships == [[target.uuid, phase.uuid]]
      raise "SaveApp quick-save source #{File.basename(resolved_path)} must have exactly one PBXBuildFile membership in #{target.name}'s Compile Sources phase; found #{memberships.length}."
    end
  end
end

def saveapp_verify_expo_widgets_quick_save_project(project, repository_root)
  root = File.realpath(repository_root)
  original_path = saveapp_quick_save_canonical_path(
    File.join(root, SAVEAPP_EXPO_WIDGETS_RENDERER),
    'the installed expo-widgets renderer'
  )
  quick_save_paths = SAVEAPP_QUICK_SAVE_SOURCES.map do |relative_path|
    saveapp_quick_save_canonical_path(File.join(root, relative_path), relative_path)
  end
  expected_paths = [original_path] + quick_save_paths

  target = saveapp_quick_save_native_target(project)
  phase = saveapp_quick_save_source_phase(target)

  project.native_targets.each do |other_target|
    next if other_target.uuid == target.uuid

    source_phases = other_target.build_phases.grep(Xcodeproj::Project::Object::PBXSourcesBuildPhase)
    source_phases.each do |other_phase|
      misplaced = saveapp_quick_save_build_files_for_paths(project, other_target, other_phase, expected_paths)
      unless misplaced.empty?
        names = misplaced.map { |entry| File.basename(entry[2]) }.uniq.join(', ')
        raise "SaveApp quick-save source(s) #{names} are also compiled by unrelated target #{other_target.name}."
      end
    end
  end

  entries = saveapp_quick_save_build_files_for_paths(project, target, phase, expected_paths)
  entries_by_path = entries.group_by { |entry| entry[2] }
  duplicate_paths = entries_by_path.select { |_path, records| records.length > 1 }.keys
  unless duplicate_paths.empty?
    raise "SaveApp quick-save found duplicate source build references: #{duplicate_paths.map { |path| File.basename(path) }.join(', ')}."
  end

  unless entries_by_path[original_path].nil?
    raise 'SaveApp quick-save renderer replacement is incomplete: the original Widgets/Buttons.swift is still compiled.'
  end

  missing_sources = quick_save_paths.reject { |path| entries_by_path.key?(path) }
  unless missing_sources.empty?
    raise "SaveApp quick-save target is missing source build reference(s): #{missing_sources.map { |path| File.basename(path) }.join(', ')}."
  end

  saveapp_quick_save_verify_build_file_membership(
    project,
    target,
    phase,
    original_path,
    quick_save_paths
  )

  {
    target: target,
    phase: phase,
    original_path: original_path,
    quick_save_paths: quick_save_paths
  }
end

def saveapp_configure_expo_widgets_quick_save(installer, repository_root)
  root = File.realpath(repository_root)
  package_path = File.join(root, 'node_modules', 'expo-widgets', 'package.json')
  raise 'SaveApp quick-save requires expo-widgets package metadata.' unless File.file?(package_path)

  package = JSON.parse(File.read(package_path))
  unless package['version'] == SAVEAPP_EXPO_WIDGETS_VERSION
    raise "SaveApp quick-save native renderer contract expects expo-widgets #{SAVEAPP_EXPO_WIDGETS_VERSION}."
  end

  SAVEAPP_QUICK_SAVE_SOURCES.each do |relative_source|
    absolute_source = File.join(root, relative_source)
    raise "SaveApp quick-save source is missing: #{relative_source}" unless File.file?(absolute_source)
  end

  project = installer.pods_project
  target = saveapp_quick_save_native_target(project)
  phase = saveapp_quick_save_source_phase(target)
  original_path = saveapp_quick_save_canonical_path(
    File.join(root, SAVEAPP_EXPO_WIDGETS_RENDERER),
    'the installed expo-widgets renderer'
  )
  quick_save_paths = SAVEAPP_QUICK_SAVE_SOURCES.map do |relative_path|
    saveapp_quick_save_canonical_path(File.join(root, relative_path), relative_path)
  end
  expected_paths = [original_path] + quick_save_paths

  project.native_targets.each do |other_target|
    next if other_target.uuid == target.uuid

    other_target.build_phases.grep(Xcodeproj::Project::Object::PBXSourcesBuildPhase).each do |other_phase|
      misplaced = saveapp_quick_save_build_files_for_paths(project, other_target, other_phase, expected_paths)
      unless misplaced.empty?
        names = misplaced.map { |entry| File.basename(entry[2]) }.uniq.join(', ')
        raise "SaveApp quick-save source(s) #{names} are assigned to unrelated target #{other_target.name}."
      end
    end
  end

  entries = saveapp_quick_save_build_files_for_paths(project, target, phase, expected_paths)
  entries_by_path = entries.group_by { |entry| entry[2] }
  duplicates = entries_by_path.select { |_path, records| records.length > 1 }.keys
  unless duplicates.empty?
    raise "SaveApp quick-save found duplicate source build references: #{duplicates.map { |path| File.basename(path) }.join(', ')}."
  end

  original_entries = entries_by_path[original_path] || []
  if original_entries.empty?
    saveapp_verify_expo_widgets_quick_save_project(project, root)
    return
  end
  unless original_entries.length == 1
    raise "SaveApp quick-save expected exactly one canonical expo-widgets renderer in #{target.name}; found #{original_entries.length}."
  end

  # Resolve all references before mutating so broken groups or missing files fail closed.
  references_by_path = {}
  quick_save_paths.each do |source_path|
    refs = project.files.select do |file_ref|
      next false unless file_ref.isa == 'PBXFileReference'
      next false unless File.basename(file_ref.path.to_s.tr('\\', '/')) == File.basename(source_path)

      begin
        File.realpath(file_ref.real_path.to_s) == source_path
      rescue Errno::ENOENT, Errno::ENOTDIR
        false
      end
    end
    if refs.length > 1
      raise "SaveApp quick-save found multiple PBXFileReferences for #{File.basename(source_path)}."
    end
    references_by_path[source_path] = refs.first
  end

  original_entries.each do |build_file, _file_ref, _resolved_path|
    phase.remove_build_file(build_file)
  end

  quick_save_paths.each do |source_path|
    file_ref = references_by_path[source_path]
    unless file_ref
      relative_path = Pathname.new(source_path).relative_path_from(Pathname.new(project.path.dirname.to_s)).to_s
      file_ref = project.new_file(relative_path, :group)
    end

    resolved_reference = saveapp_quick_save_canonical_path(file_ref.real_path, "new PBXFileReference for #{File.basename(source_path)}")
    unless resolved_reference == source_path
      raise "SaveApp quick-save created an incorrect file reference for #{File.basename(source_path)}."
    end

    phase.add_file_reference(file_ref, true) unless phase.include?(file_ref)
  end

  saveapp_verify_expo_widgets_quick_save_project(project, root)
end
