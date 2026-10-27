require 'json'
require 'pathname'

SAVEAPP_EXPO_WIDGETS_VERSION = '58.0.23'.freeze
SAVEAPP_QUICK_SAVE_SOURCES = [
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveLiveActivityButton.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveIntent.swift',
  'modules/dynamic-island-quick-save/ios/SaveAppQuickSaveSQLite.swift'
].freeze

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
  normalized_sources = SAVEAPP_QUICK_SAVE_SOURCES.map { |path| File.realpath(File.join(root, path)) }
  source_targets = project.targets.select do |target|
    phase = target.source_build_phase
    phase && phase.files.any? do |build_file|
      file_ref = build_file.file_ref
      path = file_ref&.path.to_s.tr('\\', '/')
      is_original = path == 'Widgets/Buttons.swift' || path.end_with?('/Widgets/Buttons.swift')
      is_quick_save_source = begin
        File.realpath(File.expand_path(path, project.path.dirname)).then { |resolved| normalized_sources.include?(resolved) }
      rescue StandardError
        false
      end
      is_original || is_quick_save_source
    end
  end
  raise 'SaveApp quick-save did not find the expo-widgets Buttons.swift build phase.' if source_targets.empty?

  source_targets.each do |target|
    phase = target.source_build_phase
    original_files = phase.files.select do |build_file|
      file_ref = build_file.file_ref
      path = file_ref&.path.to_s.tr('\\', '/')
      path == 'Widgets/Buttons.swift' || path.end_with?('/Widgets/Buttons.swift')
    end
    if original_files.empty?
      existing_source_paths = phase.files.filter_map do |build_file|
        file_ref = build_file.file_ref
        next unless file_ref

        begin
          File.realpath(File.expand_path(file_ref.path.to_s, project.path.dirname))
        rescue StandardError
          nil
        end
      end
      unless normalized_sources.all? { |source| existing_source_paths.include?(source) }
        raise "SaveApp quick-save found a partial or ambiguous native patch in #{target.name}."
      end
      next
    end
    raise "SaveApp quick-save found an ambiguous Buttons.swift entry in #{target.name}." unless original_files.length == 1

    original_files.each do |build_file|
      phase.files.delete(build_file)
      build_file.remove_from_project
    end

    SAVEAPP_QUICK_SAVE_SOURCES.each do |relative_source|
      absolute_source = File.join(root, relative_source)
      relative_to_project = Pathname.new(absolute_source).relative_path_from(Pathname.new(project.path.dirname)).to_s
      existing_ref = project.files.find do |file_ref|
        begin
          File.realpath(File.expand_path(file_ref.path.to_s, project.path.dirname)) == File.realpath(absolute_source)
        rescue StandardError
          false
        end
      end
      file_ref = existing_ref || project.new_file(relative_to_project)
      already_in_sources = phase.files.any? { |build_file| build_file.file_ref == file_ref }
      phase.add_file_reference(file_ref, true) unless already_in_sources
    end
  end
end
