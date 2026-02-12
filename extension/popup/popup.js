/**
 * G-Excel Autofill — Popup Controller
 * Handles Excel upload, parsing, mapping UI, fill orchestration,
 * settings, and profile management.
 */
(() => {
    'use strict';

    /* ═══════ State ═══════ */

    let workbook = null;
    let sheetNames = [];
    let currentSheet = '';
    let parsedData = [];         // Array of row objects
    let columns = [];            // Column header names
    let detectedFields = [];     // From content script
    let currentMapping = {};     // { columnName: { selector, confidence, level, field, source } }
    let manualOverrides = {};    // { columnName: selectorOrEmpty }
    let currentRowIndex = 0;
    let settings = {};
    let currentTabId = null;     // Active browser tab id
    let isFilling = false;

    /* ═══════ DOM refs ═══════ */

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    /* ═══════ Init ═══════ */

    document.addEventListener('DOMContentLoaded', async () => {
        initTabs();
        initUpload();
        initMappingControls();
        initSettingsControls();
        initProfilesTab();
        settings = await Storage.getSettings();
        applySettingsToUI(settings);
        if (settings.enableLogging) Logger.enable();
        setStatus('Ready', 'success');
    });

    /* ═══════ Tab Navigation ═══════ */

    function initTabs() {
        $$('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                $$('.tab').forEach(t => t.classList.remove('active'));
                $$('.tab-content').forEach(tc => tc.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                $(`#${target}-tab`).classList.add('active');

                // Auto-detect fields when switching to mapping tab
                if (target === 'mapping' && parsedData.length > 0) {
                    detectFieldsAndRender();
                }
                // Refresh profiles list
                if (target === 'profiles') {
                    loadProfilesList();
                }
            });
        });
    }

    /* ═══════ File Upload ═══════ */

    function initUpload() {
        const uploadArea = $('#upload-area');
        const fileInput = $('#file-input');

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) handleFile(e.target.files[0]);
        });

        $('#clear-file').addEventListener('click', clearData);
    }

    async function handleFile(file) {
        const validExts = ['.xlsx', '.xls', '.csv'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!validExts.includes(ext)) {
            setStatus('Unsupported file type', 'error');
            return;
        }

        setStatus('Parsing file…', 'working');

        try {
            const data = await readFileAsBinary(file);
            workbook = XLSX.read(data, { type: 'binary', cellDates: true });
            sheetNames = workbook.SheetNames;

            // Show file info
            $('#file-name').textContent = file.name;
            $('#file-size').textContent = formatSize(file.size);
            $('#file-info').style.display = '';
            $('#upload-area').style.display = 'none';

            // Sheet selector
            if (sheetNames.length > 1) {
                const sel = $('#sheet-selector');
                sel.innerHTML = '';
                sheetNames.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    sel.appendChild(opt);
                });
                sel.addEventListener('change', () => loadSheet(sel.value));
                $('#sheet-selector-container').style.display = '';
            }

            loadSheet(sheetNames[0]);
            setStatus('File loaded', 'success');
        } catch (err) {
            Logger.error('Parse error:', err);
            setStatus('Failed to parse file', 'error');
        }
    }

    function loadSheet(sheetName) {
        currentSheet = sheetName;
        const ws = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });

        // Clean data
        parsedData = rawData.filter(row => {
            return Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '');
        });

        columns = parsedData.length > 0 ? Object.keys(parsedData[0]) : [];

        // Update info
        $('#row-count').textContent = `${parsedData.length} rows`;
        $('#col-count').textContent = `${columns.length} columns`;
        $('#info-bar').style.display = '';

        // Render preview
        renderPreview();
        currentRowIndex = 0;

        // Reset mapping
        currentMapping = {};
        manualOverrides = {};
        renderMappingGrid();
    }

    function renderPreview() {
        const thead = $('#preview-thead');
        const tbody = $('#preview-tbody');
        thead.innerHTML = '';
        tbody.innerHTML = '';

        if (columns.length === 0) {
            $('#data-preview').style.display = 'none';
            return;
        }

        // Header
        const tr = document.createElement('tr');
        columns.forEach(col => {
            const th = document.createElement('th');
            th.textContent = col;
            tr.appendChild(th);
        });
        thead.appendChild(tr);

        // Rows (max 5)
        const previewRows = parsedData.slice(0, 5);
        previewRows.forEach(row => {
            const rtr = document.createElement('tr');
            columns.forEach(col => {
                const td = document.createElement('td');
                const val = row[col];
                td.textContent = val !== null && val !== undefined ? String(val) : '';
                td.title = td.textContent;
                rtr.appendChild(td);
            });
            tbody.appendChild(rtr);
        });

        $('#preview-note').textContent = parsedData.length <= 5
            ? `(${parsedData.length} rows total)`
            : `(first 5 of ${parsedData.length} rows)`;

        $('#data-preview').style.display = '';
    }

    /* ═══════ Form Field Detection ═══════ */

    async function injectContentScripts(tabId) {
        try {
            // Ping to see if already injected
            const pong = await chrome.tabs.sendMessage(tabId, { action: 'ping' }).catch(() => null);
            if (pong && pong.ready) return true;
        } catch (_) { /* not injected yet */ }

        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: [
                    'utils/logger.js',
                    'utils/synonyms.js',
                    'core/validator.js',
                    'core/filler.js',
                    'content/detector.js',
                    'content/content.js'
                ]
            });
            // Small delay to let scripts initialize
            await new Promise(r => setTimeout(r, 200));
            return true;
        } catch (err) {
            Logger.error('Script injection failed:', err);
            setStatus('Cannot access this page', 'error');
            return false;
        }
    }

    async function getActiveTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            setStatus('No active tab', 'error');
            return null;
        }
        // Check for restricted pages
        if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') ||
            tab.url?.startsWith('about:') || tab.url?.startsWith('edge://')) {
            setStatus('Cannot access browser pages', 'error');
            return null;
        }
        currentTabId = tab.id;
        return tab;
    }

    async function detectFieldsAndRender() {
        const tab = await getActiveTab();
        if (!tab) return;

        setStatus('Detecting form fields…', 'working');

        const injected = await injectContentScripts(tab.id);
        if (!injected) return;

        try {
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectFields' });
            if (response && response.success) {
                detectedFields = response.fields;
                setStatus(`Found ${detectedFields.length} form fields`, 'success');
                Logger.log('Detected fields:', detectedFields);
                renderMappingGrid();

                // Try loading saved profile
                await tryLoadProfile(tab.url);
            } else {
                setStatus('No fields detected', 'warning');
                detectedFields = [];
            }
        } catch (err) {
            Logger.error('Detection error:', err);
            setStatus('Field detection failed', 'error');
        }
    }

    async function tryLoadProfile(url) {
        const profileData = await Storage.getProfileForSite(url);
        if (profileData) {
            const validMapping = Mapper.applySavedProfile(profileData.profile.mapping, detectedFields);
            if (Object.keys(validMapping).length > 0) {
                currentMapping = validMapping;
                renderMappingGrid();
                setStatus(`Profile loaded for ${profileData.domain}`, 'success');
                await Storage.updateProfileLastUsed(profileData.domain);
            }
        }
    }

    /* ═══════ Mapping Grid ═══════ */

    function initMappingControls() {
        $('#auto-map-btn').addEventListener('click', runAutoMap);
        $('#clear-map-btn').addEventListener('click', clearMappings);
        $('#detect-fields-btn').addEventListener('click', detectFieldsAndRender);
        $('#prev-row').addEventListener('click', () => navigateRow(-1));
        $('#next-row').addEventListener('click', () => navigateRow(1));
        $('#fill-btn').addEventListener('click', fillCurrentRow);
        $('#fill-batch-btn').addEventListener('click', fillAllRows);
        $('#stop-fill-btn').addEventListener('click', stopFill);
    }

    function renderMappingGrid() {
        const grid = $('#mapping-grid');
        grid.innerHTML = '';

        if (columns.length === 0 || detectedFields.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = columns.length === 0
                ? '<p>Upload an Excel file first.</p>'
                : '<p>Click "Re-Detect" to scan for form fields on the current page.</p>';
            grid.appendChild(empty);
            $('#fill-controls').style.display = 'none';
            return;
        }

        columns.forEach(col => {
            const row = document.createElement('div');
            row.className = 'mapping-row';

            // Column name
            const colDiv = document.createElement('div');
            colDiv.className = 'excel-column';
            colDiv.textContent = col;
            colDiv.title = col;

            // Confidence dot
            const dotDiv = document.createElement('div');
            const dot = document.createElement('div');
            dot.className = 'confidence-dot';
            const mapInfo = currentMapping[col];
            if (mapInfo) {
                dot.classList.add(mapInfo.level || 'none');
                dot.title = `Confidence: ${(mapInfo.confidence * 100).toFixed(0)}%`;
            } else {
                dot.classList.add('none');
                dot.title = 'Not mapped';
            }
            dotDiv.appendChild(dot);

            // Dropdown
            const select = document.createElement('select');
            select.className = 'mapping-select';
            select.innerHTML = '<option value="">— Not mapped —</option>';
            detectedFields.forEach(field => {
                const opt = document.createElement('option');
                opt.value = field.selector;
                const label = field.label || field.name || field.id || field.selector;
                opt.textContent = `${label} (${field.type})`;
                opt.title = field.selector;
                select.appendChild(opt);
            });

            // Pre-select if mapped
            if (mapInfo) {
                select.value = mapInfo.selector;
            }

            select.addEventListener('change', () => {
                manualOverrides[col] = select.value;
                // Re-merge
                currentMapping = Mapper.mergeMappings(currentMapping, { [col]: select.value }, detectedFields);
                // Update dot
                const info = currentMapping[col];
                dot.className = 'confidence-dot ' + (info ? info.level : 'none');
            });

            row.appendChild(colDiv);
            row.appendChild(dotDiv);
            row.appendChild(select);
            grid.appendChild(row);
        });

        // Show fill controls
        $('#fill-controls').style.display = '';
        updateRowDisplay();
    }

    function runAutoMap() {
        if (columns.length === 0 || detectedFields.length === 0) {
            setStatus('No data or fields to map', 'warning');
            return;
        }

        setStatus('Running smart matcher…', 'working');

        // Infer column data types from first few rows
        const dataTypes = inferColumnTypes(columns, parsedData.slice(0, 10));

        currentMapping = Matcher.autoMap(columns, detectedFields, dataTypes);

        // Apply manual overrides on top
        if (Object.keys(manualOverrides).length > 0) {
            currentMapping = Mapper.mergeMappings(currentMapping, manualOverrides, detectedFields);
        }

        renderMappingGrid();

        const mapped = Object.keys(currentMapping).length;
        setStatus(`Mapped ${mapped}/${columns.length} columns`, mapped > 0 ? 'success' : 'warning');
    }

    function clearMappings() {
        currentMapping = {};
        manualOverrides = {};
        renderMappingGrid();
        setStatus('Mappings cleared', 'success');
    }

    function inferColumnTypes(cols, sampleRows) {
        const types = {};
        const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        cols.forEach(col => {
            const values = sampleRows.map(r => r[col]).filter(v => v !== null && v !== undefined && String(v).trim() !== '');
            if (values.length === 0) { types[col] = 'text'; return; }

            // Check patterns
            if (values.every(v => EMAIL_RE.test(String(v)))) { types[col] = 'email'; return; }
            if (values.every(v => !isNaN(parseFloat(v)))) { types[col] = 'number'; return; }
            if (values.every(v => { const d = new Date(v); return !isNaN(d.getTime()); })) { types[col] = 'date'; return; }
            if (values.every(v => /^\+?\d[\d\s\-\(\)]{6,}$/.test(String(v)))) { types[col] = 'phone'; return; }
            if (values.every(v => { try { new URL(String(v)); return true; } catch { return false; } })) { types[col] = 'url'; return; }

            types[col] = 'text';
        });

        return types;
    }

    /* ═══════ Row Navigation ═══════ */

    function navigateRow(delta) {
        currentRowIndex = Math.max(0, Math.min(currentRowIndex + delta, parsedData.length - 1));
        updateRowDisplay();
    }

    function updateRowDisplay() {
        if (parsedData.length === 0) return;
        $('#current-row-display').textContent = `${currentRowIndex + 1} / ${parsedData.length}`;
    }

    /* ═══════ Fill Operations ═══════ */

    async function fillCurrentRow() {
        if (isFilling) return;
        const tab = await getActiveTab();
        if (!tab) return;
        if (Object.keys(currentMapping).length === 0) {
            setStatus('No mappings configured', 'warning');
            return;
        }

        const injected = await injectContentScripts(tab.id);
        if (!injected) return;

        isFilling = true;
        setStatus('Filling row…', 'working');

        // Prepare mapping for content script (strip non-serializable data)
        const serialMapping = prepareSerialMapping();
        const mode = settings.fillMode || 'single';

        if (mode === 'preview') {
            // Preview only
            try {
                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'preview',
                    mapping: serialMapping,
                    rowData: parsedData[currentRowIndex]
                });
                if (response.success) {
                    showPreviewResults(response.preview, response.warnings);
                }
            } catch (err) {
                setStatus('Preview failed', 'error');
            }
            isFilling = false;
            return;
        }

        try {
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'fillRow',
                mapping: serialMapping,
                rowData: parsedData[currentRowIndex],
                settings: {
                    skipFilled: settings.skipFilled,
                    highlightFields: settings.highlightFields,
                    stopOnError: settings.stopOnError
                }
            });

            if (response.success) {
                setStatus(`Filled ${response.filled} fields (row ${currentRowIndex + 1})`, 'success');
            } else {
                const errMsg = response.errors?.map(e => `${e.column}: ${e.error}`).join(', ') || 'Unknown error';
                setStatus(`Errors: ${errMsg}`, 'error');
            }

            // Auto-submit if enabled
            if (settings.autoSubmit && response.success) {
                // Find and click submit button on the page
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        const submit = document.querySelector('button[type="submit"], input[type="submit"]');
                        if (submit) submit.click();
                    }
                });
            }

            // Auto-save profile if enabled
            if ($('#auto-save-profile').checked) {
                const domain = new URL(tab.url).hostname;
                await Storage.saveProfile(domain, Mapper.toSerializable(currentMapping), settings);
            }
        } catch (err) {
            Logger.error('Fill error:', err);
            setStatus('Fill failed', 'error');
        }

        isFilling = false;
    }

    async function fillAllRows() {
        if (isFilling) return;
        const tab = await getActiveTab();
        if (!tab) return;
        if (Object.keys(currentMapping).length === 0) {
            setStatus('No mappings configured', 'warning');
            return;
        }

        const injected = await injectContentScripts(tab.id);
        if (!injected) return;

        isFilling = true;
        $('#stop-fill-btn').style.display = '';
        $('#fill-btn').disabled = true;
        $('#fill-batch-btn').disabled = true;

        const progressBar = $('#progress-bar');
        progressBar.style.display = '';
        progressBar.value = 0;
        progressBar.max = parsedData.length;

        const serialMapping = prepareSerialMapping();

        setStatus(`Batch filling ${parsedData.length} rows…`, 'working');

        // Listen for progress updates
        const progressListener = (msg) => {
            if (msg.action === 'fillProgress') {
                progressBar.value = msg.current;
                currentRowIndex = msg.current - 1;
                updateRowDisplay();
                setStatus(`Filling row ${msg.current}/${msg.total}…`, 'working');
            }
        };
        chrome.runtime.onMessage.addListener(progressListener);

        try {
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'fillBatch',
                mapping: serialMapping,
                rows: parsedData,
                settings: {
                    skipFilled: settings.skipFilled,
                    highlightFields: settings.highlightFields,
                    stopOnError: settings.stopOnError,
                    delay: settings.delay || 500
                }
            });

            if (response.success) {
                setStatus(`Batch done: ${response.totalFilled} filled, ${response.totalErrors} errors`, 'success');
            } else {
                setStatus('Batch fill failed', 'error');
            }
        } catch (err) {
            Logger.error('Batch error:', err);
            setStatus('Batch fill error', 'error');
        }

        chrome.runtime.onMessage.removeListener(progressListener);
        isFilling = false;
        $('#stop-fill-btn').style.display = 'none';
        $('#fill-btn').disabled = false;
        $('#fill-batch-btn').disabled = false;
        progressBar.style.display = 'none';
    }

    async function stopFill() {
        const tab = await getActiveTab();
        if (tab) {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'stopFill' });
            } catch (_) { }
        }
        isFilling = false;
        setStatus('Fill stopped', 'warning');
        $('#stop-fill-btn').style.display = 'none';
        $('#fill-btn').disabled = false;
        $('#fill-batch-btn').disabled = false;
        $('#progress-bar').style.display = 'none';
    }

    function prepareSerialMapping() {
        const serial = {};
        for (const [col, info] of Object.entries(currentMapping)) {
            if (!info || !info.selector) continue;
            serial[col] = {
                selector: info.selector,
                field: info.field ? {
                    type: info.field.type,
                    name: info.field.name,
                    required: info.field.required,
                    options: info.field.options,
                    min: info.field.min,
                    max: info.field.max
                } : { type: 'text' }
            };
        }
        return serial;
    }

    function showPreviewResults(preview, warnings) {
        let msg = 'Preview: ';
        if (warnings.length > 0) {
            msg += `${warnings.length} warning(s) — ` + warnings.map(w => `${w.column}: ${w.error}`).join(', ');
            setStatus(msg, 'warning');
        } else {
            msg += `${preview.length} fields would be filled`;
            setStatus(msg, 'success');
        }
        Logger.log('Preview:', preview);
    }

    /* ═══════ Settings ═══════ */

    function initSettingsControls() {
        $('#save-settings').addEventListener('click', saveSettingsFromUI);
        $('#reset-settings').addEventListener('click', async () => {
            await Storage.resetSettings();
            settings = await Storage.getSettings();
            applySettingsToUI(settings);
            setStatus('Settings reset', 'success');
        });
    }

    function applySettingsToUI(s) {
        $('#fill-mode').value = s.fillMode || 'single';
        $('#delay').value = s.delay || 500;
        $('#auto-submit').checked = s.autoSubmit || false;
        $('#skip-filled').checked = s.skipFilled || false;
        $('#highlight-fields').checked = s.highlightFields !== false;
        $('#stop-on-error').checked = s.stopOnError !== false;
        $('#persist-data').checked = s.persistData || false;
        $('#enable-logging').checked = s.enableLogging || false;
    }

    async function saveSettingsFromUI() {
        settings = {
            fillMode: $('#fill-mode').value,
            delay: parseInt($('#delay').value, 10) || 500,
            autoSubmit: $('#auto-submit').checked,
            skipFilled: $('#skip-filled').checked,
            highlightFields: $('#highlight-fields').checked,
            stopOnError: $('#stop-on-error').checked,
            persistData: $('#persist-data').checked,
            enableLogging: $('#enable-logging').checked
        };

        await Storage.saveSettings(settings);

        if (settings.enableLogging) Logger.enable();
        else Logger.disable();

        setStatus('Settings saved', 'success');
    }

    /* ═══════ Profiles ═══════ */

    function initProfilesTab() {
        loadProfilesList();
    }

    async function loadProfilesList() {
        const container = $('#profiles-list');
        const profiles = await Storage.getAllProfiles();
        const keys = Object.keys(profiles);

        container.innerHTML = '';

        if (keys.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No saved profiles yet.</p></div>';
            return;
        }

        keys.sort((a, b) => new Date(profiles[b].lastUsed) - new Date(profiles[a].lastUsed));

        keys.forEach(domain => {
            const profile = profiles[domain];
            const item = document.createElement('div');
            item.className = 'profile-item';

            const info = document.createElement('div');
            info.className = 'profile-info';
            info.innerHTML = `
        <strong>${domain}</strong>
        <span class="profile-meta">${Object.keys(profile.mapping || {}).length} mappings · ${timeAgo(profile.lastUsed)}</span>
      `;

            const actions = document.createElement('div');
            actions.className = 'profile-actions';

            const loadBtn = document.createElement('button');
            loadBtn.className = 'btn btn-sm btn-ghost';
            loadBtn.textContent = 'Load';
            loadBtn.addEventListener('click', () => loadProfile(domain, profile));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', async () => {
                await Storage.deleteProfile(domain);
                loadProfilesList();
                setStatus(`Profile deleted: ${domain}`, 'success');
            });

            actions.appendChild(loadBtn);
            actions.appendChild(deleteBtn);
            item.appendChild(info);
            item.appendChild(actions);
            container.appendChild(item);
        });
    }

    async function loadProfile(domain, profile) {
        if (detectedFields.length === 0) {
            setStatus('Detect form fields first', 'warning');
            return;
        }
        currentMapping = Mapper.applySavedProfile(profile.mapping, detectedFields);
        renderMappingGrid();
        setStatus(`Profile loaded: ${domain}`, 'success');
        // Switch to mapping tab
        $$('.tab')[1].click();
    }

    /* ═══════ Clear ═══════ */

    function clearData() {
        workbook = null;
        sheetNames = [];
        currentSheet = '';
        parsedData = [];
        columns = [];
        currentMapping = {};
        manualOverrides = {};
        currentRowIndex = 0;

        $('#file-info').style.display = 'none';
        $('#data-preview').style.display = 'none';
        $('#upload-area').style.display = '';
        $('#sheet-selector-container').style.display = 'none';
        $('#file-input').value = '';

        renderMappingGrid();
        setStatus('Data cleared', 'success');
    }

    /* ═══════ Status Bar ═══════ */

    function setStatus(message, type) {
        const msgEl = $('#status-message');
        const dot = $('#status-dot');
        msgEl.textContent = message;

        dot.className = 'status-dot';
        if (type === 'error') dot.classList.add('error');
        else if (type === 'warning') dot.classList.add('warning');
        else if (type === 'working') dot.classList.add('working');
        // 'success' uses default green
    }

    /* ═══════ Utilities ═══════ */

    function readFileAsBinary(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsBinaryString(file);
        });
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function timeAgo(dateStr) {
        if (!dateStr) return 'unknown';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 30) return `${days}d ago`;
        return new Date(dateStr).toLocaleDateString();
    }
})();
