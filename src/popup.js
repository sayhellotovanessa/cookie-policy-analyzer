// popup.js - Main popup logic
class CookieAnalyzerPopup {
    constructor() {
        this.currentTab = null;
        this.cookieData = null;
        this.init();
    }

    async init() {
        try {
            // Get current active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;
            
            // Load data for current site
            await this.loadSiteData();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Hide loading and show content
            document.getElementById('loading').style.display = 'none';
            document.getElementById('content').style.display = 'block';
            
        } catch (error) {
            console.error('Error initializing popup:', error);
            this.showError('Failed to load site data');
        }
    }

    async loadSiteData() {
        if (!this.currentTab?.url) return;

        const url = new URL(this.currentTab.url);
        document.getElementById('currentUrl').textContent = url.hostname;

        try {
            // Get cookies for current site
            const cookies = await chrome.cookies.getAll({ domain: url.hostname });
            
            // Get stored analysis data
            const storageKey = `analysis_${url.hostname}`;
            const result = await chrome.storage.local.get([storageKey]);
            const analysisData = result[storageKey] || {};

            // Analyze cookies
            this.cookieData = this.analyzeCookies(cookies, analysisData);
            
            // Update UI
            this.updateUI();
            
            // Request fresh analysis from content script
            await this.requestFreshAnalysis();
            
        } catch (error) {
            console.error('Error loading site data:', error);
        }
    }

    analyzeCookies(cookies, analysisData) {
        const analysis = {
            total: cookies.length,
            essential: 0,
            analytics: 0,
            advertising: 0,
            functional: 0,
            blocked: analysisData.blocked || 0,
            tracking: 0,
            cookies: [],
            privacyScore: 'unknown'
        };

        cookies.forEach(cookie => {
            const type = this.categorizeCookie(cookie);
            analysis[type]++;
            
            if (type === 'analytics' || type === 'advertising') {
                analysis.tracking++;
            }

            analysis.cookies.push({
                name: cookie.name,
                domain: cookie.domain,
                type: type,
                secure: cookie.secure,
                httpOnly: cookie.httpOnly,
                sameSite: cookie.sameSite
            });
        });

        // Calculate privacy score
        analysis.privacyScore = this.calculatePrivacyScore(analysis);

        return analysis;
    }

    categorizeCookie(cookie) {
        const name = cookie.name.toLowerCase();
        const domain = cookie.domain.toLowerCase();

        // Essential cookies
        if (name.includes('session') || name.includes('csrf') || name.includes('auth') || 
            name.includes('login') || name.includes('security')) {
            return 'essential';
        }

        // Analytics cookies
        if (name.includes('ga') || name.includes('gtm') || name.includes('analytics') ||
            name.includes('_utm') || domain.includes('google-analytics')) {
            return 'analytics';
        }

        // Advertising cookies
        if (name.includes('ads') || name.includes('doubleclick') || name.includes('facebook') ||
            name.includes('twitter') || name.includes('pixel') || name.includes('track')) {
            return 'advertising';
        }

        // Default to functional
        return 'functional';
    }

    calculatePrivacyScore(analysis) {
        const trackingRatio = analysis.tracking / Math.max(analysis.total, 1);
        
        if (trackingRatio < 0.2) return 'good';
        if (trackingRatio < 0.5) return 'medium';
        return 'bad';
    }

    updateUI() {
        if (!this.cookieData) return;

        // Update counts
        document.getElementById('totalCookies').textContent = this.cookieData.total;
        document.getElementById('blockedCookies').textContent = this.cookieData.blocked;
        document.getElementById('trackingCookies').textContent = this.cookieData.tracking;
        document.getElementById('essentialCookies').textContent = this.cookieData.essential;

        // Update privacy score
        const scoreElement = document.getElementById('privacyScore');
        scoreElement.className = `privacy-score score-${this.cookieData.privacyScore}`;
        scoreElement.textContent = this.getScoreText(this.cookieData.privacyScore);

        // Update cookie details
        this.updateCookieDetails();
    }

