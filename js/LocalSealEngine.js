/**
 * LocalSealEngine.js
 * Orchestrateur principal de l'application LocalSeal
 * Coordonne tous les services pour le traitement complet des fichiers
 */

import { OCRService } from './services/OCRService.js';
import { NLPProcessor } from './services/NLPProcessor.js';
import { ImageService } from './services/ImageService.js';

export class LocalSealEngine {
    constructor(licenseStatus = null) {
        // Initialisation des services
        this.ocrService = new OCRService({ language: 'fra+eng' });
        this.nlpProcessor = new NLPProcessor();
        this.imageService = new ImageService();

        // Le SecurityManager n'est plus utilisé dans le Worker
        // La licence est passée depuis le thread principal
        this.licenseStatus = licenseStatus || {
            isPro: false,
            requiresWatermark: true
        };

        // État du traitement
        this.state = {
            currentStep: null,
            progress: 0,
            isProcessing: false
        };

        // Callbacks pour communication avec l'UI
        this.listeners = {
            onProgress: [],
            onComplete: [],
            onError: []
        };
    }

    /**
     * Enregistre un callback pour les mises à jour de progression
     * @param {Function} callback - (step, progress, message) => void
     */
    onProgress(callback) {
        this.listeners.onProgress.push(callback);
        return this; // Chaînage
    }

    /**
     * Enregistre un callback de fin de traitement
     * @param {Function} callback - (result) => void
     */
    onComplete(callback) {
        this.listeners.onComplete.push(callback);
        return this;
    }

    /**
     * Enregistre un callback d'erreur
     * @param {Function} callback - (error) => void
     */
    onError(callback) {
        this.listeners.onError.push(callback);
        return this;
    }

    /**
     * Émet un événement de progression
     * @private
     */
    _emitProgress(step, progress, message) {
        this.state.currentStep = step;
        this.state.progress = progress;

        this.listeners.onProgress.forEach(cb => {
            cb(step, progress, message);
        });
    }

    /**
     * Émet un événement de complétion
     * @private
     */
    _emitComplete(result) {
        this.state.isProcessing = false;
        this.listeners.onComplete.forEach(cb => cb(result));
    }

    /**
     * Émet un événement d'erreur
     * @private
     */
    _emitError(error) {
        this.state.isProcessing = false;
        this.listeners.onError.forEach(cb => cb(error));
    }

