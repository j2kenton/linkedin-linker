# LinkedIn Connection Automator - Chrome Extension

A Chrome extension that automates LinkedIn connection requests with sequential processing, random delays, and safety features.

## Features

- **Sequential Processing**: Processes prospects one at a time in the exact order they appear
- **Page Navigation**: Automatically moves between search result pages
- **Random Delays**: Includes safety delays to avoid detection
- **Index Tracking**: Maintains prospect order within each page
- **User-Friendly Interface**: Simple popup to start/stop automation

## Installation

### Method 1: From Source Code

1. **Clone or download** this repository
2. **Open Chrome** and go to `chrome://extensions/`
3. **Enable Developer Mode** (toggle in top right)
4. **Click "Load unpacked"**
5. **Select the extension folder**
6. **The extension will appear** in your extensions list

### Method 2: From Chrome Web Store (if published)

1. Visit the extension page on Chrome Web Store
2. Click "Add to Chrome"
3. Confirm installation

## Usage

1. **Navigate** to a LinkedIn search results page
2. **Click the extension icon** in Chrome toolbar
3. **Click "Start Automation"**
4. **Watch the console** for progress updates
5. **Automation will process** prospects sequentially across pages

## Files Structure

```
linkedin-linker/
├── manifest.json      # Extension manifest
├── content.js        # Main automation script
├── popup.html        # Extension popup interface
├── popup.js          # Popup functionality
├── index.js          # Original standalone script
└── README.md         # This file
```

## How It Works

### Sequential Processing
- Captures all prospects on the current page into a list
- Processes prospects by index (0, 1, 2, 3...)
- Each prospect must complete fully before the next starts
- Resets the list only when navigating to a new page

### Safety Features
- Random delays between actions (500-5500ms)
- Respects LinkedIn's UI timing
- Processes one connection at a time
- Includes error handling and timeouts

### Page Navigation
- Automatically detects "Next" page button
- Waits for new page to load completely
- Resets prospect index for each new page
- Continues until no more pages exist

## Permissions

The extension requires:
- `activeTab`: To interact with the current LinkedIn tab
- `storage`: To save settings (future feature)
- Host permission for `https://www.linkedin.com/*`: To run on LinkedIn pages

## Development

### Adding Icons

Create PNG icons in these sizes and place them in the extension folder:
- `icon16.png` - 16x16 pixels
- `icon32.png` - 32x32 pixels
- `icon48.png` - 48x48 pixels
- `icon128.png` - 128x128 pixels

### Testing

1. Load the extension in developer mode
2. Navigate to LinkedIn search results
3. Open browser console to see logs
4. Start automation and monitor progress

### Building for Production

1. Remove any development files
2. Ensure all icon files are present
3. Test thoroughly on different LinkedIn pages
4. Create a ZIP file for Chrome Web Store submission

## Safety & Ethics

⚠️ **Important Disclaimer:**
- Use this extension responsibly
- Respect LinkedIn's Terms of Service
- Be mindful of connection request limits
- Consider the quality of your connections
- Take breaks to avoid being flagged

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is for educational purposes. Use at your own risk.

## Troubleshooting

### Extension not working?
- Ensure you're on a LinkedIn search results page
- Check that the content script loaded (console logs)
- Verify all permissions are granted

### Automation not starting?
- Check browser console for error messages
- Ensure you're on the correct LinkedIn URL pattern
- Try refreshing the page and reloading the extension

### Performance issues?
- Increase delay multipliers in the code
- Process fewer prospects per session
- Take breaks between automation sessions
