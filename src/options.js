// options.js - Settings page functionality
class OptionsManager {
    constructor() {
        this.defaultSettings = {
            autoDeclineEnabled: true,
            blockTrackingCookies: true,
            showNotifications: true,
            privacyLevel: 'medium',
            whitelist: []
        };
        
        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadStatistics();
        this.setupEventListeners();
    }

    async loadSettings() {
        try {
            const settings = await chrome.storage.sync.get(this.defaultSettings);
            this.updateUI(settings);
        } catch (error) {
            console.error('Error loading settings:', error);
            this.showNotification('Error loading settings', 'error');
        }
    }

    updateUI(settings) {
        // Update toggle switches
        this.setToggle('autoDeclineToggle', settings.autoDeclineEnabled);
        this.setToggle('blockTrackingToggle', settings.blockTrackingCookies);
        this.setToggle('notificationsToggle', settings.showNotifications);
        
        // Update privacy level
        document.getElementById('privacyLevel').value = settings.privacyLevel;
        
        // Update whitelist
        this.updateWhitelist(settings.whitelist || []);
    }

    setToggle(toggleId, isActive) {
        const toggle = document.getElementById(toggleId);
        if (isActive) {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    }

    updateWhitelist(whitelist) {
        const listElement = document.getElementById('whitelistList');
        listElement.innerHTML = '';
        
        if (whitelist.length === 0) {
            listElement.innerHTML = '<div class="whitelist-item">No whitelisted domains</div>';
            return;
        }
        
        whitelist.forEach(domain => {
            const item = document.createElement('div');
            item.className = 'whitelist-item';
            item.innerHTML = `
                <span>${domain}</span>
                <button class="remove-btn" data-domain="${domain}">Remove</button>
            `;
            listElement.appendChild(item);
        });
    }

    async loadStatistics() {
        try {
            const stats = await chrome.storage.local.get([
                'sitesAnalyzed',
                'cookiesBlocked', 
                'bannersDeclined',
                'trackersBlocked'
            ]);
            
            document.getElementById('sitesAnalyzed').textContent = stats.sitesAnalyzed || 0;
            document.getElementById('cookiesBlocked').textContent = stats.cookiesBlocked || 0;
            document.getElementById('bannersDeclined').textContent = stats.bannersDeclined || 0;
            document.getElementById('trackersBlocked').textContent = stats.trackersBlocked || 0;
            
        } catch (error) {
            console.error('Error loading statistics:', error);
        }
    }

    setupEventListeners() {
        // Toggle switches - Fixed event handling
        document.getElementById('autoDeclineToggle').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleSetting('autoDeclineToggle');
            this.saveSettings(); // Auto-save when toggled
        });
        
        document.getElementById('blockTrackingToggle').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleSetting('blockTrackingToggle');
            this.saveSettings(); // Auto-save when toggled
        });
        
        document.getElementById('notificationsToggle').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleSetting('notificationsToggle');
            this.saveSettings(); // Auto-save when toggled
        });
        
        // Privacy level dropdown
        document.getElementById('privacyLevel').addEventListener('change', () => {
            this.saveSettings();
        });
        
        // Whitelist management
        document.getElementById('addWhitelistBtn').addEventListener('click', () => {
            this.addToWhitelist();
        });
        
        document.getElementById('whitelistInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addToWhitelist();
            }
        });
        
        // Event delegation for remove buttons
        document.getElementById('whitelistList').addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) {
                this.removeFromWhitelist(e.target.dataset.domain);
            }
        });
        
        // Action buttons
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveSettings();
        });
        
        document.getElementById('exportBtn').addEventListener('click', () => {
            this.exportData();
        });
        
        document.getElementById('importBtn').addEventListener('click', () => {
            this.importSettings();
        });
        
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.resetToDefaults();
        });
    }

    toggleSetting(toggleId) {
        const toggle = document.getElementById(toggleId);
        const isActive = toggle.classList.contains('active');
        
        if (isActive) {
            toggle.classList.remove('active');
            console.log(`${toggleId} disabled`);
        } else {
            toggle.classList.add('active');
            console.log(`${toggleId} enabled`);
        }
        
        // Visual feedback
        this.showNotification(`Setting ${isActive ? 'disabled' : 'enabled'}`, 'success');
    }

    async addToWhitelist() {
        const input = document.getElementById('whitelistInput');
        const domain = input.value.trim().toLowerCase();
        
        if (!domain) {
            this.showNotification('Please enter a domain', 'error');
            return;
        }
        
        // Basic domain validation
        if (!this.isValidDomain(domain)) {
            this.showNotification('Please enter a valid domain (e.g., example.com)', 'error');
            return;
        }
        
        try {
            const settings = await chrome.storage.sync.get(['whitelist']);
            const whitelist = settings.whitelist || [];
            
            if (whitelist.includes(domain)) {
                this.showNotification('Domain already in whitelist', 'error');
                return;
            }
            
            whitelist.push(domain);
            await chrome.storage.sync.set({ whitelist });
            
            this.updateWhitelist(whitelist);
            input.value = '';
            this.showNotification('Domain added to whitelist', 'success');
            
        }