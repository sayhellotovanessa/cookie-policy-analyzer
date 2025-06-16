// content.js - Content script for analyzing pages and auto-declining cookies
class CookieAnalyzer {
    constructor() {
        this.cookieBannerSelectors = [
            // Common cookie banner selectors
            '[class*="cookie"]',
            '[id*="cookie"]',
            '[class*="consent"]',
            '[id*="consent"]',
            '[class*="gdpr"]',
            '[id*="gdpr"]',
            '[class*="privacy"]',
            '[id*="privacy"]',
            '.cookie-banner',
            '.cookie-notice',
            '.cookie-popup',
            '#cookie-banner',
            '#cookie-notice',
            '#cookie-popup',
            '[data-testid*="cookie"]',
            '[data-cy*="cookie"]'
        ];

        this.declineButtonSelectors = [
            // Common decline button selectors
            '[class*="decline"]',
            '[class*="reject"]',
            '[class*="deny"]',
            '[id*="decline"]',
            '[id*="reject"]',
            '[id*="deny"]',
            'button[class*="decline"]',
            'button[class*="reject"]',
            'button[class*="deny"]',
            'a[class*="decline"]',
            'a[class*="reject"]',
            'a[class*="deny"]',
            // Text-based selectors
            'button:contains("Decline")',
            'button:contains("Reject")',
            'button:contains("Deny")',
            'button:contains("No")',
            'a:contains("Decline")',
            'a:contains("Reject")',
            'a:contains("Deny")'
        ];

        this.trackingScripts = [
            'google-analytics.com',
            'googletagmanager.com',
            'facebook.net',
            'doubleclick.net',
            'googlesyndication.com',
            'amazon-adsystem.com',
            'adsystem.amazon.com',
            'twitter.com/i/adsct',
            'linkedin.com/li.lms-analytics',
            'hotjar.com',
            'fullstory.com',
            'mixpanel.com'
        ];

        this.init();
    }

