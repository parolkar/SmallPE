# -*- encoding: utf-8 -*-
# stub: nanoc 4.13.5 ruby lib

Gem::Specification.new do |s|
  s.name = "nanoc".freeze
  s.version = "4.13.5".freeze

  s.required_rubygems_version = Gem::Requirement.new(">= 0".freeze) if s.respond_to? :required_rubygems_version=
  s.metadata = { "rubygems_mfa_required" => "true", "source_code_uri" => "https://github.com/nanoc/nanoc/tree/4.13.5/nanoc" } if s.respond_to? :metadata=
  s.require_paths = ["lib".freeze]
  s.authors = ["Denis Defreyne".freeze]
  s.date = "1980-01-02"
  s.description = "Nanoc is a static-site generator focused on flexibility. It transforms content from a format such as Markdown or AsciiDoc into another format, usually HTML, and lays out pages consistently to retain the site\u2019s look and feel throughout. Static sites built with Nanoc can be deployed to any web server.".freeze
  s.email = "denis+rubygems@denis.ws".freeze
  s.executables = ["nanoc".freeze]
  s.files = ["bin/nanoc".freeze]
  s.homepage = "https://nanoc.app/".freeze
  s.licenses = ["MIT".freeze]
  s.required_ruby_version = Gem::Requirement.new(">= 3.1".freeze)
  s.rubygems_version = "3.6.7".freeze
  s.summary = "A static-site generator with a focus on flexibility.".freeze

  s.installed_by_version = "3.5.11".freeze if s.respond_to? :installed_by_version

  s.specification_version = 4

  s.add_runtime_dependency(%q<addressable>.freeze, ["~> 2.5".freeze])
  s.add_runtime_dependency(%q<nanoc-checking>.freeze, ["~> 1.0".freeze, ">= 1.0.2".freeze])
  s.add_runtime_dependency(%q<nanoc-cli>.freeze, ["= 4.13.5".freeze])
  s.add_runtime_dependency(%q<nanoc-core>.freeze, ["= 4.13.5".freeze])
  s.add_runtime_dependency(%q<nanoc-deploying>.freeze, ["~> 1.0".freeze])
  s.add_runtime_dependency(%q<parallel>.freeze, ["~> 1.12".freeze])
  s.add_runtime_dependency(%q<tty-command>.freeze, ["~> 0.8".freeze])
  s.add_runtime_dependency(%q<tty-which>.freeze, ["~> 0.4".freeze])
end
