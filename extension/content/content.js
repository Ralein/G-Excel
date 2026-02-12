/**
 * Content script — injected into active tab.
 * Listens for messages from popup and orchestrates detection, filling, and preview.
 */

/* ───── message listener ───── */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        switch (request.action) {

            case 'detectFields': {
                const fields = Detector.detectFormFields();
                sendResponse({ success: true, fields, count: fields.length });
                break;
            }

            case 'fillRow': {
                const result = Filler.fillRow(
                    request.mapping,
                    request.rowData,
                    request.settings || {}
                );
                sendResponse({ success: result.success, ...result });
                break;
            }

            case 'fillBatch': {
                // Async — must return true
                Filler.fillBatch(
                    request.mapping,
                    request.rows,
                    request.settings || {},
                    (progress) => {
                        // Send progress updates via a separate mechanism if needed
                        try {
                            chrome.runtime.sendMessage({
                                action: 'fillProgress',
                                ...progress
                            });
                        } catch (_) { /* popup may be closed */ }
                    }
                ).then(result => {
                    sendResponse({ success: true, ...result });
                }).catch(err => {
                    sendResponse({ success: false, error: err.message });
                });
                return true; // Async response
            }

            case 'preview': {
                const prev = Filler.preview(request.mapping, request.rowData);
                sendResponse({ success: true, ...prev });
                break;
            }

            case 'stopFill': {
                Filler.stop();
                Filler.removeAllHighlights();
                sendResponse({ success: true });
                break;
            }

            case 'ping': {
                sendResponse({ success: true, ready: true });
                break;
            }

            default:
                sendResponse({ success: false, error: `Unknown action: ${request.action}` });
        }
    } catch (error) {
        console.error('[G-Excel] Content script error:', error);
        sendResponse({ success: false, error: error.message });
    }
});

// Signal that content script is loaded
console.log('[G-Excel] Content script loaded on', window.location.href);
