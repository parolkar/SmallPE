# -*- encoding: utf-8 -*-
# stub: nanoc-cli 4.13.5 ruby lib

Gem::Specification.new do |s|
  s.name = "nanoc-cli".freeze
  s.version = "4.13.5".freeze

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.metadata = { "rubygems_mfa_required" => "true", "source_code_uri" => "https://github.com/nanoc/nanoc/tree/nanoc-cli-v4.13.5/nanoc-cli" } if s.respond_to? :metadata=
  s.require_paths = ["lib".freeze]
  s.authors = ["Denis Defreyne".freeze]
  s.date = "1980-01-02"
  s.description = "Provides the CLI for Nanoc".freeze
  s.email = "denis+rubygems@denis.ws".freeze
  s.homepage = "https://nanoc.app/".freeze
  s.licenses = ["MIT".freeze]
  s.required_ruby_version = Gem::Requirement.new(">= 3.1".freeze)
  s.rubygems_version = "3.6.7".freeze
  s.summary = "CLI for Nanoc".freeze

  s.installed_by_version = "3.5.11".freeze if s.respond_to? :installed_by_version

  s.specification_version = 4

  s.add_runtime_dependency(%q<cri>.freeze, ["~> 2.15".freeze])
  s.add_runtime_dependency(%q<diff-lcs>.freeze, ["~> 1.3".freeze])
  s.add_runtime_dependency(%q<logger>.freeze, ["~> 1.6".freeze])
  s.add_runtime_dependency(%q<nanoc-core>.freeze, ["= 4.13.5".freeze])
  s.add_runtime_dependency(%q<pry>.freeze, [">= 0".freeze])
  s.add_runtime_dependency(%q<zeitwerk>.freeze, ["~> 2.1".freeze])
end
