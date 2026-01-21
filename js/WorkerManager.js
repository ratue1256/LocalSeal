/**
 * WorkerManager.js
 * Gestionnaire de Web Workers pour faciliter la communication
 * Interface simplifiée pour le thread principal
 */

export class WorkerManager {
    constructor(workerPath) {
        this.workerPath = workerPath;
        this.worker = null;
        this.isReady = false;
        this.callbacks = {
            onProgress: null,
            onComplete: null,
            onError: null
        };
    }

    /**
     * Initialise le Web Worker
     * @param {Object} licenseStatus - Statut de la licence
     * @returns {Promise<void>}
     */
    async init(licenseStatus = null) {
        return new Promise((resolve, reject) => {
            try {
                this.worker = new Worker(this.workerPath, { type: 'module' });

                this.worker.addEventListener('message', (event) => {
                    this._handleMessage(event.data);
                });

                this.worker.addEventListener('error', (error) => {
                    console.error('Erreur du Worker:', error);
                    if (this.callbacks.onError) {
                        this.callbacks.onError(error);
                    }
                });

                // Attente du signal 'ready'
                const readyHandler = (event) => {
                    if (event.data.type === 'ready' || event.data.type === 'loaded') {
                        this.isReady = true;
                        this.worker.removeEventListener('message', readyHandler);
                        resolve();
                    }
                };

                this.worker.addEventListener('message', readyHandler);

                // Envoie la commande d'initialisation avec licenseStatus
                this.worker.postMessage({
                    action: 'init',
                    payload: { licenseStatus }
                });

                // Timeout de sécurité
                setTimeout(() => {
                    if (!this.isReady) {
                        reject(new Error('Timeout: le Worker n\'a pas répondu'));
                    }
                }, 10000);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Traite un fichier via le Worker
     * @param {File} file
     * @param {Object} options
     * @param {Object} licenseStatus - Statut de la licence
     */
    processFile(file, options = {}, licenseStatus = null) {
        if (!this.isReady) {
            throw new Error('Worker non initialisé');
        }

        this.worker.postMessage({
            action: 'process',
            payload: { file, options, licenseStatus }
        });
    }

    /**
     * Récupère les informations de licence
     */
    getLicenseInfo() {
        if (!this.isReady) return;
        this.worker.postMessage({ action: 'getLicenseInfo' });
    }

    /**
     * Active une licence
     * @param {String} licenseKey
     */
    activateLicense(licenseKey) {
        if (!this.isReady) {
            throw new Error('Worker non initialisé');
        }

        this.worker.postMessage({
            action: 'activateLicense',
            payload: { licenseKey }
        });
    }

    /**
     * Enregistre les callbacks
     */
    onProgress(callback) {
        this.callbacks.onProgress = callback;
        return this;
    }

    onComplete(callback) {
        this.callbacks.onComplete = callback;
        return this;
    }

    onError(callback) {
        this.callbacks.onError = callback;
        return this;
    }

    /**
     * Gère les messages reçus du Worker
     * @private
     */
    _handleMessage(message) {
        const { type, data } = message;

        switch (type) {
            case 'progress':
                if (this.callbacks.onProgress) {
                    this.callbacks.onProgress(data.step, data.progress, data.message);
                }
                break;

            case 'complete':
            case 'result':
                if (this.callbacks.onComplete) {
                    this.callbacks.onComplete(data);
                }
                break;

            case 'error':
                if (this.callbacks.onError) {
                    this.callbacks.onError(new Error(data.message));
                }
                break;

            case 'licenseInfo':
                // Peut être géré via un callback dédié si nécessaire
                console.log('License Info:', data);
                break;

            case 'licenseActivated':
                console.log('License Activated:', data.success);
                break;

            default:
                console.log('Message du Worker:', message);
        }
    }

    /**
     * Termine le Worker et libère les ressources
     */
    terminate() {
        if (this.worker) {
            this.worker.postMessage({ action: 'terminate' });
            this.worker.terminate();
            this.worker = null;
            this.isReady = false;
        }
    }
}
