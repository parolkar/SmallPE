# -*- encoding: utf-8 -*-
# stub: nanoc-live 1.1.0 ruby lib

Gem::Specification.new do |s|
  s.name = "nanoc-live".freeze
  s.version = "1.1.0".freeze

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.metadata = { "rubygems_mfa_required" => "true", "source_code_uri" => "https://github.com/nanoc/nanoc/tree/nanoc-live-v1.1.0/nanoc-live" } if s.respond_to? :metadata=
  s.require_paths = ["lib".freeze]
  s.authors = ["Denis Defreyne".freeze]
  s.date = "2024-06-26"
  s.description = "Provides support for auto-recompiling Nanoc sites.".freeze
  s.email = "denis+rubygems@denis.ws".freeze
  s.homepage = "https://nanoc.app/".freeze
  s.licenses = ["MIT".freeze]
  s.required_ruby_version = Gem::Requirement.new(">= 3.1".freeze)
  s.rubygems_version = "3.5.11".freeze
  s.summary = "Live recompilation support for Nanoc".freeze

  s.installed_by_version = "3.5.11".freeze if s.respond_to? :installed_by_version

  s.specification_version = 4

  s.add_runtime_dependency(%q<adsf-live>.freeze, ["~> 1.4".freeze])
  s.add_runtime_dependency(%q<listen>.freeze, ["~> 3.0".freeze])
  s.add_runtime_dependency(%q<nanoc-cli>.freeze, ["~> 4.11".freeze, ">= 4.11.14".freeze])
  s.add_runtime_dependency(%q<nanoc-core>.freeze, ["~> 4.11".freeze, ">= 4.11.14".freeze])
end
