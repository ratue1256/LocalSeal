/**
 * app.js
 * Exemple d'utilisation du LocalSealEngine
 * Intégration avec l'interface HTML existante
 * Architecture simplifiée: exécution dans le thread principal (sans Workers)
 */

import { LocalSealEngine } from './LocalSealEngine.js';
import { SecurityManager } from './services/SecurityManager.js';

// ============================================================================
// INITIALISATION
// ============================================================================

const engine = new LocalSealEngine();
const securityManager = new SecurityManager(); // Gestion de licence dans le thread principal
let currentFile = null;
let licenseStatus = null;

// Éléments DOM
const dropZone = document.getElementById('drop-zone');
const logsContainer = document.getElementById('logs');
const downloadBtn = document.getElementById('download-btn');
const previewGallery = document.getElementById('preview-gallery');
const galleryItems = document.getElementById('gallery-items');
const galleryCount = document.getElementById('gallery-count');

/**
 * Initialise l'application au chargement de la page
 */
async function init() {
    try {
        addLog('> System initializing...', 'info');

        // Vérifie la licence (dans le thread principal)
        licenseStatus = await securityManager.checkLicense();
        // Ajoute la propriété requiresWatermark pour le moteur
        licenseStatus.requiresWatermark = !licenseStatus.isPro;
        addLog(`> Mode: ${licenseStatus.isPro ? 'Pro' : 'Gratuit'} (${licenseStatus.remainingFiles} crédits)`, 'info');

        // Configure les callbacks du moteur
        engine
            .onProgress(handleProgress)
            .onComplete(handleComplete)
            .onError(handleError);

        // Met à jour l'interface de licence
        updateLicenseUI();

        // Gestion du bouton Buy License
        const buyLicenseBtn = document.getElementById('buy-license-btn');
        if (buyLicenseBtn) {
            buyLicenseBtn.addEventListener('click', async () => {
                const key = prompt('Please enter your license key (Format: XXXX-XXXX-XXXX-XXXX):');
                if (key) {
                    const success = await securityManager.activateLicense(key);
                    if (success) {
                        showToast('Pro license activated successfully! 🎉', 'success');
                        licenseStatus = await securityManager.checkLicense();
                        licenseStatus.requiresWatermark = !licenseStatus.isPro;
                        updateLicenseUI();
                    } else {
                        showToast('Invalid license key. Please try again.', 'error');
                    }
                }
            });
        }

        addLog('✓ System ready', 'success');

        // Configure les événements de drag & drop
        setupDragAndDrop();

    } catch (error) {
        addLog(`✗ Erreur d'initialisation: ${error.message}`, 'error');
    }
}

// ============================================================================
// GESTION DES FICHIERS
// ============================================================================

/**
 * Configure les événements de drag & drop sur la zone de dépôt
 */
function setupDragAndDrop() {
    // Empêche le comportement par défaut
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Visuel au survol
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('bg-sky-500/10', 'border-sky-400');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('bg-sky-500/10', 'border-sky-400');
        });
    });

    // Gestion du drop
    dropZone.addEventListener('drop', handleDrop);

    // Clic pour parcourir
    dropZone.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true; // Permettre la sélection multiple
        input.accept = 'image/*,application/pdf';
        input.onchange = (e) => handleFiles(e.target.files);
        input.click();
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

