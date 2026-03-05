// ================================================================
// QR CHECK-IN MODULE
// ================================================================
// Handles QR code scanning for event check-in using html5-qrcode

(() => {
  'use strict';

  class QRCheckin {
    constructor() {
      this.scanner = null;
      this.isScanning = false;
      this.onCheckinCallback = null;
    }

    /**
     * Initialize QR scanner
     * @param {string} elementId - Container element ID
     * @param {Function} onCheckin - Callback(beaconId)
     */
    async init(elementId, onCheckin) {
      this.onCheckinCallback = onCheckin;

      // Load html5-qrcode library if not already loaded
      if (!window.Html5Qrcode) {
        await this._loadLibrary();
      }

      try {
        this.scanner = new Html5Qrcode(elementId);
        console.log('✅ [QRCheckin] Scanner initialized');
        return true;
      } catch (error) {
        console.error('❌ [QRCheckin] Init failed:', error);
        return false;
      }
    }

    /**
     * Start camera scanning
     * @returns {Promise<boolean>}
     */
    async startScanning() {
      if (this.isScanning) {
        console.warn('⚠️ [QRCheckin] Already scanning');
        return false;
      }

      if (!this.scanner) {
        console.error('❌ [QRCheckin] Scanner not initialized');
        return false;
      }

      try {
        await this.scanner.start(
          { facingMode: 'environment' }, // Use back camera
          {
            fps: 10,
            qrbox: { width: 250, height: 250 }
          },
          (decodedText) => this._onScanSuccess(decodedText),
          (errorMessage) => {
            // Ignore frequent scan errors
            if (!errorMessage.includes('No MultiFormat Readers')) {
              console.debug('[QRCheckin] Scan error:', errorMessage);
            }
          }
        );

        this.isScanning = true;
        console.log('✅ [QRCheckin] Camera started');
        return true;

      } catch (error) {
        console.error('❌ [QRCheckin] Start failed:', error);
        
        // Show user-friendly error
        if (error.name === 'NotAllowedError') {
          throw new Error('Camera permission denied. Please allow camera access.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No camera found on this device.');
        } else {
          throw new Error('Failed to start camera: ' + error.message);
        }
      }
    }

    /**
     * Stop camera scanning
     * @returns {Promise<void>}
     */
    async stopScanning() {
      if (!this.isScanning || !this.scanner) {
        return;
      }

      try {
        await this.scanner.stop();
        this.isScanning = false;
        console.log('✅ [QRCheckin] Camera stopped');
      } catch (error) {
        console.error('❌ [QRCheckin] Stop failed:', error);
      }
    }

    /**
     * Parse QR code content
     * @private
     * @param {string} text - Scanned text
     */
    _onScanSuccess(text) {
      console.log('📷 [QRCheckin] Scanned:', text);

      // Stop scanning immediately
      this.stopScanning();

      // Parse beacon_id from URL or direct UUID
      const beaconId = this._parseBeaconId(text);

      if (beaconId && this.onCheckinCallback) {
        this.onCheckinCallback(beaconId);
      } else {
        console.error('❌ [QRCheckin] Invalid QR code format');
        throw new Error('Invalid QR code. Please scan an event QR code.');
      }
    }

    /**
     * Parse beacon_id from scanned text
     * @private
     * @param {string} text
     * @returns {string|null} UUID
     */
    _parseBeaconId(text) {
      try {
        // Case 1: URL with beacon_id parameter
        if (text.includes('beacon_id=')) {
          const url = new URL(text);
          const beaconId = url.searchParams.get('beacon_id');
          if (this._isValidUUID(beaconId)) {
            return beaconId;
          }
        }

        // Case 2: URL with beacon_key parameter
        if (text.includes('beacon_key=')) {
          const url = new URL(text);
          const beaconKey = decodeURIComponent(url.searchParams.get('beacon_key'));
          const beacon = window.BeaconRegistry.getBeaconByKey(beaconKey);
          if (beacon) {
            return beacon.id;
          }
        }

        // Case 3: Direct UUID
        if (this._isValidUUID(text)) {
          return text;
        }

        return null;

      } catch (error) {
        console.error('❌ [QRCheckin] Parse error:', error);
        return null;
      }
    }

    /**
     * Validate UUID format
     * @private
     * @param {string} str
     * @returns {boolean}
     */
    _isValidUUID(str) {
      if (!str) return false;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      return uuidRegex.test(str);
    }

    /**
     * Load html5-qrcode library from CDN
     * @private
     * @returns {Promise<void>}
     */
    async _loadLibrary() {
      return new Promise((resolve, reject) => {
        if (window.Html5Qrcode) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
        script.onload = () => {
          console.log('✅ [QRCheckin] Library loaded');
          resolve();
        };
        script.onerror = () => {
          reject(new Error('Failed to load QR scanner library'));
        };
        document.head.appendChild(script);
      });
    }
  }

  // Export singleton
  window.QRCheckin = new QRCheckin();
  console.log('✅ QRCheckin loaded');
})();
