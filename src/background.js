// background.js - Service worker for Chrome extension
class CookieAnalyzerBackground {
    constructor() {
        this.cookieDatabase = new Map();
        this.blockedDomains = new Set();
        this.init();
    }

    init() {
        // Listen for extension installation
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });

        // Listen for messages from content scripts and popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
        });

        // Listen for tab updates to analyze new pages
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });

        // Listen for cookie changes
        chrome.cookies.onChanged.addListener((changeInfo) => {
            this.handleCookieChange(changeInfo);
        });

        // Set up periodic cleanup
        this.setupPeriodicCleanup();
    }

    async handleInstallation(details) {
        if (details.reason === 'install') {
            // Set default settings
            await chrome.storage.sync.set({
                autoDeclineEnabled: true,
                blockTrackingCookies: true,
                showNotifications: true,
                privacyLevel: 'medium' // strict, medium, basic
            });

            // Open welcome page
            chrome.tabs.create({
                url: chrome.runtime.getURL('welcome.html')
            });
        }
    }

    handleMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'pageAnalyzed':
                this.processPageAnalysis(request.data, sender.tab);
                sendResponse({ success: true });
                break;

            case 'trackingCookieDetected':
                this.handleTrackingCookie(request.cookie, request.domain);
                sendResponse({ success: true });
                break;

            case 'getCookieAnalysis':
                this.getCookieAnalysis(request.domain).then(sendResponse);
                return true; // Async response

            case 'updateSettings':
                this.updateSettings(request.settings).then(sendResponse);
                return true; // Async response

            case 'exportAllData':
                this.exportAllData().then(sendResponse);
                return true; // Async response

            case 'settingsUpdated':
                this.handleSettingsUpdate(request.settings);
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ error: 'Unknown action' });
        }
    }

    async handleSettingsUpdate(settings) {
        // When settings are updated, we might need to inject content scripts
        // into existing tabs if auto-decline was just enabled
        if (settings.autoDeclineEnabled) {
            try {
                const tabs = await chrome.tabs.query({ active: true });
                for (const tab of tabs) {
                    if (tab.url && tab.url.startsWith('http')) {
                        try {
                            await chrome.scripting.executeScript({
                                target: { tabId: tab.id },
                                files: ['content.js']
                            });
                        } catch (error) {
                            // Script might already be injected
                            console.log('Content script injection skipped for tab:', tab.id);
                        }
                    }
                }
            } catch (error) {
                console.error('Error updating content scripts:', error);
            }
        }
    }
    }

    async handleTabUpdate(tabId, changeInfo, tab) {
        if (changeInfo.status === 'complete' && tab.url) {
            try {
                const url = new URL(tab.url);
                
                // Skip non-http(s) URLs
                if (!url.protocol.startsWith('http')) return;

                // Get user settings
                const settings = await chrome.storage.sync.get([
                    'autoDeclineEnabled',
                    'blockTrackingCookies'
                ]);

                // Inject content script if needed
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                });

                // Auto-block tracking cookies if enabled
                if (settings.blockTrackingCookies) {
                    await this.blockTrackingCookiesForDomain(url.hostname);
                }

            } catch (error) {
                console.error('Error handling tab update:', error);
            }
        }
    }

    async processPageAnalysis(analysis, tab) {
        try {
            // Store analysis in database
            this.cookieDatabase.set(analysis.domain, {
                ...analysis,
                tabId: tab.id,
                lastAnalyzed: Date.now()
            });

            // Update badge with cookie count
            const cookieCount = analysis.cookies.count;
            await chrome.action.setBadgeText({
                tabId: tab.id,
                text: cookieCount > 99 ? '99+' : cookieCount.toString()
            });

            // Set badge color based on privacy score
            const color = this.getPrivacyScoreColor(analysis);
            await chrome.action.setBadgeBackgroundColor({
                tabId: tab.id,
                color: color
            });

            // Show notification if enabled and tracking detected
            const settings = await chrome.storage.sync.get(['showNotifications']);
            if (settings.showNotifications && analysis.trackingScripts.length > 0) {
                this.showTrackingNotification(analysis.domain, analysis.trackingScripts.length);
            }

        } catch (error) {
            console.error('Error processing page analysis:', error);
        }
    }

    getPrivacyScoreColor(analysis) {
        const trackingRatio = analysis.trackingScripts.length / Math.max(analysis.cookies.count, 1);
        
        if (trackingRatio < 0.2) return '#48bb78'; // Green
        if (trackingRatio < 0.5) return '#ed8936'; // Orange
        return '#f56565'; // Red
    }

    async handleCookieChange(changeInfo) {
        const cookie = changeInfo.cookie;
        
        // Check if this is a tracking cookie
        if (this.isTrackingCookie(cookie)) {
            const settings = await chrome.storage.sync.get(['blockTrackingCookies']);
            
            if (settings.blockTrackingCookies && changeInfo.cause === 'explicit') {
                // Block the tracking cookie
                await chrome.cookies.remove({
                    url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`,
                    name: cookie.name
                });

                console.log(`Blocked tracking cookie: ${cookie.name} from ${cookie.domain}`);
            }
        }
    }

    isTrackingCookie(cookie) {
        const trackingPatterns = [
            '_ga', '_gid', '_gat', // Google Analytics
            '_fbp', '_fbc', // Facebook
            '__utm', // UTM tracking
            'ads', 'doubleclick', // Advertising
            '_hjid', '_hjSession', // Hotjar
            'mp_', // Mixpanel
            '_fs_uid' // FullStory
        ];

        return trackingPatterns.some(pattern => 
            cookie.name.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    async blockTrackingCookiesForDomain(domain) {
        try {
            const cookies = await chrome.cookies.getAll({ domain: domain });
            
            for (const cookie of cookies) {
                if (this.isTrackingCookie(cookie)) {
                    await chrome.cookies.remove({
                        url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`,
                        name: cookie.name
                    });
                }
            }
        } catch (error) {
            console.error('Error blocking tracking cookies:', error);
        }
    }

    async getCookieAnalysis(domain) {
        return this.cookieDatabase.get(domain) || null;
    }

    async updateSettings(newSettings) {
        await chrome.storage.sync.set(newSettings);
        return { success: true };
    }

    async exportAllData() {
        try {
            // Get all stored analysis data
            const allData = await chrome.storage.local.get(null);
            
            // Get current settings
            const settings = await chrome.storage.sync.get(null);

            const exportData = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                settings: settings,
                analyses: allData,
                summary: {
                    totalSitesAnalyzed: Object.keys(allData).length,
                    totalCookiesFound: Object.values(allData).reduce((sum, analysis) => 
                        sum + (analysis.cookies?.count || 0), 0
                    )
                }
            };

            return exportData;
        } catch (error) {
            console.error('Error exporting data:', error);
            throw error;
        }
    }

    async showTrackingNotification(domain, trackingCount) {
        try {
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'Cookie Analyzer',
                message: `Detected ${trackingCount} tracking scripts on ${domain}`
            });
        } catch (error) {
            // Notifications permission might not be granted
            console.log('Could not show notification:', error);
        }
    }

    setupPeriodicCleanup() {
        // Clean up old analysis data every hour
        chrome.alarms.create('cleanup', { periodInMinutes: 60 });
        
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'cleanup') {
                this.cleanupOldData();
            }
        });
    }

    async cleanupOldData() {
        try {
            const allData = await chrome.storage.local.get(null);
            const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            
            const keysToRemove = [];
            
            for (const [key, data] of Object.entries(allData)) {
                if (data.lastUpdated && data.lastUpdated < oneWeekAgo) {
                    keysToRemove.push(key);
                }
            }
            
            if (keysToRemove.length > 0) {
                await chrome.storage.local.remove(keysToRemove);
                console.log(`Cleaned up ${keysToRemove.length} old analysis entries`);
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    async handleTrackingCookie(cookieString, domain) {
        // Log tracking cookie attempt
        console.log(`Tracking cookie detected on ${domain}: ${cookieString}`);
        
        // Optionally block it based on settings
        const settings = await chrome.storage.sync.get(['blockTrackingCookies']);
        if (settings.blockTrackingCookies) {
            // The cookie was already set, so we need to remove it
            const [name] = cookieString.split('=');
            try {
                await chrome.cookies.remove({
                    url: `https://${domain}`,
                    name: name
                });
            } catch (error) {
                // Try HTTP if HTTPS fails
                try {
                    await chrome.cookies.remove({
                        url: `http://${domain}`,
                        name: name
                    });
                } catch (error2) {
                    console.error('Failed to remove tracking cookie:', error2);
                }
            }
        }
    }


// Initialize the background script
new CookieAnalyzerBackground();