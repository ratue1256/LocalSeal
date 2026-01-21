/**
 * NLPProcessor.js
 * Service d'analyse de langage naturel pour identifier les données sensibles
 * Utilise Compromise.js pour détecter les entités nommées (personnes, lieux, organisations)
 * Note: Compromise.js doit être chargé via CDN dans le HTML
 */

export class NLPProcessor {
    constructor() {
        // Patterns regex pour détecter des valeurs sensibles spécifiques
        this.patterns = {
            email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
            phone: /(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/g,
            iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g,
            // Format français de numéro de sécurité sociale
            secu: /\b[1-2]\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{2}\b/g,
            // Carte bancaire (simple détection)
            creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
            // Code postal français (5 chiffres)
            postalCode: /\b\d{5}\b/g,
            // Numéro de facture/commande (formats courants)
            invoiceNumber: /\b(?:N[°o]?\s*|Facture[\s:-]*|Ref[\s:-]*|Commande[\s:-]*)\d{3,12}\b/gi,
            // Montants en euros
            amount: /\b\d{1,3}(?:[\s.,]\d{3})*(?:[.,]\d{2})?\s*€\b/g,
            // Dates françaises (JJ/MM/AAAA ou JJ-MM-AAAA)
            date: /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
            // SIRET/SIREN
            siret: /\b\d{3}\s?\d{3}\s?\d{3}\s?\d{5}\b/g,
            siren: /\b\d{3}\s?\d{3}\s?\d{3}\b/g,
            // TVA intracommunautaire
            tva: /\bFR\s?\d{2}\s?\d{3}\s?\d{3}\s?\d{3}\b/gi
        };
    }

    /**
     * Analyse le texte et détecte toutes les entités sensibles
     * @param {String} text - Texte brut à analyser
     * @returns {Object} - { entities: [], sensitive: [] }
     */
    analyze(text) {
        if (!text || text.trim() === '') {
            return { entities: [], sensitive: [] };
        }

        // Utilise window.nlp (Compromise.js) chargé via CDN
        if (typeof window === 'undefined' || !window.nlp) {
            console.error('Compromise.js (nlp) n\'est pas chargé');
            return { entities: [], sensitive: [] };
        }

        const doc = window.nlp(text);
        const entities = [];

        // Extraction des personnes (noms propres)
        doc.people().forEach(person => {
            const personText = person.text();
            entities.push({
                type: 'person',
                text: personText,
                offset: text.indexOf(personText),
                length: personText.length
            });
        });

        // Extraction des lieux
        doc.places().forEach(place => {
            const placeText = place.text();
            entities.push({
                type: 'place',
                text: placeText,
                offset: text.indexOf(placeText),
                length: placeText.length
            });
        });

        // Extraction des organisations
        doc.organizations().forEach(org => {
            const orgText = org.text();
            entities.push({
                type: 'organization',
                text: orgText,
                offset: text.indexOf(orgText),
                length: orgText.length
            });
        });

        // Détection des valeurs sensibles via regex
        const sensitive = this._detectSensitiveValues(text);

        return {
            entities,
            sensitive,
            total: entities.length + sensitive.length
        };
    }

    /**
     * Détecte les valeurs sensibles (email, téléphone, IBAN, etc.)
     * @private
     */
    _detectSensitiveValues(text) {
        const results = [];

        Object.entries(this.patterns).forEach(([type, regex]) => {
            let match;
            while ((match = regex.exec(text)) !== null) {
                results.push({
                    type,
                    text: match[0],
                    offset: match.index,
                    length: match[0].length
                });
            }
        });

        return results;
    }

    /**
     * Mappe les entités textuelles aux coordonnées des mots OCR
     * Retourne les bounding boxes des mots à anonymiser
     * @param {Object} nlpResult - Résultat de l'analyse NLP
     * @param {Array} ocrWords - Tableau de mots avec coordonnées (bbox)
     * @returns {Array} - Tableau de bounding boxes à flouter
     */
    mapEntitiesToWords(nlpResult, ocrWords) {
        const boxesToBlur = [];
        const allTargets = [...nlpResult.entities, ...nlpResult.sensitive];

        allTargets.forEach(entity => {
            // Normalise le texte de l'entité pour comparaison
            const normalizedEntity = this._normalize(entity.text);

            ocrWords.forEach(word => {
                const normalizedWord = this._normalize(word.text);

                // Vérifie si le mot fait partie de l'entité sensible
                if (normalizedEntity.includes(normalizedWord)) {
                    boxesToBlur.push({
                        bbox: word.bbox,
                        type: entity.type,
                        text: word.text,
                        confidence: word.confidence
                    });
                }
            });
        });

        return boxesToBlur;
    }

    /**
     * Normalise une chaîne pour comparaison (minuscules, sans accents)
     * @private
     */
    _normalize(str) {
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, '');
    }

    /**
     * Génère un masque d'anonymisation pour le texte
     * (utilisé pour affichage textuel, pas l'image)
     */
    maskText(text, nlpResult) {
        let maskedText = text;
        const allTargets = [...nlpResult.entities, ...nlpResult.sensitive]
            .sort((a, b) => b.offset - a.offset); // Tri inverse pour remplacement

        allTargets.forEach(entity => {
            const before = maskedText.substring(0, entity.offset);
            const after = maskedText.substring(entity.offset + entity.length);
            const mask = '█'.repeat(entity.length);

            maskedText = before + mask + after;
        });

        return maskedText;
    }
}
