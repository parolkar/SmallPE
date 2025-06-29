# -*- encoding: utf-8 -*-
# stub: adsf 1.5.2 ruby lib

Gem::Specification.new do |s|
  s.name = "adsf".freeze
  s.version = "1.5.2".freeze

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.metadata = { "rubygems_mfa_required" => "true" } if s.respond_to? :metadata=
  s.require_paths = ["lib".freeze]
  s.authors = ["Denis Defreyne".freeze]
  s.date = "2024-09-29"
  s.description = "A web server that can be spawned in any directory".freeze
  s.email = "denis.defreyne@stoneship.org".freeze
  s.executables = ["adsf".freeze]
  s.files = ["bin/adsf".freeze]
  s.homepage = "http://github.com/ddfreyne/adsf/".freeze
  s.licenses = ["MIT".freeze]
  s.required_ruby_version = Gem::Requirement.new(">= 2.5".freeze)
  s.rubygems_version = "3.5.14".freeze
  s.summary = "a tiny static file server".freeze

  s.installed_by_version = "3.5.11".freeze if s.respond_to? :installed_by_version

  s.specification_version = 4

  s.add_runtime_dependency(%q<rack>.freeze, [">= 1.0.0".freeze, "< 4.0.0".freeze])
  s.add_runtime_dependency(%q<rackup>.freeze, ["~> 2.1".freeze])
end
