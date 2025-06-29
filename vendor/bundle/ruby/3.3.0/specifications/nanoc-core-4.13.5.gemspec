# -*- encoding: utf-8 -*-
# stub: nanoc-core 4.13.5 ruby lib

Gem::Specification.new do |s|
  s.name = "nanoc-core".freeze
  s.version = "4.13.5".freeze

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.metadata = { "rubygems_mfa_required" => "true", "source_code_uri" => "https://github.com/nanoc/nanoc/tree/nanoc-core-v4.13.5/nanoc-core" } if s.respond_to? :metadata=
  s.require_paths = ["lib".freeze]
  s.authors = ["Denis Defreyne".freeze]
  s.date = "1980-01-02"
  s.description = "Contains the core of Nanoc".freeze
  s.email = "denis+rubygems@denis.ws".freeze
  s.homepage = "https://nanoc.app/".freeze
  s.licenses = ["MIT".freeze]
  s.required_ruby_version = Gem::Requirement.new(">= 3.1".freeze)
  s.rubygems_version = "3.6.7".freeze
  s.summary = "Core of Nanoc".freeze

  s.installed_by_version = "3.5.11".freeze if s.respond_to? :installed_by_version

  s.specification_version = 4

  s.add_runtime_dependency(%q<base64>.freeze, ["~> 0.2".freeze])
  s.add_runtime_dependency(%q<concurrent-ruby>.freeze, ["~> 1.1".freeze])
  s.add_runtime_dependency(%q<ddmetrics>.freeze, ["~> 1.0".freeze])
  s.add_runtime_dependency(%q<ddplugin>.freeze, ["~> 1.0".freeze])
  s.add_runtime_dependency(%q<immutable-ruby>.freeze, ["~> 0.1".freeze])
  s.add_runtime_dependency(%q<json_schema>.freeze, ["~> 0.19".freeze])
  s.add_runtime_dependency(%q<memo_wise>.freeze, ["~> 1.5".freeze])
  s.add_runtime_dependency(%q<slow_enumerator_tools>.freeze, ["~> 1.0".freeze])
  s.add_runtime_dependency(%q<tty-platform>.freeze, ["~> 0.2".freeze])
  s.add_runtime_dependency(%q<zeitwerk>.freeze, ["~> 2.1".freeze])
end
