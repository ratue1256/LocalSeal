/**
 * ImageService.js
 * Service de manipulation d'images (canvas, compression, floutage)
 * Permet le traitement client-side des images sans envoi serveur
 */

export class ImageService {
    constructor() {
        this.canvas = null;
        this.ctx = null;
    }

    /**
     * Charge une image depuis un File/Blob et retourne un HTMLImageElement
     * Supporte aussi les PDF (convertit la 1ère page en image)
     * @param {File|Blob} file - Fichier image ou PDF
     * @returns {Promise<HTMLImageElement>}
     */
    async loadImage(file) {
        // Détecte si c'est un PDF
        if (file.type === 'application/pdf') {
            return this.loadPDF(file);
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Impossible de charger l\'image'));
            };

            img.src = url;
        });
    }

    /**
     * Charge un PDF et convertit la première page en HTMLImageElement
     * @param {File|Blob} pdfFile - Fichier PDF
     * @returns {Promise<HTMLImageElement>}
     */
    async loadPDF(pdfFile) {
        try {
            // Charge le PDF avec PDF.js
            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            // Récupère la première page
            const page = await pdf.getPage(1);

            // Configure le viewport (résolution)
            const viewport = page.getViewport({ scale: 2.0 }); // 2x pour meilleure qualité OCR

            // Crée un canvas temporaire pour le rendu
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            // Rend la page PDF sur le canvas
            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

            // Convertit le canvas en Image
            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Échec de conversion PDF'));
                        return;
                    }

                    const img = new Image();
                    const url = URL.createObjectURL(blob);

                    img.onload = () => {
                        URL.revokeObjectURL(url);
                        resolve(img);
                    };

                    img.onerror = () => {
                        URL.revokeObjectURL(url);
                        reject(new Error('Impossible de charger l\'image PDF'));
                    };

                    img.src = url;
                });
            });
        } catch (error) {
            throw new Error(`Échec du chargement PDF: ${error.message}`);
        }
    }

    /**
     * Initialise le canvas avec les dimensions de l'image
     * @param {HTMLImageElement} image
     */
    initCanvas(image) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = image.width;
        this.canvas.height = image.height;
        this.ctx = this.canvas.getContext('2d');

        // Dessine l'image originale sur le canvas
        this.ctx.drawImage(image, 0, 0);
    }

    /**
     * Applique un flou sur des zones spécifiques (bounding boxes)
     * Utilise un filtre pixelisé pour masquer les données sensibles
     * @param {Array} boxes - Tableau de { bbox: {x0, y0, x1, y1} }
     * @param {Number} blurIntensity - Intensité du flou (1-50)
     */
    blurRegions(boxes, blurIntensity = 20) {
        if (!this.ctx) {
            throw new Error('Canvas non initialisé');
        }

        boxes.forEach(({ bbox }) => {
            const width = bbox.x1 - bbox.x0;
            const height = bbox.y1 - bbox.y0;

            // Extrait la région à flouter
            const imageData = this.ctx.getImageData(bbox.x0, bbox.y0, width, height);

            // Applique un effet de pixelisation pour anonymiser
            this._pixelate(imageData, blurIntensity);

            // Redessine la région floutée
            this.ctx.putImageData(imageData, bbox.x0, bbox.y0);
        });
    }

    /**
     * Effet de pixelisation (alternative au flou gaussien, plus performant)
     * @private
     */
    _pixelate(imageData, pixelSize) {
        const { width, height, data } = imageData;

        for (let y = 0; y < height; y += pixelSize) {
            for (let x = 0; x < width; x += pixelSize) {
                // Calcule la couleur moyenne du bloc
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                // Applique cette couleur à tout le bloc
                for (let dy = 0; dy < pixelSize && y + dy < height; dy++) {
                    for (let dx = 0; dx < pixelSize && x + dx < width; dx++) {
                        const i = ((y + dy) * width + (x + dx)) * 4;
                        data[i] = r;
                        data[i + 1] = g;
                        data[i + 2] = b;
                        // Alpha reste inchangé
                    }
                }
            }
        }
    }

    /**
     * Ajoute un filigrane "intelligent" et intrusif (tiled pattern)
     * @param {String} text - Texte du watermark
     * @param {Object} options - Configuration
     */
    addSmartWatermark(text, options = {}) {
        if (!this.ctx) {
            throw new Error('Canvas non initialisé');
        }

        const {
            fontSize = 24,
            opacity = 0.3,
            angle = -30
        } = options;

        this.ctx.save();
        // "Plus petit" : On réduit la taille (16px)
        const effectiveFontSize = 16;
        this.ctx.font = `bold ${effectiveFontSize}px Arial`;

        // Mode de fusion "difference" pour visibilité maximale
        this.ctx.globalCompositeOperation = 'difference';
        // "Extrêmement transparent" : Opacité très faible (0.1)
        this.ctx.fillStyle = `rgba(255, 255, 255, 0.1)`;

        const markText = "LocalSeal";

        const textWidth = this.ctx.measureText(markText).width;
        const textHeight = effectiveFontSize;
        // "Plus de watermark" : On réduit l'espacement pour en avoir partout
        const spacingX = textWidth + 40;
        const spacingY = textHeight + 40;

        // Rotation
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.rotate(angle * Math.PI / 180);
        this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);

        const diagonal = Math.sqrt(this.canvas.width ** 2 + this.canvas.height ** 2);
        const startX = -diagonal;
        const startY = -diagonal;
        const endX = diagonal;
        const endY = diagonal;

        for (let y = startY; y < endY; y += spacingY) {
            for (let x = startX; x < endX; x += spacingX) {
                this.ctx.fillText(markText, x, y);
            }
        }

        this.ctx.restore();
        this.ctx.globalCompositeOperation = 'source-over';
    }

    /**
     * Compresse l'image et retourne un Blob
     * @param {String} format - Format de sortie ('image/jpeg', 'image/png', 'image/webp')
     * @param {Number} quality - Qualité de compression (0-1)
     * @returns {Promise<Blob>}
     */
    async exportAsBlob(format = 'image/jpeg', quality = 0.92) {
        return new Promise((resolve, reject) => {
            if (!this.canvas) {
                reject(new Error('Canvas non initialisé'));
                return;
            }

            this.canvas.toBlob(
                (blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Échec de la conversion en Blob'));
                    }
                },
                format,
                quality
            );
        });
    }

    /**
     * Convertit le canvas en File (prêt pour téléchargement)
     * @param {String} filename - Nom du fichier de sortie
     * @param {String} format - Format MIME
     * @param {Number} quality - Qualité de compression
     * @returns {Promise<File>}
     */
    async exportAsFile(filename, format = 'image/jpeg', quality = 0.92) {
        const blob = await this.exportAsBlob(format, quality);
        return new File([blob], filename, { type: format });
    }

    /**
     * Exporte l'image actuelle dans un fichier PDF unique
     * @param {String} filename - Nom du fichier de sortie
     * @param {Number} quality - Qualité de l'image dans le PDF
     * @returns {Promise<File>}
     */
    async exportAsPDF(filename, quality = 0.92) {
        if (!this.canvas) throw new Error('Canvas non initialisé');

        const { jsPDF } = window.jspdf;
        const orientation = this.canvas.width > this.canvas.height ? 'l' : 'p';

        // Crée le PDF aux dimensions de l'image (en points, approximation A4 non requise mais meilleure pour print)
        // Ici on adapte le PDF à la taille de l'image pour préserver la qualité 1:1
        const pdf = new jsPDF({
            orientation: orientation,
            unit: 'px',
            format: [this.canvas.width, this.canvas.height]
        });

        const imgData = this.canvas.toDataURL('image/jpeg', quality);
        pdf.addImage(imgData, 'JPEG', 0, 0, this.canvas.width, this.canvas.height);

        // Utilisation d'ArrayBuffer pour une meilleure compatibilité Blob
        const arrayBuffer = pdf.output('arraybuffer');
        const blob = new Blob([arrayBuffer], { type: 'application/pdf' });

        return new File([blob], filename, { type: 'application/pdf' });
    }

    /**
     * Libère les ressources du canvas
     */
    destroy() {
        if (this.canvas) {
            this.ctx = null;
            this.canvas = null;
        }
    }

    /**
     * Redimensionne l'image pour optimiser les performances OCR
     * (Tesseract fonctionne mieux avec des images de résolution moyenne)
     * @param {Number} maxWidth - Largeur maximale
     * @param {Number} maxHeight - Hauteur maximale
     */
    resizeForOCR(maxWidth = 2000, maxHeight = 2000) {
        if (!this.canvas) return;

        const width = this.canvas.width;
        const height = this.canvas.height;

        if (width <= maxWidth && height <= maxHeight) return;

        const ratio = Math.min(maxWidth / width, maxHeight / height);
        const newWidth = Math.floor(width * ratio);
        const newHeight = Math.floor(height * ratio);

        // Crée un canvas temporaire pour le redimensionnement
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = newWidth;
        tempCanvas.height = newHeight;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.drawImage(this.canvas, 0, 0, newWidth, newHeight);

        // Remplace le canvas actuel
        this.canvas.width = newWidth;
        this.canvas.height = newHeight;
        this.ctx.drawImage(tempCanvas, 0, 0);
    }
}
