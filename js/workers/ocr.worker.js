/**
 * ocr.worker.js
 * Web Worker dédié au traitement OCR en arrière-plan
 * Évite le blocage du thread principal pendant les opérations lourdes
 */

// Import du moteur LocalSeal dans le contexte du Worker (ES6 Module)
import { LocalSealEngine } from '../LocalSealEngine.js';

let engine = null;

/**
 * Initialise le moteur dans le worker
 * @param {Object} licenseStatus - Statut de licence depuis le thread principal
 */
async function initEngine(licenseStatus) {
    if (!engine) {
        engine = new LocalSealEngine(licenseStatus);

        // Configure les callbacks pour envoyer les mises à jour au thread principal
        engine.onProgress((step, progress, message) => {
            postMessage({
                type: 'progress',
                data: { step, progress, message }
            });
        });

        engine.onComplete((result) => {
            postMessage({
                type: 'complete',
                data: result
            });
        });

        engine.onError((error) => {
            postMessage({
                type: 'error',
                data: { message: error.message, stack: error.stack }
            });
        });
    }
}

/**
 * Écoute des messages du thread principal
 */
self.addEventListener('message', async (event) => {
    const { action, payload } = event.data;

    switch (action) {
        case 'init':
            try {
                await initEngine(payload?.licenseStatus);
                postMessage({ type: 'ready' });
            } catch (error) {
                postMessage({
                    type: 'error',
                    data: { message: `Erreur d'initialisation: ${error.message}` }
                });
            }
            break;

        case 'process':
            try {
                if (!engine) {
                    await initEngine(payload?.licenseStatus);
                }

                const { file, options } = payload;

                // Lance le traitement
                const result = await engine.processFile(file, options);

                // Le résultat est déjà envoyé via onComplete
                // Mais on peut aussi le renvoyer directement
                postMessage({
                    type: 'result',
                    data: result
                });

            } catch (error) {
                postMessage({
                    type: 'error',
                    data: { message: error.message }
                });
            }
            break;

        case 'terminate':
            if (engine) {
                await engine.destroy();
                engine = null;
            }
            self.close();
            break;

        default:
            console.warn(`Action inconnue: ${action}`);
    }
});

// Signale que le worker est prêt
postMessage({ type: 'loaded' });