async function handleFiles(files) {
    if (!files || files.length === 0) return;

    // Réinitialise l'UI globale au début d'une nouvelle série
    clearLogs();
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.classList.add('opacity-60', 'grayscale', 'cursor-not-allowed');
        downloadBtn.classList.remove('download-active', 'scale-105', 'shadow-xl', 'shadow-sky-500/20');
    }

    // On cache la galerie si c'est le premier fichier d'une série (optionnel, ou on ajoute au fur et à mesure)
    // previewGallery.classList.add('hidden');
    // galleryItems.innerHTML = '';

    addLog(`> Starting processing of ${files.length} file(s)...`, 'info');

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        addLog(`--- File ${i + 1}/${files.length}: ${file.name} ---`, 'info');

        // 1. Validation du type
        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
            showToast(`${file.name}: Unsupported file type`, 'error');
            addLog(`✗ ${file.name}: Unsupported type`, 'error');
            errorCount++;
            continue;
        }

        // 2. Validation de la taille (Nouvelle limite Premium)
        if (file.size > licenseStatus.maxFileSize) {
            const limitStr = licenseStatus.isPro ? 'unlimited' : '2 MB';
            showToast(`${file.name}: File too large. Limit: ${limitStr}.`, 'error');
            addLog(`✗ ${file.name}: File too large. Limit ${limitStr}.`, 'error');
            if (!licenseStatus.isPro) {
                addLog('💡 Upgrade to Pro to remove this limit.', 'warning');
            }
            errorCount++;
            continue;
        }

        // 3. Vérification des crédits
        if (!securityManager.consumeFileCredit()) {
            showToast('Daily limit reached (5 files/day)', 'error');
            addLog('✗ Daily limit reached', 'error');
            addLog('💡 Upgrade to Pro for unlimited access', 'warning');
            skippedCount += (files.length - i);
            break; // On arrête tout si plus de crédits
        }

        // Met à jour l'interface de licence
        updateLicenseUI();
        currentFile = file;

        addLog(`> Processing ${file.name} (${formatFileSize(file.size)})...`, 'info');

        // Options de traitement
        const options = {
            anonymize: true,
            blurIntensity: 20,
            outputFormat: 'image/jpeg',
            quality: 0.92
        };

        // Configure le moteur
        engine.licenseStatus = licenseStatus;

        try {
            const result = await engine.processFile(file, options);
            addToGallery(result, file.name);
            successCount++;
        } catch (error) {
            addLog(`✗ Error on ${file.name}: ${error.message}`, 'error');
            errorCount++;
        }
    }

    addLog(`✅ Batch processing complete. Success: ${successCount}, Errors: ${errorCount}, Skipped: ${skippedCount}`, 'success');

    // Notification de fin adaptée
    if (successCount > 0 && errorCount === 0 && skippedCount === 0) {
        showToast('All files processed successfully!', 'success');
    } else if (successCount > 0) {
        showToast(`Processed ${successCount} files. (${errorCount + skippedCount} failed/skipped)`, 'warning');
    } else {
        showToast('No files processed successfully.', 'error');
    }

    // Affiche le modal de fin avec message conditionnel
    const completeModal = document.getElementById('complete-modal');
    if (completeModal) {
        const modalText = document.getElementById('complete-text');
        const iconContainer = document.getElementById('modal-icon-container');
        const iconPath = document.getElementById('modal-icon-path');
        const title = completeModal.querySelector('h2');

        // Reset classes
        iconContainer.className = 'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border shadow-lg transition-colors duration-300';
        iconPath.parentElement.className = 'h-10 w-10 transition-colors duration-300';

        if (errorCount === 0 && skippedCount === 0) {
            // SUCCESS STATE
            modalText.textContent = `${successCount} document(s) successfully anonymized and ready in the gallery.`;
            title.textContent = "Processing Complete!";

            // Green style
            iconContainer.classList.add('bg-emerald-500/20', 'border-emerald-500/30', 'shadow-emerald-500/10');
            iconPath.parentElement.classList.add('text-emerald-400');
            // Checkmark Icon
            iconPath.setAttribute('d', 'M5 13l4 4L19 7');
        } else {
            // ERROR/WARNING STATE
            modalText.textContent = `${successCount} document(s) processed. ${errorCount} errors, ${skippedCount} skipped (limit reached). Check logs for details.`;
            title.textContent = "Attention Needed";

            // Red/Orange style (Orange if only skipped, Red if errors)
            if (errorCount > 0) {
                iconContainer.classList.add('bg-red-500/20', 'border-red-500/30', 'shadow-red-500/10');
                iconPath.parentElement.classList.add('text-red-400');
                // Cross Icon
                iconPath.setAttribute('d', 'M6 18L18 6M6 6l12 12');
            } else {
                // Warning style (only skipped)
                iconContainer.classList.add('bg-amber-500/20', 'border-amber-500/30', 'shadow-amber-500/10');
                iconPath.parentElement.classList.add('text-amber-400');
                // Info Icon
                iconPath.setAttribute('d', 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z');
            }
        }
        completeModal.classList.remove('hidden');
    }
}