    /**
     * Point d'entrée principal : traite un fichier selon les options
     * @param {File} file - Fichier à traiter
     * @param {Object} options - Configuration du traitement
     * @returns {Promise<File>} - Fichier traité prêt pour téléchargement
     */
    async processFile(file, options = {}) {
        const {
            anonymize = false,          // Activer l'anonymisation
            blurIntensity = 20,          // Intensité du flou (1-50)
            outputFormat = 'image/jpeg', // Format de sortie
            quality = 0.92,              // Qualité de compression
            extractTextOnly = false      // Extraction texte sans modification image
        } = options;

        // La vérification de licence est maintenant faite dans le thread principal
        // et passée via les options ou le constructeur

        try {
            this.state.isProcessing = true;

            // Étape 1: Validation du type MIME
            this._emitProgress('mime_detection', 0.1, 'Detecting file type...');
            const mimeType = this._detectMimeType(file);
            const isPdf = mimeType === 'application/pdf';

            if (!mimeType.startsWith('image/') && !isPdf) {
                throw new Error(`Unsupported file type: ${mimeType}`);
            }

            // Étape 2: Chargement de l'image
            this._emitProgress('image_load', 0.15, 'Loading image...');
            const image = await this.imageService.loadImage(file);
            this.imageService.initCanvas(image);

            // Étape 3: OCR - Extraction du texte
            this._emitProgress('ocr_start', 0.2, 'Reading image...');

            // Utilise le canvas (compatible avec PDF converti) au lieu du fichier original
            const ocrResult = await this.ocrService.extractText(
                this.imageService.canvas,
                (progress) => {
                    const baseProgress = 0.2;
                    const range = 0.4; // OCR prend 20% à 60%
                    this._emitProgress(
                        'ocr_processing',
                        baseProgress + (progress.progress * range),
                        `OCR Processing... ${Math.round(progress.progress * 100)}%`
                    );
                }
            );

            this._emitProgress('ocr_complete', 0.6, `Text extracted with ${Math.round(ocrResult.confidence)}% confidence`);

            // Si extraction seule, on retourne directement le texte
            if (extractTextOnly) {
                const textBlob = new Blob([ocrResult.text], { type: 'text/plain' });
                const textFile = new File([textBlob], file.name.replace(/\.\w+$/, '.txt'), {
                    type: 'text/plain'
                });

                this._emitComplete({ file: textFile, text: ocrResult.text });
                return textFile;
            }

            // Étape 4: Anonymisation (si activée)
            let nlpResult = null;
            if (anonymize) {
                this._emitProgress('nlp_analysis', 0.65, 'Extracting names...');

                nlpResult = this.nlpProcessor.analyze(ocrResult.text);

                this._emitProgress(
                    'nlp_complete',
                    0.7,
                    `${nlpResult.total} sensitive entities detected`
                );

                if (nlpResult.total > 0) {
                    this._emitProgress('blur_start', 0.75, 'Anonymizing...');

                    // Mappe les entités NLP aux coordonnées OCR
                    const boxesToBlur = this.nlpProcessor.mapEntitiesToWords(
                        nlpResult,
                        ocrResult.words
                    );

                    // Applique le floutage sur le canvas
                    this.imageService.blurRegions(boxesToBlur, blurIntensity);

                    this._emitProgress('blur_complete', 0.85, 'Anonymization complete');
                } else {
                    this._emitProgress('blur_skip', 0.8, 'No sensitive data detected');
                }
            }

            // Étape 5: Application du watermark (version gratuite)
            if (this.licenseStatus.requiresWatermark) {
                this._emitProgress('watermark', 0.9, 'Adding watermark...');
                this.imageService.addSmartWatermark(
                    'LocalSeal - Demo Version',
                    { fontSize: 32, opacity: 0.25, angle: -45 }
                );
            }

            // Étape 6: Export et compression
            this._emitProgress('export', 0.95, 'Generating file...');

            let outputFile;
            const outputName = this._generateOutputFilename(file.name, anonymize, isPdf);

            if (isPdf) {
                outputFile = await this.imageService.exportAsPDF(outputName, quality);
            } else {
                outputFile = await this.imageService.exportAsFile(outputName, outputFormat, quality);
            }

            this._emitProgress('complete', 1.0, 'Processing complete!');

            // Génère une miniature pour l'aperçu (surtout pour les PDF qui ne s'affichent pas dans <img>)
            const thumbnail = await this.imageService.exportAsBlob('image/jpeg', 0.5);

            // Résultat final
            const result = {
                file: outputFile,
                thumbnail: thumbnail, // Ajout de la miniature
                text: ocrResult.text,
                confidence: ocrResult.confidence,
                entitiesFound: anonymize ? nlpResult?.total || 0 : 0,
                watermarked: this.licenseStatus.requiresWatermark
            };

            this._emitComplete(result);
            return result;

        } catch (error) {
            this._emitError(error);
            throw error;
        } finally {
            // Nettoyage des ressources
            this.imageService.destroy();
        }
    }

    /**
     * Détecte le type MIME d'un fichier
     * @private
     */
    _detectMimeType(file) {
        if (file.type) {
            return file.type;
        }

        // Fallback: détection par extension
        const ext = file.name.split('.').pop().toLowerCase();
        const mimeMap = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'pdf': 'application/pdf'
        };

        return mimeMap[ext] || 'application/octet-stream';
    }

    /**
     * Génère un nom de fichier de sortie
     * @private
     */
    _generateOutputFilename(originalName, anonymized, isPdf = false) {
        const baseName = originalName.replace(/\.\w+$/, '');
        const suffix = anonymized ? '_anonymized' : '_processed';
        const ext = isPdf ? '.pdf' : '.jpg';
        return `${baseName}${suffix}${ext}`;
    }

    /**
     * Libère toutes les ressources (à appeler lors de la fermeture de l'app)
     */
    async destroy() {
        await this.ocrService.terminate();
        this.imageService.destroy();
    }
}
