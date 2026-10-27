#!/usr/bin/env ruby
# Exercises the checked-in Quick Save post_install helper against real Xcodeproj objects.

require 'fileutils'
require 'pathname'
require 'tmpdir'
require 'xcodeproj'

require_relative '../modules/dynamic-island-quick-save/ios/expo_widgets_quick_save'

if ARGV.first == '--verify-generated'
  abort 'usage: ruby tests/quick-save-xcodeproj-contract.rb --verify-generated <Pods.xcodeproj> <repository-root>' unless ARGV.length == 3

  project = Xcodeproj::Project.open(ARGV[1])
  result = saveapp_verify_expo_widgets_quick_save_project(project, ARGV[2])
  source_names = result[:quick_save_paths].map { |path| File.basename(path) }
  puts "Quick Save Xcodeproj verified: #{result[:target].name} (#{source_names.join(', ')})"
  exit 0
end

require 'minitest/autorun'

class SaveAppQuickSaveXcodeprojContractTest < Minitest::Test
  QUICK_SAVE_SOURCE_NAMES = [
    'SaveAppQuickSaveLiveActivityButton.swift',
    'SaveAppQuickSaveIntent.swift',
    'SaveAppQuickSaveSQLite.swift',
  ].freeze

  Fixture = Struct.new(:root, :project, :widgets_target, :unrelated_target, :aggregate_target, :renderer_path)

  def setup
    @temporary_roots = []
  end

  def teardown
    @temporary_roots.each { |root| FileUtils.remove_entry(root) if File.exist?(root) }
  end

  def test_replaces_renderer_on_only_the_matching_static_library_target_with_nested_group_paths
    [1, 2, 3].each do |group_layout|
      fixture = create_fixture(group_layout: group_layout)
      unrelated_before = source_file_paths(fixture.unrelated_target)
      aggregate_targets_before = fixture.project.targets.grep(Xcodeproj::Project::Object::PBXAggregateTarget)
      assert_includes aggregate_targets_before, fixture.aggregate_target
      refute_respond_to fixture.aggregate_target, :source_build_phase
      assert_instance_of Xcodeproj::Project::Object::PBXNativeTarget, fixture.widgets_target

      saveapp_configure_expo_widgets_quick_save(installer_for(fixture.project), fixture.root)

      assert_project_has_exact_quick_save_sources(fixture)
      assert_equal unrelated_before, source_file_paths(fixture.unrelated_target)
      assert_equal 1, fixture.project.native_targets.count { |target| target.name == 'ExpoWidgets' }
      assert_equal 'com.apple.product-type.library.static', fixture.widgets_target.product_type
      assert_no_orphan_build_files(fixture.project)

      fixture.project.save
      reopened = Xcodeproj::Project.open(fixture.project.path)
      reopened_target = reopened.native_targets.find { |target| target.name == 'ExpoWidgets' }
      assert_equal QUICK_SAVE_SOURCE_NAMES.sort, source_file_paths(reopened_target).map { |path| File.basename(path) }.sort
      assert_equal unrelated_before, source_file_paths(reopened.native_targets.find { |target| target.name == 'UnrelatedPod' })
    end
  end

  def test_accepts_framework_target_and_preserves_its_product_type
    fixture = create_fixture(widgets_product: :framework)
    assert_equal 'com.apple.product-type.framework', fixture.widgets_target.product_type

    saveapp_configure_expo_widgets_quick_save(installer_for(fixture.project), fixture.root)

    assert_project_has_exact_quick_save_sources(fixture)
    assert_no_orphan_build_files(fixture.project)
  end

  def test_is_idempotent_after_serializing_and_reopening_both_supported_product_types
    { static_library: 'com.apple.product-type.library.static', framework: 'com.apple.product-type.framework' }.each do |product, expected_type|
      fixture = create_fixture(widgets_product: product)
      assert_equal expected_type, fixture.widgets_target.product_type
      saveapp_configure_expo_widgets_quick_save(installer_for(fixture.project), fixture.root)
      fixture.project.save
      before = File.binread(project_file_path(fixture.project))

      reopened = Xcodeproj::Project.open(fixture.project.path)
      saveapp_configure_expo_widgets_quick_save(installer_for(reopened), fixture.root)
      reopened.save

      assert_equal before, File.binread(project_file_path(reopened))
      assert_project_has_exact_quick_save_sources(fixture, reopened)
      assert_no_orphan_build_files(reopened)
    end
  end

  def test_accepts_a_complete_existing_patch_and_rejects_a_partial_patch
    complete = create_fixture(include_renderer_build_file: false, include_quick_save_sources: true)
    before = File.binread(project_file_path(complete.project))
    saveapp_configure_expo_widgets_quick_save(installer_for(complete.project), complete.root)
    complete.project.save
    assert_equal before, File.binread(project_file_path(complete.project))

    partial = create_fixture(include_renderer_build_file: false, include_quick_save_sources: true)
    missing_ref = partial.widgets_target.source_build_phase.files.find do |build_file|
      File.basename(build_file.file_ref.real_path.to_s) == QUICK_SAVE_SOURCE_NAMES.last
    end
    partial.widgets_target.source_build_phase.remove_build_file(missing_ref)
    assert_raises_message(RuntimeError, /partial or ambiguous|missing source build reference/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(partial.project), partial.root)
    end
  end

  def test_fails_before_mutating_when_a_required_source_is_missing
    fixture = create_fixture
    missing_source = File.join(fixture.root, 'modules/dynamic-island-quick-save/ios', QUICK_SAVE_SOURCE_NAMES.last)
    File.delete(missing_source)
    fixture.project.save
    before = File.binread(project_file_path(fixture.project))

    assert_raises_message(RuntimeError, /source is missing: .*SaveAppQuickSaveSQLite\.swift/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(fixture.project), fixture.root)
    end

    fixture.project.save
    assert_equal before, File.binread(project_file_path(fixture.project))
  end

  def test_fails_closed_when_the_named_target_is_missing_or_ambiguous
    missing = create_fixture(include_widgets_target: false)
    assert_raises_message(RuntimeError, /exactly one PBXNativeTarget named ExpoWidgets; found 0/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(missing.project), missing.root)
    end

    ambiguous = create_fixture(duplicate_widgets_target: true)
    assert_raises_message(RuntimeError, /exactly one PBXNativeTarget named ExpoWidgets; found 2/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(ambiguous.project), ambiguous.root)
    end

    aggregate_and_native = create_fixture(aggregate_named_expo_widgets: true)
    assert_raises_message(RuntimeError, /non-native target\(s\) also named ExpoWidgets/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(aggregate_and_native.project), aggregate_and_native.root)
    end
  end

  def test_rejects_an_aggregate_or_unapproved_product_type_named_expowidgets
    aggregate_only = create_fixture(include_widgets_target: false, aggregate_named_expo_widgets: true)
    assert_raises_message(RuntimeError, /PBXNativeTarget named ExpoWidgets; found 0/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(aggregate_only.project), aggregate_only.root)
    end

    {
      application: 'com.apple.product-type.application',
      app_extension: 'com.apple.product-type.app-extension',
      bundle: 'com.apple.product-type.bundle'
    }.each do |product, product_type|
      wrong_product = create_fixture(widgets_product: product)
      assert_equal product_type, wrong_product.widgets_target.product_type
      assert_raises_message(RuntimeError, /static library or framework target/) do
        saveapp_configure_expo_widgets_quick_save(installer_for(wrong_product.project), wrong_product.root)
      end
    end
  end

  def test_ignores_a_similarly_named_aggregate_target
    fixture = create_fixture(similar_aggregate_named_expowidgets: true)
    aggregate = fixture.project.targets.find { |target| target.name == 'Pods-ExpoWidgets' }
    assert_instance_of Xcodeproj::Project::Object::PBXAggregateTarget, aggregate

    saveapp_configure_expo_widgets_quick_save(installer_for(fixture.project), fixture.root)

    assert_same fixture.widgets_target, fixture.project.native_targets.find { |target| target.name == 'ExpoWidgets' }
    assert_project_has_exact_quick_save_sources(fixture)
  end

  def test_fails_closed_when_the_matching_target_has_no_compile_sources_phase
    fixture = create_fixture
    source_phase = fixture.widgets_target.build_phases.grep(Xcodeproj::Project::Object::PBXSourcesBuildPhase).fetch(0)
    fixture.widgets_target.build_phases.delete(source_phase)

    assert_raises_message(RuntimeError, /expected one existing Compile Sources phase in ExpoWidgets; found 0/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(fixture.project), fixture.root)
    end
  end

  def test_rejects_duplicate_references_and_sources_compiled_by_an_unrelated_target
    duplicate = create_fixture(include_renderer_build_file: false, include_quick_save_sources: true)
    source_path = File.join(duplicate.root, 'modules/dynamic-island-quick-save/ios', QUICK_SAVE_SOURCE_NAMES.first)
    duplicate_ref = duplicate.project.new_file(relative_to_pods_project(duplicate.project, source_path), :group)
    duplicate.widgets_target.source_build_phase.add_file_reference(duplicate_ref)
    assert_raises_message(RuntimeError, /duplicate source build references/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(duplicate.project), duplicate.root)
    end

    misplaced = create_fixture
    source_path = File.join(misplaced.root, 'modules/dynamic-island-quick-save/ios', QUICK_SAVE_SOURCE_NAMES.first)
    source_ref = misplaced.project.new_file(relative_to_pods_project(misplaced.project, source_path), :group)
    misplaced.unrelated_target.source_build_phase.add_file_reference(source_ref)
    assert_raises_message(RuntimeError, /assigned to unrelated target UnrelatedPod/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(misplaced.project), misplaced.root)
    end
  end

  def test_rejects_orphan_quick_save_build_file_references
    fixture = create_fixture(include_renderer_build_file: false, include_quick_save_sources: true)
    source_path = File.join(
      fixture.root,
      'modules/dynamic-island-quick-save/ios',
      QUICK_SAVE_SOURCE_NAMES.first
    )
    source_ref = fixture.project.files.find do |file_ref|
      file_ref.isa == 'PBXFileReference' &&
        File.basename(file_ref.path.to_s) == QUICK_SAVE_SOURCE_NAMES.first &&
        File.realpath(file_ref.real_path.to_s) == File.realpath(source_path)
    end
    refute_nil source_ref

    orphan = fixture.project.new(Xcodeproj::Project::Object::PBXBuildFile)
    orphan.file_ref = source_ref
    fixture.project.objects_by_uuid[orphan.uuid] = orphan
    orphan_reference = fixture.project.objects.find { |object| object.uuid == orphan.uuid }
    refute_nil orphan_reference
    assert_same orphan, orphan_reference
    assert_equal 'PBXBuildFile', orphan_reference.isa
    assert_same source_ref, orphan_reference.file_ref
    phase_memberships = fixture.project.targets.flat_map do |target|
      target.build_phases.flat_map { |phase| phase.files.map(&:uuid) }
    end
    refute_includes phase_memberships, orphan_reference.uuid

    assert_raises_message(RuntimeError, /must have exactly one PBXBuildFile membership/) do
      saveapp_configure_expo_widgets_quick_save(installer_for(fixture.project), fixture.root)
    end
  end

  private

  def assert_raises_message(error_class, message)
    error = assert_raises(error_class) { yield }
    assert_match message, error.message
  end

  def installer_for(project)
    Struct.new(:pods_project).new(project)
  end

  def create_fixture(
    group_layout: 1,
    include_widgets_target: true,
    duplicate_widgets_target: false,
    aggregate_named_expo_widgets: false,
    similar_aggregate_named_expowidgets: false,
    widgets_product: :static_library,
    include_renderer_build_file: true,
    include_quick_save_sources: false
  )
    root = Dir.mktmpdir('saveapp-quick-save-xcodeproj-')
    @temporary_roots << root
    project_path = File.join(root, 'ios', 'Pods', 'Pods.xcodeproj')
    FileUtils.mkdir_p(File.dirname(project_path))

    package_root = File.join(root, 'node_modules', 'expo-widgets')
    renderer_path = File.join(package_root, 'ios', 'Widgets', 'Buttons.swift')
    FileUtils.mkdir_p(File.dirname(renderer_path))
    File.write(File.join(package_root, 'package.json'), JSON.generate({ version: '58.0.23' }))
    File.write(renderer_path, "// installed ExpoWidgets renderer fixture\n")

    source_paths = QUICK_SAVE_SOURCE_NAMES.map do |name|
      source = File.join(root, 'modules', 'dynamic-island-quick-save', 'ios', name)
      FileUtils.mkdir_p(File.dirname(source))
      File.write(source, "// #{name}\n")
      source
    end

    project = Xcodeproj::Project.new(project_path)
    aggregate = project.new_aggregate_target('Pods-SaveApp', [], :ios, '16.4')
    aggregate_named = if aggregate_named_expo_widgets
                        project.new_aggregate_target('ExpoWidgets', [], :ios, '16.4')
                      else
                        nil
                      end
    project.new_aggregate_target('Pods-ExpoWidgets', [], :ios, '16.4') if similar_aggregate_named_expowidgets

    widgets_target = if include_widgets_target
                       project.new_target(widgets_product, 'ExpoWidgets', :ios, '16.4')
                     end
    project.new_target(:static_library, 'ExpoWidgets', :ios, '16.4') if duplicate_widgets_target
    unrelated_target = project.new_target(:framework, 'UnrelatedPod', :ios, '16.4')
    widgets_target.new_shell_script_build_phase('Fixture Shell Phase') if widgets_target

    if widgets_target && include_renderer_build_file
      add_renderer_reference(project, widgets_target, renderer_path, group_layout)
    end
    if widgets_target && include_quick_save_sources
      source_paths.each do |source|
        ref = project.new_file(relative_to_pods_project(project, source), :group)
        widgets_target.source_build_phase.add_file_reference(ref, true)
      end
    end

    unrelated_source = File.join(root, 'UnrelatedPod.swift')
    File.write(unrelated_source, "// unrelated native target fixture\n")
    unrelated_ref = project.new_file(relative_to_pods_project(project, unrelated_source), :group)
    unrelated_target.source_build_phase.add_file_reference(unrelated_ref)
    project.save

    Fixture.new(root, project, widgets_target, unrelated_target, aggregate_named || aggregate, renderer_path)
  end

  def add_renderer_reference(project, target, renderer_path, group_layout)
    project_directory = project.path.dirname.to_s
    ios_source_directory = File.dirname(File.dirname(renderer_path))
    relative_ios_source_directory = Pathname.new(ios_source_directory)
      .relative_path_from(Pathname.new(project_directory)).to_s

    file_ref = case group_layout
               when 1
                 package_group = project.main_group.new_group('ExpoWidgetsPackage', relative_ios_source_directory)
                 widgets_group = package_group.new_group('Widgets', 'Widgets')
                 widgets_group.new_file('Buttons.swift')
               when 2
                 widgets_group = project.main_group.new_group(
                   'ExpoWidgetsWidgets',
                   File.join(relative_ios_source_directory, 'Widgets')
                 )
                 widgets_group.new_file('./Buttons.swift')
               when 3
                 package_group = project.main_group.new_group('ExpoWidgetsPackage', relative_ios_source_directory)
                 package_group.new_file('Widgets/Buttons.swift')
               else
                 raise "unknown renderer group layout: #{group_layout}"
               end

    assert_equal File.realpath(renderer_path), File.realpath(file_ref.real_path.to_s)
    target.source_build_phase.add_file_reference(file_ref)
  end

  def relative_to_pods_project(project, absolute_path)
    Pathname.new(absolute_path).relative_path_from(Pathname.new(project.path.dirname.to_s)).to_s
  end

  def project_file_path(project)
    File.join(project.path.to_s, 'project.pbxproj')
  end

  def source_file_paths(target)
    target.source_build_phase.files.map do |build_file|
      raise "source build file has no file reference in #{target.name}" unless build_file.file_ref

      File.realpath(build_file.file_ref.real_path.to_s)
    end.sort
  end

  def assert_project_has_exact_quick_save_sources(fixture, project = fixture.project)
    target = project.native_targets.find { |candidate| candidate.name == 'ExpoWidgets' }
    refute_nil target
    paths = source_file_paths(target)
    quick_paths = paths.select { |path| QUICK_SAVE_SOURCE_NAMES.include?(File.basename(path)) }
    assert_equal QUICK_SAVE_SOURCE_NAMES.sort, quick_paths.map { |path| File.basename(path) }.sort
    refute_includes paths, File.realpath(fixture.renderer_path)
    assert_equal QUICK_SAVE_SOURCE_NAMES.length, quick_paths.length
  end

  def assert_no_orphan_build_files(project)
    phase_build_file_ids = project.targets.flat_map do |target|
      target.build_phases.flat_map { |phase| phase.files.map(&:uuid) }
    end.sort
    project_build_file_ids = project.objects
      .select { |object| object.isa == 'PBXBuildFile' }
      .map(&:uuid)
      .sort
    assert_equal phase_build_file_ids, project_build_file_ids
    project.targets.each do |target|
      target.build_phases.each do |phase|
        phase.files.each { |build_file| refute_nil build_file.file_ref }
      end
    end
  end
end