/**
 * Ajoute un résultat à la galerie de prévisualisation
 */
function addToGallery(result, originalName) {
    if (!previewGallery || !galleryItems) return;

    previewGallery.classList.remove('hidden');

    const imageUrl = result.thumbnail ? URL.createObjectURL(result.thumbnail) : URL.createObjectURL(result.file);

    const card = document.createElement('div');
    card.className = 'glass-panel rounded-xl overflow-hidden shadow-lg border border-slate-700/50 flex flex-col group hover:border-sky-500/50 transition-all duration-300';

    card.innerHTML = `
        <div class="relative aspect-video bg-slate-900 overflow-hidden cursor-pointer" onclick="window.openPreview('${imageUrl}', '${result.file.name}')">
            <img src="${imageUrl}" class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105" alt="Aperçu">
            <div class="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div class="p-3 bg-white/10 backdrop-blur rounded-full text-white shadow-xl border border-white/20">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </div>
            </div>
        </div>
        <div class="p-3 flex items-center justify-between gap-2 overflow-hidden bg-slate-950/30">
            <div class="flex flex-col min-w-0">
                <span class="text-[10px] text-slate-400 font-medium truncate" title="${originalName}">${originalName}</span>
                <span class="text-[9px] text-emerald-400 uppercase font-bold tracking-tight">Anonymized</span>
            </div>
            <div class="flex items-center space-x-1">
                <button onclick="window.openPreview('${imageUrl}', '${result.file.name}')" class="p-1.5 hover:bg-white/5 rounded text-slate-400 hover:text-white transition-colors" title="Aperçu">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </button>
                <a href="${imageUrl}" download="${result.file.name}" class="p-2 bg-sky-600/20 text-sky-400 rounded-lg hover:bg-sky-600 hover:text-white transition-all active:scale-95 shadow-lg shadow-sky-600/5">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                </a>
            </div>
        </div>
    `;

    galleryItems.insertBefore(card, galleryItems.firstChild);

    // Mise à jour compteur
    const count = galleryItems.children.length;
    if (galleryCount) galleryCount.textContent = `${count} Fichier${count > 1 ? 's' : ''}`;
}

// ============================================================================
// CALLBACKS DU WORKER
// ============================================================================

/**
 * Gère les mises à jour de progression
 */
function handleProgress(step, progress, message) {
    const percentage = Math.round(progress * 100);

    // Mapping des étapes vers des messages user-friendly
    const messageMap = {
        'license_check': '🔐 Checking license...',
        'mime_detection': '📄 Detecting file type...',
        'image_load': '🖼️ Loading image...',
        'ocr_start': '👁️ Reading image...',
        'ocr_processing': message || '🔍 OCR Processing...',
        'ocr_complete': '✓ Text extracted',
        'nlp_analysis': '🧠 Extracting names...',
        'nlp_complete': message || '✓ Analysis complete',
        'blur_start': '🎭 Anonymizing...',
        'blur_complete': '✓ Sensitive data masked',
        'blur_skip': 'ℹ️ No sensitive data detected',
        'watermark': '🏷️ Adding watermark...',
        'export': '💾 Generating file...',
        'complete': '✅ Processing complete'
    };

    const displayMessage = messageMap[step] || message;
    addLog(displayMessage, step === 'complete' ? 'success' : 'info');
}

/**
 * Gère la fin du traitement
 */
function handleComplete(result) {
    addLog(`✓ Report generated successfully`, 'success');
    addLog(`OCR Confidence: ${Math.round(result.confidence)}%`, 'info');

    if (result.entitiesFound > 0) {
        addLog(`${result.entitiesFound} sensitive entity(ies) masked`, 'warning');
    }

    // Active le bouton de téléchargement (s'il existe)
    if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.classList.remove('opacity-60', 'grayscale', 'cursor-not-allowed');
        downloadBtn.classList.add('bg-gradient-to-r', 'from-sky-500', 'to-blue-500', 'hover:from-sky-400', 'hover:to-blue-400', 'cursor-pointer', 'download-active', 'scale-105', 'shadow-xl', 'shadow-sky-500/20');

        // Configure le téléchargement
        downloadBtn.onclick = () => {
            const url = URL.createObjectURL(result.file);
            const a = document.createElement('a');
            a.href = url;
            a.download = result.file.name;
            a.click();
            URL.revokeObjectURL(url);

            addLog('📥 Téléchargement lancé', 'success');
        };
    }
}

