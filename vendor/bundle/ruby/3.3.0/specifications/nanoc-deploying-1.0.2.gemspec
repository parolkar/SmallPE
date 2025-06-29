# -*- encoding: utf-8 -*-
# stub: nanoc-deploying 1.0.2 ruby lib

Gem::Specification.new do |s|
  s.name = "nanoc-deploying".freeze
  s.version = "1.0.2".freeze

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.metadata = { "rubygems_mfa_required" => "true" } if s.respond_to? :metadata=
  s.require_paths = ["lib".freeze]
  s.authors = ["Denis Defreyne".freeze]
  s.date = "2022-05-28"
  s.description = "Provides deploying functionality for Nanoc".freeze
  s.email = "denis+rubygems@denis.ws".freeze
  s.homepage = "https://nanoc.ws/".freeze
  s.licenses = ["MIT".freeze]
  s.required_ruby_version = Gem::Requirement.new(">= 2.6".freeze)
  s.rubygems_version = "3.3.14".freeze
  s.summary = "Deploying support for Nanoc".freeze

  s.installed_by_version = "3.5.11".freeze if s.respond_to? :installed_by_version

  s.specification_version = 4

  s.add_runtime_dependency(%q<nanoc-checking>.freeze, ["~> 1.0".freeze])
  s.add_runtime_dependency(%q<nanoc-cli>.freeze, ["~> 4.11".freeze, ">= 4.11.15".freeze])
  s.add_runtime_dependency(%q<nanoc-core>.freeze, ["~> 4.11".freeze, ">= 4.11.15".freeze])
end
