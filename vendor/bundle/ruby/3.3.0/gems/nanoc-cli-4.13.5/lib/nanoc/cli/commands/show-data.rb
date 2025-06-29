# frozen_string_literal: true

usage 'show-data'
aliases :debug
summary 'show data in this site'
description <<~EOS
  Show information about all items, item representations and layouts in the
  current site, along with dependency information.
EOS
no_params

module Nanoc::CLI::Commands
  class ShowData < ::Nanoc::CLI::CommandRunner
    def run
      site = load_site
      res = Nanoc::Core::Compiler.new_for(site).run_until_precompiled

      items                = site.items
      layouts              = site.layouts
      reps                 = res.fetch(:reps)
      dependency_store     = res.fetch(:dependency_store)
      outdatedness_checker = res.fetch(:outdatedness_checker)

      # Print data
      print_item_dependencies(items, dependency_store)
      print_item_rep_paths(items, reps)
      print_item_rep_outdatedness(items, outdatedness_checker, reps)
      print_layouts(layouts, outdatedness_checker)
    end

    protected

    def sorted_with_prev(objects)
      prev = nil
      objects.sort_by(&:identifier).each do |object|
        yield(object, prev)
        prev = object
      end
    end

    def sorted_reps_with_prev(items, reps)
      prev = nil
      items.sort_by(&:identifier).each do |item|
        reps[item].sort_by { |r| r.name.to_s }.each do |rep|
          yield(rep, prev)
          prev = rep
        end
      end
    end

    def print_header(title)
      header = '=' * 78
      header[3..(title.length + 5)] = " #{title} "

      puts
      puts header
      puts
    end

    def print_item_dependencies(items, dependency_store)
      print_header('Item dependencies')

      puts 'Legend:'
      puts '  r = dependency on raw content'
      puts '  a = dependency on attributes'
      puts '  c = dependency on compiled content'
      puts '  p = dependency on the path'
      puts

      sorter =
        lambda do |dep|
          case dep
          when Nanoc::Core::Document
            dep.from.identifier.to_s
          else
            ''
          end
        end

      sorted_with_prev(items) do |item, prev|
        puts if prev
        puts "item #{item.identifier} depends on:"
        dependencies =
          dependency_store
          .dependencies_causing_outdatedness_of(item)
          .sort_by(&sorter)
        dependencies.each do |dep|
          pred = dep.from

          type =
            case pred
            when Nanoc::Core::Layout
              'layout'
            when Nanoc::Core::Item
              'item'
            when Nanoc::Core::Configuration
              'config'
            when Nanoc::Core::ItemCollection
              'items'
            when Nanoc::Core::LayoutCollection
              'layouts'
            when nil
              '(unknown)'
            else
              raise Nanoc::Core::Errors::InternalInconsistency, "unexpected pred type #{pred.inspect}"
            end

          details =
            case pred
            when Nanoc::Core::Document
              [pred.identifier.to_s]
            when Nanoc::Core::Configuration, nil
              []
            when Nanoc::Core::IdentifiableCollection
              describe_identifiable_collection_dependency(dep)
            else
              raise Nanoc::Core::Errors::InternalInconsistency, "unexpected pred type #{pred.inspect}"
            end

          if pred
            print "  [ #{format '%7s', type} ] (#{dep.props})"

            unless details.empty?
              print ' '
            end

            puts details.join("\n                     ")
          else
            puts '  ( removed )'
          end
        end
        puts '  (nothing)' if dependencies.empty?
      end
    end

    def describe_identifiable_collection_dependency(dep)
      outcome = []

      case dep.props.raw_content
      when true
        outcome << 'matching any identifier'
      when Set, Array
        dep.props.raw_content.sort.each do |x|
          outcome << "matching identifier #{x}"
        end
      end

      if dep.props.attributes
        case dep.props.attributes
        when true
          outcome << 'matching any attribute'
        when Set, Array
          dep.props.attributes.each do |elem|
            case elem
            when Symbol
              outcome << "matching attribute #{elem.inspect} (any value)"
            when Array
              outcome << "matching attribute pair #{elem[0].inspect} => #{elem[1].inspect}"
            else
              raise(
                Nanoc::Core::Errors::InternalInconsistency,
                "unexpected prop attribute element #{elem.inspect}",
              )
            end
          end
        else
          raise(
            Nanoc::Core::Errors::InternalInconsistency,
            "unexpected prop attribute #{dep.props.attributes.inspect}",
          )
        end
      end

      outcome
    end

    def print_item_rep_paths(items, reps)
      print_header('Item representation paths')

      sorted_reps_with_prev(items, reps) do |rep, prev|
        puts if prev
        puts "item #{rep.item.identifier}, rep #{rep.name}:"
        if rep.raw_paths.empty?
          puts '  (not written)'
        end
        length = rep.raw_paths.keys.map { |s| s.to_s.length }.max
        rep.raw_paths.each do |snapshot_name, raw_paths|
          raw_paths.each do |raw_path|
            puts format("  [ %-#{length}s ] %s", snapshot_name, raw_path)
          end
        end
      end
    end

    def print_item_rep_outdatedness(items, outdatedness_checker, reps)
      print_header('Item representation outdatedness')

      sorted_reps_with_prev(items, reps) do |rep, prev|
        puts if prev
        puts "item #{rep.item.identifier}, rep #{rep.name}:"
        print_outdatedness_reasons_for(rep, outdatedness_checker)
      end
    end

    def print_layouts(layouts, outdatedness_checker)
      print_header('Layouts')

      sorted_with_prev(layouts) do |layout, prev|
        puts if prev
        puts "layout #{layout.identifier}:"
        print_outdatedness_reasons_for(layout, outdatedness_checker)
      end
    end

    def print_outdatedness_reasons_for(obj, outdatedness_checker)
      reasons = outdatedness_checker.outdatedness_reasons_for(obj)
      if reasons.empty?
        puts '  is not outdated'
      else
        puts '  is outdated:'
        reasons.each do |reason|
          puts "    - #{reason.message}"
        end
      end
    end
  end
end

runner Nanoc::CLI::Commands::ShowData
