/**
 * Chrome Storage wrapper for profiles and settings.
 * Uses chrome.storage.local for persistence.
 */
const Storage = (() => {
    const PROFILES_KEY = 'profiles';
    const SETTINGS_KEY = 'globalSettings';

    const DEFAULT_SETTINGS = {
        fillMode: 'single',
        delay: 500,
        autoSubmit: false,
        skipFilled: false,
        highlightFields: true,
        stopOnError: true,
        enableLogging: false,
        persistData: false
    };

    /* ───── helpers ───── */

    function _get(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get(key, (result) => {
                resolve(result[key] || null);
            });
        });
    }

    function _set(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });
    }

    /* ───── profiles ───── */

    async function getAllProfiles() {
        return (await _get(PROFILES_KEY)) || {};
    }

    async function getProfile(domain) {
        const profiles = await getAllProfiles();
        return profiles[domain] || null;
    }

    async function getProfileForSite(url) {
        try {
            const domain = new URL(url).hostname;
            // Try exact match first
            let profile = await getProfile(domain);
            if (profile) return { domain, profile };

            // Try parent domain (e.g., sub.example.com → example.com)
            const parts = domain.split('.');
            if (parts.length > 2) {
                const parent = parts.slice(-2).join('.');
                profile = await getProfile(parent);
                if (profile) return { domain: parent, profile };
            }
            return null;
        } catch {
            return null;
        }
    }

    async function saveProfile(domain, mapping, settings) {
        const profiles = await getAllProfiles();
        profiles[domain] = {
            mapping,
            settings: settings || {},
            lastUsed: new Date().toISOString(),
            createdAt: profiles[domain]?.createdAt || new Date().toISOString()
        };
        await _set(PROFILES_KEY, profiles);
    }

    async function deleteProfile(domain) {
        const profiles = await getAllProfiles();
        delete profiles[domain];
        await _set(PROFILES_KEY, profiles);
    }

    async function updateProfileLastUsed(domain) {
        const profiles = await getAllProfiles();
        if (profiles[domain]) {
            profiles[domain].lastUsed = new Date().toISOString();
            await _set(PROFILES_KEY, profiles);
        }
    }

    /* ───── global settings ───── */

    async function getSettings() {
        const saved = await _get(SETTINGS_KEY);
        return { ...DEFAULT_SETTINGS, ...(saved || {}) };
    }

    async function saveSettings(settings) {
        const current = await getSettings();
        await _set(SETTINGS_KEY, { ...current, ...settings });
    }

    async function resetSettings() {
        await _set(SETTINGS_KEY, DEFAULT_SETTINGS);
    }

    /* ───── clear all ───── */

    async function clearAll() {
        return new Promise((resolve) => {
            chrome.storage.local.clear(resolve);
        });
    }

    /* ───── public API ───── */

    return {
        getAllProfiles,
        getProfile,
        getProfileForSite,
        saveProfile,
        deleteProfile,
        updateProfileLastUsed,
        getSettings,
        saveSettings,
        resetSettings,
        clearAll,
        DEFAULT_SETTINGS
    };
})();
