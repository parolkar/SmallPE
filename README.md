# SmallPE Model - A Model of AI-First Private Equity Firm 

This is @parolkar's new ambiitious project to create a model Private Equity investment done in the AI-first way.

## Demo Video

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/Lsmp7YlOhm8?si=KHCFdA_np38clRed" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

## Requirements

- Ruby 3.3.4

## Setup

1. Install 

2. Install Bundler:
   ```bash
   gem install bundler
   ```

3. Install project dependencies:
   ```bash
   bundle  install
   ```

## Development

### For the public-facing content and website
The content is managed via nanoc To start the development server:

```bash
bundle exec nanoc view
```

or

```bash
bundle exec nanoc live
```

This will start a local server and automatically rebuild the site when files change.

#### Building for Production

To build the static site:

```bash
bundle exec nanoc 
```

The generated files will be in the 'output' directory (this is the one that is deployed for the website).

### For testing and launching agents


#### Start the agent swarm 

```bash
% ./bin/start_agentic_team
```