    init() {
        console.log('🍪 Cookie Analyzer content script initializing...');
        
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
        });

        // Auto-analyze page on load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                console.log('🍪 DOM loaded, analyzing page...');
                this.analyzePage();
            });
        } else {
            console.log('🍪 DOM already loaded, analyzing page...');
            this.analyzePage();
        }

        // Monitor for dynamically added cookie banners
        this.observeCookieBanners();
        
        // Inject cookie monitor
        this.injectCookieMonitor();
        
        // Check if auto-decline is enabled
        this.checkAutoDeclineSettings();
        
        console.log('🍪 Cookie Analyzer content script initialized');
    }

    async checkAutoDeclineSettings() {
        try {
            const settings = await chrome.storage.sync.get(['autoDeclineEnabled']);
            if (settings.autoDeclineEnabled) {
                console.log('🍪 Auto-decline is enabled, scanning for cookie banners...');
                // Wait a bit for page to load, then auto-decline
                setTimeout(() => {
                    this.autoDeclineCookies();
                }, 2000);
            }
        } catch (error) {
            console.error('🍪 Error checking auto-decline settings:', error);
        }
    }

    handleMessage(request, sender, sendResponse) {
        console.log('🍪 Content script received message:', request.action);
        
        switch (request.action) {
            case 'analyzePage':
                this.analyzePage().then(result => {
                    console.log('🍪 Page analysis complete:', result);
                    sendResponse(result);
                });
                return true; // Async response

            case 'autoDeclineCookies':
                this.autoDeclineCookies().then(result => {
                    console.log('🍪 Auto-decline complete:', result);
                    sendResponse(result);
                });
                return true; // Async response

            case 'blockTrackingScripts':
                this.blockTrackingScripts().then(result => {
                    console.log('🍪 Block tracking complete:', result);
                    sendResponse(result);
                });
                return true; // Async response

            default:
                console.log('🍪 Unknown action:', request.action);
                sendResponse({ error: 'Unknown action' });
        }
    }

    async analyzePage() {
        const analysis = {
            url: window.location.href,
            domain: window.location.hostname,
            timestamp: Date.now(),
            cookies: this.analyzeCookies(),
            trackingScripts: this.analyzeTrackingScripts(),
            cookieBanners: this.findCookieBanners(),
            privacyPolicy: this.findPrivacyPolicy(),
            thirdPartyRequests: this.analyzeThirdPartyRequests()
        };

        // Store analysis results
        await this.storeAnalysis(analysis);

        // Send to background script for processing
        chrome.runtime.sendMessage({
            action: 'pageAnalyzed',
            data: analysis
        });

        return analysis;
    }

    analyzeCookies() {
        const cookies = document.cookie.split(';').map(cookie => {
            const [name, value] = cookie.trim().split('=');
            return { name, value, domain: window.location.hostname };
        }).filter(cookie => cookie.name);

        return {
            count: cookies.length,
            cookies: cookies,
            types: this.categorizeCookies(cookies)
        };
    }

    categorizeCookies(cookies) {
        const types = {
            essential: [],
            analytics: [],
            advertising: [],
            functional: []
        };

        cookies.forEach(cookie => {
            const name = cookie.name.toLowerCase();
            
            if (name.includes('session') || name.includes('csrf') || name.includes('auth')) {
                types.essential.push(cookie);
            } else if (name.includes('ga') || name.includes('gtm') || name.includes('_utm')) {
                types.analytics.push(cookie);
            } else if (name.includes('ads') || name.includes('fb') || name.includes('track')) {
                types.advertising.push(cookie);
            } else {
                types.functional.push(cookie);
            }
        });

        return types;
    }

    analyzeTrackingScripts() {
        const scripts = Array.from(document.querySelectorAll('script[src]'));
        const trackingScripts = [];

        scripts.forEach(script => {
            const src = script.src;
            for (const tracker of this.trackingScripts) {
                if (src.includes(tracker)) {
                    trackingScripts.push({
                        src: src,
                        type: tracker,
                        blocked: script.hasAttribute('data-blocked')
                    });
                    break;
                }
            }
        });

        return trackingScripts;
    }

    findCookieBanners() {
        const banners = [];
        
        for (const selector of this.cookieBannerSelectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(element => {
                if (this.isVisibleCookieBanner(element)) {
                    banners.push({
                        element: element,
                        selector: selector,
                        text: element.textContent.substring(0, 100),
                        declineButton: this.findDeclineButton(element)
                    });
                }
            });
        }

        return banners;
    }

    isVisibleCookieBanner(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            element.textContent.toLowerCase().includes('cookie')
        );
    }

    findDeclineButton(banner) {
        // Enhanced decline button detection
        const declineSelectors = [
            // Direct selectors
            'button[data-testid*="decline"]',
            'button[data-testid*="reject"]', 
            'button[id*="decline"]',
            'button[id*="reject"]',
            'button[class*="decline"]',
            'button[class*="reject"]',
            'a[data-testid*="decline"]',
            'a[data-testid*="reject"]',
            'a[id*="decline"]',
            'a[id*="reject"]',
            'a[class*="decline"]',
            'a[class*="reject"]',
            
            // Data attributes
            '[data-cy*="decline"]',
            '[data-cy*="reject"]',
            '[data-qa*="decline"]',
            '[data-qa*="reject"]',
            '[data-role*="decline"]',
            '[data-role*="reject"]',
            
            // ARIA labels
            'button[aria-label*="decline"]',
            'button[aria-label*="reject"]',
            'button[aria-label*="refuse"]',
            
            // Generic buttons and links
            'button',
            'a',
            '[role="button"]'
        ];

        for (const selector of declineSelectors) {
            const elements = banner.querySelectorAll(selector);
            for (const element of elements) {
                if (this.isDeclineButton(element)) {
                    return element;
                }
            }
        }

        return null;
    }

    isDeclineButton(element) {
        const text = element.textContent.toLowerCase().trim();
        const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
        const title = (element.getAttribute('title') || '').toLowerCase();
        const id = (element.getAttribute('id') || '').toLowerCase();
        const className = (element.getAttribute('class') || '').toLowerCase();
        
        const declineTerms = [
            'decline', 'reject', 'deny', 'refuse', 'no thanks', 'no, thanks',
            'opt out', 'disable', 'turn off', 'block', 'dismiss',
            'only necessary', 'essential only', 'necessary only',
            'manage preferences', 'cookie settings'
        ];
        
        const allText = `${text} ${ariaLabel} ${title} ${id} ${className}`;
        
        // Check if any decline terms are present
        const hasDeclineTerm = declineTerms.some(term => allText.includes(term));
        
        // Avoid accept buttons
        const hasAcceptTerm = ['accept', 'allow', 'agree', 'consent', 'ok', 'yes', 'enable'].some(term => allText.includes(term));
        
        return hasDeclineTerm && !hasAcceptTerm;
    }

    async autoDeclineCookies() {
        console.log('🍪 Starting auto-decline process...');
        
        let declined = 0;
        
        // Show visual indicator
        this.showAutoDeclineIndicator();
        
        // Method 1: Common cookie banner buttons (most reliable)
        const commonSelectors = [
            // BBC
            'button[data-testid="banner-reject"]',
            'button[data-testid="reject-all"]',
            
            // CNN  
            '.optanon-reject-all',
            '#onetrust-reject-all-handler',
            
            // Guardian
            '[data-link-name="reject all"]',
            'button[data-cy="reject-all"]',
            
            // Generic selectors
            'button[id*="reject"]',
            'button[class*="reject"]', 
            'button[data-cy*="reject"]',
            'button[data-testid*="reject"]',
            'button[aria-label*="reject"]',
            
            // Text-based (broader)
            'button:contains("Reject")',
            'button:contains("Decline")',
            'button:contains("No thanks")',
            'button:contains("Refuse")',
            'button:contains("Only necessary")',
            'button:contains("Essential only")'
        ];
        
        for (const selector of commonSelectors) {
            try {
                let elements;
                
                // Handle :contains() selectors differently
                if (selector.includes(':contains(')) {
                    const text = selector.match(/contains\("([^"]+)"\)/)[1];
                    elements = Array.from(document.querySelectorAll('button')).filter(btn => 
                        btn.textContent.toLowerCase().includes(text.toLowerCase())
                    );
                } else {
                    elements = document.querySelectorAll(selector);
                }
                
                for (const element of elements) {
                    if (element.offsetParent !== null) { // Is visible
                        console.log('🍪 Found decline button:', selector, element);
                        element.click();
                        declined++;
                        await this.sleep(500);
                        
                        // Hide parent container if it's a cookie banner
                        const banner = this.findCookieBannerParent(element);
                        if (banner) {
                            banner.style.display = 'none';
                            console.log('🍪 Hidden cookie banner parent');
                        }
                    }
                }
            } catch (error) {
                console.log('🍪 Selector failed:', selector, error.message);
            }
        }
        
        // Method 2: Hide common cookie banner containers
        const bannerContainers = [
            '#cookie-banner',
            '#cookie-notice', 
            '#cookie-consent',
            '.cookie-banner',
            '.cookie-notice',
            '.cookie-consent',
            '.gdpr-banner',
            '#onetrust-banner-sdk',
            '.optanon-alert-box-wrapper',
            '[class*="cookie"]',
            '[id*="cookie"]'
        ];
        
        for (const selector of bannerContainers) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (this.isVisibleCookieBanner(element)) {
                        element.style.display = 'none !important';
                        element.style.visibility = 'hidden !important';
                        console.log('🍪 Hidden cookie banner container:', selector);
                    }
                }
            } catch (error) {
                console.log('🍪 Banner hiding failed:', selector, error.message);
            }
        }
        
        console.log(`🍪 Auto-decline complete. Declined: ${declined} banners`);
        
        // Remove indicator after a delay
        setTimeout(() => {
            this.removeAutoDeclineIndicator();
        }, 3000);
        
        return { declined, total: declined };
    }

    findCookieBannerParent(element) {
        let parent = element.parentElement;
        let depth = 0;
        
        while (parent && depth < 10) {
            const text = parent.textContent.toLowerCase();
            const className = (parent.className || '').toLowerCase();
            const id = (parent.id || '').toLowerCase();
            
            if (text.includes('cookie') || text.includes('consent') || 
                className.includes('cookie') || className.includes('consent') ||
                id.includes('cookie') || id.includes('consent')) {
                return parent;
            }
            
            parent = parent.parentElement;
            depth++;
        }
        
        return null;
    }

    showAutoDeclineIndicator() {
        // Remove existing indicator
        this.removeAutoDeclineIndicator();
        
        const indicator = document.createElement('div');
        indicator.id = 'cookie-analyzer-indicator';
        indicator.innerHTML = '🍪 Auto-declining cookies...';
        indicator.style.cssText = `
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            background: #48bb78 !important;
            color: white !important;
            padding: 10px 15px !important;
            border-radius: 5px !important;
            z-index: 999999 !important;
            font-family: Arial, sans-serif !important;
            font-size: 14px !important;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3) !important;
        `;
        
        document.body.appendChild(indicator);
    }

    removeAutoDeclineIndicator() {
        const indicator = document.getElementById('cookie-analyzer-indicator');
        if (indicator) {
            indicator.remove();
        }
    }

    observeCookieBanners() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check if the added node is a cookie banner
                        for (const selector of this.cookieBannerSelectors) {
                            if (node.matches && node.matches(selector)) {
                                this.handleNewCookieBanner(node);
                            }
                            // Also check child elements
                            const childBanners = node.querySelectorAll(selector);
                            childBanners.forEach(banner => this.handleNewCookieBanner(banner));
                        }
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    async handleNewCookieBanner(banner) {
        // Check if auto-decline is enabled
        const settings = await chrome.storage.sync.get(['autoDeclineEnabled']);
        if (settings.autoDeclineEnabled) {
            const declineButton = this.findDeclineButton(banner);
            if (declineButton) {
                setTimeout(() => {
                    declineButton.click();
                }, 1000); // Small delay to ensure banner is fully loaded
            }
        }
    }

    findPrivacyPolicy() {
        const privacyLinks = document.querySelectorAll('a[href*="privacy"], a[href*="policy"]');
        const policies = [];

        privacyLinks.forEach(link => {
            if (link.textContent.toLowerCase().includes('privacy')) {
                policies.push({
                    text: link.textContent.trim(),
                    href: link.href
                });
            }
        });

        return policies;
    }

    analyzeThirdPartyRequests() {
        // This would require access to network requests
        // For now, we'll analyze based on script sources and iframe sources
        const thirdPartyDomains = new Set();
        const currentDomain = window.location.hostname;

        // Check script sources
        document.querySelectorAll('script[src]').forEach(script => {
            try {
                const url = new URL(script.src);
                if (url.hostname !== currentDomain) {
                    thirdPartyDomains.add(url.hostname);
                }
            } catch (e) {
                // Invalid URL, skip
            }
        });

        // Check iframe sources
        document.querySelectorAll('iframe[src]').forEach(iframe => {
            try {
                const url = new URL(iframe.src);
                if (url.hostname !== currentDomain) {
                    thirdPartyDomains.add(url.hostname);
                }
            } catch (e) {
                // Invalid URL, skip
            }
        });

        return Array.from(thirdPartyDomains);
    }

    async storeAnalysis(analysis) {
        const storageKey = `analysis_${analysis.domain}`;
        await chrome.storage.local.set({
            [storageKey]: {
                ...analysis,
                lastUpdated: Date.now()
            }
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Inject script to monitor cookie changes
    injectCookieMonitor() {
        const script = document.createElement('script');
        script.textContent = `
            (function() {
                const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
                                     Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
                
                Object.defineProperty(document, 'cookie', {
                    get() {
                        return originalCookie.get.call(this);
                    },
                    set(value) {
                        // Notify content script of cookie change
                        window.postMessage({
                            type: 'COOKIE_SET',
                            cookie: value
                        }, '*');
                        return originalCookie.set.call(this, value);
                    }
                });
            })();
        `;
        
        (document.head || document.documentElement).appendChild(script);
        script.remove();

        // Listen for cookie changes
        window.addEventListener('message', (event) => {
            if (event.data.type === 'COOKIE_SET') {
                this.handleCookieChange(event.data.cookie);
            }
        });
    }

    handleCookieChange(cookieString) {
        // Analyze if this is a tracking cookie and potentially block it
        const [name] = cookieString.split('=');
        const isTracking = this.isTrackingCookie(name);
        
        if (isTracking) {
            chrome.runtime.sendMessage({
                action: 'trackingCookieDetected',
                cookie: cookieString,
                domain: window.location.hostname
            });
        }
    }

    isTrackingCookie(name) {
        const trackingPatterns = ['_ga', '_gid', '_fbp', '_fbc', '__utm', 'ads', 'doubleclick'];
        return trackingPatterns.some(pattern => name.toLowerCase().includes(pattern));
    }
}

// Initialize the cookie analyzer
const cookieAnalyzer = new CookieAnalyzer();