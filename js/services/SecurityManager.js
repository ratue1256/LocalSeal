/**
 * SecurityManager.js
 * Service de gestion de la sécurité et des licences
 * Vérifie les droits utilisateur et applique les restrictions (watermark, limite de fichiers)
 */

export class SecurityManager {
    constructor() {
        this.licenseStatus = {
            isPro: false,
            expirationDate: null,
            maxFilesPerDay: 5,
            remainingFiles: 5,
            maxFileSize: 2 * 1024 * 1024 // 2MB par défaut
        };
    }

    /**
     * Vérifie la licence de l'utilisateur (simulation asynchrone)
     * En production, cela ferait un appel API vers un serveur de licence
     * @returns {Promise<Object>} - Statut de la licence
     */
    async checkLicense() {
        return new Promise((resolve) => {
            // Simulation d'appel API avec délai
            setTimeout(() => {
                // Vérifie le localStorage pour une clé de licence
                const storedLicense = localStorage.getItem('localseal_license');

                if (storedLicense) {
                    try {
                        const license = JSON.parse(storedLicense);
                        const now = Date.now();

                        // Vérifie si la licence est encore valide
                        if (license.expirationDate > now) {
                            this.licenseStatus = {
                                isPro: true,
                                expirationDate: license.expirationDate,
                                maxFilesPerDay: Infinity,
                                remainingFiles: Infinity,
                                maxFileSize: Infinity, // Illimité pour Pro
                                licenseKey: license.key
                            };
                        }
                    } catch (e) {
                        console.warn('Licence invalide détectée');
                    }
                }

                // Gestion du compteur de fichiers pour version gratuite
                if (!this.licenseStatus.isPro) {
                    this._updateFileCounter();
                }

                resolve(this.licenseStatus);
            }, 500); // Délai simulé
        });
    }

    /**
     * Met à jour le compteur de fichiers traités (version gratuite)
     * @private
     */
    _updateFileCounter() {
        const counterData = localStorage.getItem('localseal_counter');
        const today = new Date().toDateString();

        if (counterData) {
            const { date, count } = JSON.parse(counterData);

            if (date === today) {
                this.licenseStatus.remainingFiles = Math.max(0, this.licenseStatus.maxFilesPerDay - count);
            } else {
                // Nouveau jour, reset du compteur
                this.licenseStatus.remainingFiles = this.licenseStatus.maxFilesPerDay;
                localStorage.setItem('localseal_counter', JSON.stringify({
                    date: today,
                    count: 0
                }));
            }
        } else {
            localStorage.setItem('localseal_counter', JSON.stringify({
                date: today,
                count: 0
            }));
        }
    }

    /**
     * Consomme un crédit de traitement de fichier
     * @returns {Boolean} - true si l'utilisateur peut traiter le fichier
     */
    consumeFileCredit() {
        if (this.licenseStatus.isPro) {
            return true; // Pas de limite pour les Pro
        }

        if (this.licenseStatus.remainingFiles > 0) {
            this.licenseStatus.remainingFiles--;

            // Met à jour le compteur dans le localStorage
            const counterData = JSON.parse(localStorage.getItem('localseal_counter'));
            counterData.count++;
            localStorage.setItem('localseal_counter', JSON.stringify(counterData));

            return true;
        }

        return false; // Limite atteinte
    }

    /**
     * Détermine si un watermark doit être ajouté
     * @returns {Boolean}
     */
    requiresWatermark() {
        return !this.licenseStatus.isPro;
    }

    /**
     * Retourne le texte du watermark à appliquer
     * @returns {String}
     */
    getWatermarkText() {
        return 'LocalSeal - Version Démo';
    }

    /**
     * Active une licence Pro (pour test ou achat)
     * @param {String} licenseKey - Clé de licence fournie
     * @returns {Promise<Boolean>} - true si activation réussie
     */
    async activateLicense(licenseKey) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Validation simple de la clé (en prod, cela serait côté serveur)
                if (this._validateLicenseKey(licenseKey)) {
                    const expirationDate = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 an

                    const license = {
                        key: licenseKey,
                        expirationDate,
                        isPro: true
                    };

                    localStorage.setItem('localseal_license', JSON.stringify(license));

                    this.licenseStatus = {
                        isPro: true,
                        expirationDate,
                        maxFilesPerDay: Infinity,
                        remainingFiles: Infinity,
                        maxFileSize: Infinity,
                        licenseKey
                    };

                    resolve(true);
                } else {
                    resolve(false);
                }
            }, 300);
        });
    }

    /**
     * Valide le format de la clé de licence (simulation)
     * @private
     */
    _validateLicenseKey(key) {
        // Validation algorithmique (Checksum) pour éviter les clés hardcodées
        // Format: RAND-TIME-RAND-HASH

        if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) {
            return false;
        }

        // 1. Checksum Validation
        const parts = key.split('-');
        const payload = parts.slice(0, 3).join('-');
        const check = parts[3];
        const timeCodeHex = parts[1]; // Le timestamp est dans la partie 2

        const SALT = "LocalSeal_V2_Secret_Salt_2026";

        let hash = 0;
        const input = payload + SALT;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        const calculatedCheck = Math.abs(hash).toString(16).toUpperCase().padStart(4, '0').slice(-4);

        if (check !== calculatedCheck) return false;

        // 2. Time Validation (5 Minutes Window)
        try {
            const keyMinutes = parseInt(timeCodeHex, 16);
            const currentMinutes = Math.floor(Date.now() / 60000);

            // Gère le cas improbable du wrap-around (0xFFFF -> 0)
            const diff = currentMinutes - keyMinutes;

            // Si la clé est dans le futur (horloge décalée) ou expiration > 5 mins
            if (diff < 0 || diff > 5) {
                console.warn('Licence expirée ou date invalide');
                return false;
            }
        } catch (e) {
            return false;
        }

        // 3. Anti-Replay (Single Use Local Check)
        const usedKeys = JSON.parse(localStorage.getItem('localseal_used_keys') || '[]');
        if (usedKeys.includes(key)) {
            console.warn('Licence déjà utilisée');
            return false;
        }

        // Si tout est bon, on marque la clé comme utilisée
        usedKeys.push(key);
        localStorage.setItem('localseal_used_keys', JSON.stringify(usedKeys));

        return true;
    }

    /**
     * Réinitialise la licence (déconnexion)
     */
    resetLicense() {
        localStorage.removeItem('localseal_license');
        this.licenseStatus = {
            isPro: false,
            expirationDate: null,
            maxFilesPerDay: 5,
            remainingFiles: 5,
            maxFileSize: 2 * 1024 * 1024
        };
    }

    /**
     * Retourne les informations de licence pour affichage UI
     */
    getLicenseInfo() {
        return {
            ...this.licenseStatus,
            status: this.licenseStatus.isPro ? 'Pro' : 'Gratuit'
        };
    }
}
