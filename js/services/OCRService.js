/**
 * OCRService.js
 * Service dédié à l'extraction de texte via Tesseract.js
 * Gère la reconnaissance optique de caractères avec support multilingue
 * Note: Tesseract.js doit être chargé via CDN dans le HTML
 */

export class OCRService {
    constructor(options = {}) {
        this.language = options.language || 'fra+eng'; // Français + Anglais par défaut
        this.worker = null;
        this.isInitialized = false;
    }

    /**
     * Initialise le worker Tesseract
     * Télécharge les modèles de langue si nécessaire
     */
    async initialize(onProgress) {
        if (this.isInitialized) return;

        try {
            // Tesseract v5: les workers sont pré-initialisés avec la langue
            this.worker = await Tesseract.createWorker(this.language);
            this.isInitialized = true;
        } catch (error) {
            throw new Error(`Échec d'initialisation OCR: ${error.message}`);
        }
    }

    /**
     * Extrait le texte et les coordonnées des mots depuis une image
     * @param {File|Blob|ImageData} imageSource - Source de l'image
     * @param {Function} onProgress - Callback de progression
     * @returns {Object} - { text, words[], confidence, blocks[] }
     */
    async extractText(imageSource, onProgress) {
        if (!this.isInitialized) {
            await this.initialize(onProgress);
        }

        try {
            // Lancement de la reconnaissance OCR
            const { data } = await this.worker.recognize(imageSource, {
                rectangle: undefined // Traite l'image entière
            });

            // Structure les données pour faciliter l'exploitation
            const result = {
                text: data.text,
                confidence: data.confidence,
                words: data.words.map(word => ({
                    text: word.text,
                    confidence: word.confidence,
                    bbox: word.bbox, // { x0, y0, x1, y1 }
                    baseline: word.baseline
                })),
                lines: data.lines.map(line => ({
                    text: line.text,
                    confidence: line.confidence,
                    bbox: line.bbox,
                    words: line.words
                })),
                blocks: data.blocks
            };

            if (onProgress) {
                onProgress({
                    step: 'ocr_complete',
                    status: 'completed',
                    progress: 1
                });
            }

            return result;
        } catch (error) {
            const errorMsg = error?.message || error?.toString() || 'Erreur inconnue';
            console.error('OCR Error:', error);
            throw new Error(`Échec de l'extraction OCR: ${errorMsg}`);
        }
    }

    /**
     * Change la langue de reconnaissance
     * Nécessite une réinitialisation du worker
     */
    async setLanguage(language) {
        if (this.language === language) return;

        this.language = language;
        this.isInitialized = false;

        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }

    /**
     * Libère les ressources (important pour éviter les fuites mémoire)
     */
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.isInitialized = false;
        }
    }
}
