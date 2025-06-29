---
trigger: always_on
---

## Context
- Ruby 3 syntax with pattern matching and hash shorthand
- The project is built on nanoc which is used to generate static site in output folder. The content for the site is organized based on the nanoc directory structure and instructions. 
- Separation of concerns via modular design
- Service objects for complex business logic

## Requirements
- Add `# frozen_string_literal: true` at the top of Ruby files
- Extract reusable behaviors into concerns
- Implement service objects with `perform` method
- Use transactions for multi-record operations
- Keep controllers thin, delegate to services/models
- Write comprehensive specs for all functionality
- Use named scopes for common query patterns
- Apply Ruby 3 pattern matching with rightward assignment
- Document models with schema annotations
- Follow single responsibility principle



## Nanoc instructions

### Directory structure
A site has the following files and directories:

* nanoc.yaml (or config.yaml on older sites) : contains the site configuration
* Rules: contains compilation, routing, and layouting rules
* content/ : contains the uncompiled items
* layouts/ : contains the layouts
* lib/  : contains custom site-specific code (filters, helpers, …)
* output/ : contains the compiled site. Do not write anything in this directory as it is automatically generated.
* tmp/ : contains data used for speeding up compilation (can be safely emptied)

Nanoc will load all Ruby source files in the lib/ directory before it starts compiling. All method definitions, class definitions, … will be available during the compilation process. This directory is useful for putting in custom helpers, custom filters, custom data sources, etc.

### Instructions

#### Items
Pages, such as an about page, and assets, such as a stylesheet or an image, are collectively called items.

An item has content, attributes, and an identifier.

Item content can be textual or binary. If the extension of the item is included in the site configuration’s text_extension list, it is considered to be textual; otherwise, it will be binary. Binary items don’t have their content stored in-memory. Instead, binary items have a filename pointing to the file containing the content.

Each item has attributes (metadata) associated with it. This metadata consists of key-value pairs. All attributes are free-form; there are no predefined attributes.

#### Layouts
A layout is the “frame” for content to go into. Typically, a layout adds a header, and a footer to a page.

The following is a minimal layout that includes the content using yield, and emits some metadata:

<html>
  <head>
    <title><%=h @item[:title] %></title>
  </head>
  <body>
    <%= yield %>
  </body>
</html>

An item is laid out using layout() function in a compilation rule. See the Rules page page for details.

Just like items, layouts have attributes and an identifier.

#### Partials
A layout can be used as a partial. A partial is a layout that is not used for laying out an item, but is rather intended to be included into another item or layout. Because of this, partials typically call yield.

To enable partials, first activate the rendering helper somewhere inside the lib/ directory, such as lib/helpers.rb:

use_helper Nanoc::Helpers::Rendering
To render a partial, call render() with the identifier or a glob as an argument:

<%= render '/head.*' %>
For details, see the documentation for the Rendering helper.
