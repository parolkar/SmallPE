# PDF to Markdown Converter

A powerful Ruby command-line tool that converts PDF files to Markdown format with intelligent text extraction, formatting preservation, and metadata handling. The tool processes PDF documents and creates clean, readable Markdown files suitable for documentation, note-taking, and content management systems.

## Features

- **Comprehensive PDF Support**: Handles standard PDF files with text content
- **Intelligent Text Extraction**:
  - Preserves document structure (headers, paragraphs, lists)
  - Detects and formats bullet points and numbered lists
  - Maintains text flow and readability
- **Metadata Extraction**:
  - Document properties (title, author, subject, keywords)
  - Creation and modification dates
  - PDF version and production information
- **Table Detection**: Automatically detects and formats tables into Markdown tables
- **Multi-page Processing**:
  - Convert entire documents or specific pages
  - Page-by-page breakdown in output
- **Batch Processing**: Convert multiple PDFs in a directory
- **Flexible Output Options**:
  - Custom output file naming
  - Preserve directory structure in batch mode
- **Colored Terminal Output**: Visual feedback during conversion

## Installation

1. Clone or download this repository:
```bash
git clone <repository-url>
cd pdf_to_markdown
```

2. Install dependencies:
```bash
bundle install
```

Or install gems manually:
```bash
gem install pdf-reader thor colorize mini_magick
```

### System Requirements

- Ruby 2.5 or higher
- Bundler (optional, for dependency management)

### Optional Dependencies

For advanced features:
- `pdftotext` - Alternative text extraction (better handling of complex layouts)
- `ImageMagick` - For image extraction support
- `poppler-utils` - For advanced PDF manipulation

## Usage

### Basic Conversion

Convert a PDF file to Markdown:
```bash
./pdf2md convert document.pdf
```

This creates `document.md` in the same directory.

### Specify Output File

```bash
./pdf2md convert document.pdf -o output.md
```

### Convert Specific Page

```bash
./pdf2md convert document.pdf --page 5
```

### Verbose Mode

Get detailed processing information:
```bash
./pdf2md convert document.pdf -v
```

### View PDF Information

Inspect PDF structure and metadata before conversion:
```bash
./pdf2md info document.pdf
```

### Batch Conversion

Convert all PDFs in a directory:
```bash
./pdf2md batch /path/to/pdfs/
```

With subdirectories:
```bash
./pdf2md batch /path/to/pdfs/ --recursive
```

### Extract Specific Content

Extract only text:
```bash
./pdf2md extract document.pdf --type text
```

Extract metadata to JSON:
```bash
./pdf2md extract document.pdf --type metadata
```

### Command Options

```
Commands:
  pdf2md convert FILE [OPTIONS]     # Convert PDF file to Markdown
  pdf2md info FILE                   # Display information about PDF file
  pdf2md extract FILE [OPTIONS]     # Extract specific content from PDF
  pdf2md batch DIR [OPTIONS]        # Convert all PDFs in a directory
  pdf2md version                    # Display version information

Conversion Options:
  -o, --output        Output file path (default: input_file.md)
  -v, --verbose       Verbose output
  -p, --page          Convert specific page number
  -i, --extract-images Extract images (embed|separate|none)
  -t, --extract-tables Detect and format tables (default: true)
  -f, --preserve-formatting Preserve text formatting (default: true)

Batch Options:
  -o, --output        Output directory
  -r, --recursive     Process subdirectories
  -v, --verbose       Verbose output

Extract Options:
  -t, --type          Content type (text|images|tables|metadata)
  -o, --output        Output directory or file
  -p, --page          Extract from specific page
```

## Output Format

The tool generates Markdown files with the following structure:

1. **Header Section**:
   - File metadata and conversion timestamp
   - Document properties (if available)
2. **Content Sections**:
   - Page-by-page breakdown
   - Formatted text with proper headings
   - Preserved lists and bullet points
   - Detected and formatted tables
3. **Footer**: Generation signature

### Example Output

```markdown
# PDF to Markdown Conversion

**Source File:** `report.pdf`
**Converted:** 2024-01-15 10:30:45

## Document Metadata

- **Title:** Annual Report 2024
- **Author:** John Doe
- **Creation Date:** 2024-01-10 09:15:00
- **Page Count:** 25

---

## Page 1

### Executive Summary

This report presents the annual findings for fiscal year 2024, including:

- Revenue growth analysis
- Market expansion initiatives
- Operational improvements
- Strategic partnerships

### Key Metrics

| Metric          | 2023    | 2024    | Growth |
| --------------- | ------- | ------- | ------ |
| Revenue         | $10.5M  | $14.2M  | 35%    |
| Customers       | 1,250   | 2,100   | 68%    |
| Market Share    | 12%     | 18%     | 50%    |

---

## Page 2

### Detailed Analysis

[Content continues...]

---

*Generated by pdf2md*
```

## Features in Detail

### Text Extraction

The tool uses intelligent algorithms to:
- Identify document structure (headers, paragraphs, lists)
- Clean up formatting artifacts from PDF rendering
- Rejoin hyphenated words at line breaks
- Remove excessive whitespace while preserving readability

### Table Detection

Automatically detects tables based on:
- Consistent spacing patterns
- Tab-delimited content
- Column alignment
- Converts to proper Markdown table format

### Metadata Handling

Extracts and displays:
- Document title, author, subject, keywords
- Creation and modification timestamps
- PDF version and encryption status
- Producer and creator applications

### Batch Processing

- Process entire directories of PDFs
- Maintain directory structure in output
- Skip already converted files (with --skip-existing option)
- Progress tracking for large batches

## Error Handling

The tool provides clear error messages for:
- File not found
- Invalid PDF format
- Encrypted PDFs requiring passwords
- Corrupted PDF files
- Permission issues
- Memory constraints for large files

## Performance Considerations

### Large Files

For PDFs with hundreds of pages:
- Use page-specific conversion for testing
- Enable verbose mode to monitor progress
- Consider increasing Ruby memory limits if needed

### Complex Layouts

For PDFs with complex layouts:
- Tables may require manual adjustment
- Multi-column text is merged into single column
- Images are noted but require separate extraction tools

## Troubleshooting

### Permission Denied

Make the script executable:
```bash
chmod +x pdf2md
```

### Missing Dependencies

Install required gems:
```bash
bundle install
```

### Encoding Issues

For PDFs with special characters:
```bash
export LANG=en_US.UTF-8
./pdf2md convert document.pdf
```

### Memory Issues

For very large PDFs:
```bash
export RUBY_GC_HEAP_INIT_SLOTS=100000
./pdf2md convert large_document.pdf
```

## Limitations

- **Images**: Image extraction requires additional tools (placeholder functionality included)
- **Forms**: Interactive form data is not extracted
- **Complex Layouts**: Multi-column layouts are simplified to single column
- **Encrypted PDFs**: Password-protected PDFs require manual unlocking first
- **Scanned PDFs**: Requires OCR preprocessing (not included)

## Future Enhancements

Planned features for future versions:
- Full image extraction and embedding
- OCR support for scanned documents
- Better handling of complex layouts
- Form data extraction
- Annotation and comment extraction
- PDF/A compliance checking
- Custom formatting templates

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

### Development Setup

1. Fork the repository
2. Create your feature branch
3. Install development dependencies
4. Run tests (when available)
5. Submit a pull request

## License

MIT License

## Acknowledgments

- Built with [pdf-reader](https://github.com/yob/pdf-reader) gem
- CLI framework by [Thor](https://github.com/rails/thor)
- Inspired by various PDF processing tools

## Support

For issues, questions, or suggestions, please open an issue on the repository.