    getScoreText(score) {
        const texts = {
            'good': 'Good Privacy',
            'medium': 'Moderate Tracking',
            'bad': 'Heavy Tracking',
            'unknown': 'Analyzing...'
        };
        return texts[score] || 'Unknown';
    }

    updateCookieDetails() {
        const cookieList = document.getElementById('cookieList');
        cookieList.innerHTML = '';

        this.cookieData.cookies.forEach(cookie => {
            const item = document.createElement('div');
            item.className = 'cookie-item';
            item.innerHTML = `
                <div>
                    <div class="cookie-name">${cookie.name}</div>
                    <div style="font-size: 10px; color: #718096;">${cookie.domain}</div>
                </div>
                <div class="cookie-type type-${cookie.type}">${cookie.type}</div>
            `;
            cookieList.appendChild(item);
        });
    }

    setupEventListeners() {
        // Block all tracking cookies
        document.getElementById('blockAllBtn').addEventListener('click', () => {
            this.blockTrackingCookies();
        });

        // Auto-decline cookies
        document.getElementById('autoDeclineBtn').addEventListener('click', () => {
            this.autoDeclineCookies();
        });

        // View details toggle
        document.getElementById('viewDetailsBtn').addEventListener('click', () => {
            const details = document.getElementById('cookieDetails');
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
        });

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });

        // Export report
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportReport();
        });
    }

    async blockTrackingCookies() {
        try {
            const url = new URL(this.currentTab.url);
            let blockedCount = 0;

            for (const cookie of this.cookieData.cookies) {
                if (cookie.type === 'analytics' || cookie.type === 'advertising') {
                    await chrome.cookies.remove({
                        url: this.currentTab.url,
                        name: cookie.name
                    });
                    blockedCount++;
                }
            }

            // Update blocked count in storage
            const storageKey = `analysis_${url.hostname}`;
            await chrome.storage.local.set({
                [storageKey]: { blocked: blockedCount }
            });

            // Refresh data
            await this.loadSiteData();
            
            this.showNotification(`Blocked ${blockedCount} tracking cookies`);
            
        } catch (error) {
            console.error('Error blocking cookies:', error);
            this.showNotification('Error blocking cookies', 'error');
        }
    }

    async autoDeclineCookies() {
        try {
            // First, inject the content script if it's not already injected
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: this.currentTab.id },
                    files: ['content.js']
                });
            } catch (injectionError) {
                // Content script might already be injected, that's okay
                console.log('Content script already injected or injection failed:', injectionError);
            }

            // Wait a moment for script to load
            await new Promise(resolve => setTimeout(resolve, 500));

            // Send message to content script to auto-decline
            const response = await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'autoDeclineCookies'
            });
            
            if (response && response.declined > 0) {
                this.showNotification(`Auto-declined ${response.declined} cookie banner(s)`);
            } else {
                this.showNotification('No cookie banners found to decline');
            }
            
            // Refresh the analysis
            setTimeout(() => {
                this.loadSiteData();
            }, 1000);
            
        } catch (error) {
            console.error('Error auto-declining:', error);
            this.showNotification('Error: Could not auto-decline cookies. Try refreshing the page.', 'error');
        }
    }

    exportReport() {
        const report = {
            url: this.currentTab.url,
            timestamp: new Date().toISOString(),
            analysis: this.cookieData
        };

        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        chrome.downloads.download({
            url: url,
            filename: `cookie-report-${new URL(this.currentTab.url).hostname}-${Date.now()}.json`
        });
    }

    async requestFreshAnalysis() {
        try {
            await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'analyzePage'
            });
        } catch (error) {
            // Content script might not be loaded yet, that's okay
            console.log('Content script not ready, using cached data');
        }
    }

    showNotification(message, type = 'success') {
        // Simple notification - in a real extension you might want something fancier
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#f56565' : '#48bb78'};
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    showError(message) {
        document.getElementById('loading').innerHTML = `
            <div style="color: #f56565; text-align: center;">
                ❌ ${message}
            </div>
        `;
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new CookieAnalyzerPopup();
});