/**
 * Gère les erreurs
 */
function handleError(error) {
    addLog(`✗ Erreur: ${error.message}`, 'error');
    if (downloadBtn) downloadBtn.disabled = true;
}

// ============================================================================
// UTILITAIRES UI
// ============================================================================

/**
 * Met à jour les éléments UI liés à la licence
 */
function updateLicenseUI() {
    const licenseType = document.getElementById('license-type');
    const creditsLeft = document.getElementById('credits-left');
    const licenseBadge = document.getElementById('license-badge');
    const buyBtn = document.getElementById('buy-license-btn');
    const proCardBtn = document.getElementById('pro-card-btn');

    if (!licenseType || !creditsLeft) return;

    const limitText = document.getElementById('limit-text');

    if (licenseStatus.isPro) {
        licenseType.textContent = 'Pro Version Active';
        licenseType.className = 'text-xs font-bold uppercase tracking-widest text-emerald-400';
        creditsLeft.textContent = 'Unlimited Access';
        licenseBadge.classList.replace('border-sky-500/30', 'border-emerald-500/30');

        if (limitText) limitText.textContent = "PNG, JPG or PDF - Unlimited size";

        // On cache ou désactive le bouton d'achat si déjà Pro
        if (buyBtn) buyBtn.style.display = 'none';
        if (proCardBtn) proCardBtn.style.display = 'none';
    } else {
        licenseType.textContent = 'Free Version';
        licenseType.className = 'text-xs font-bold uppercase tracking-widest text-sky-400';
        creditsLeft.textContent = `${licenseStatus.remainingFiles}/${licenseStatus.maxFilesPerDay} credits left`;
        licenseBadge.classList.replace('border-emerald-500/30', 'border-sky-500/30');

        if (limitText) limitText.textContent = "PNG, JPG or PDF up to 2MB";

        if (buyBtn) buyBtn.style.display = 'flex';
        if (proCardBtn) proCardBtn.style.display = 'block';
    }
}

/**
 * Displays a toaster notification
 */
function showToast(message, type = 'info') {
    const toast = document.createElement('div');

    const colors = {
        success: 'bg-emerald-500 text-white',
        error: 'bg-red-500 text-white',
        warning: 'bg-amber-500 text-white',
        info: 'bg-sky-500 text-white'
    };

    const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ️';

    toast.className = `fixed top-6 right-6 ${colors[type] || colors.info} px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 z-50 animate-bounce-in transition-all duration-300 transform font-medium`;
    toast.innerHTML = `<span class="text-xl font-bold">${icon}</span><span>${message}</span>`;

    document.body.appendChild(toast);

    // Animation d'entrée CSS (à ajouter si besoin, ou on utilise transition)
    toast.style.animation = 'slideIn 0.3s ease-out';

    // Auto remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}


/**
 * Ajoute un message dans la zone de logs
 */
function addLog(message, type = 'info') {
    const p = document.createElement('p');

    // Couleurs selon le type
    const colors = {
        info: 'text-slate-300',
        success: 'text-emerald-400 font-medium',
        warning: 'text-amber-400',
        error: 'text-red-400 font-semibold'
    };

    p.className = colors[type] || colors.info;
    p.textContent = message;

    logsContainer.appendChild(p);

    // Auto-scroll vers le bas
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

/**
 * Vide les logs
 */
function clearLogs() {
    logsContainer.innerHTML = '<p class="text-slate-600 opacity-60 italic text-[10px]">> System ready...</p>';
}

/**
 * Formate la taille d'un fichier
 */
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================================
// DÉMARRAGE
// ============================================================================

// Lance l'initialisation au chargement de la page
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Nettoyage à la fermeture
window.addEventListener('beforeunload', async () => {
    await engine.destroy();
});
