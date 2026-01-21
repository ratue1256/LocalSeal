# LocalSeal - OCR & Anonymisation Client-Side

Application web moderne de traitement d'images par OCR avec anonymisation intelligente des données sensibles. **100% client-side** - aucune donnée n'est envoyée à un serveur.

## 🎯 Fonctionnalités

- **OCR Multilingue** : Extraction de texte avec Tesseract.js (français + anglais)
- **Anonymisation Intelligente** : Détection et floutage automatique des :
  - Noms de personnes
  - Lieux
  - Organisations
  - Emails, téléphones, IBAN, numéros de sécurité sociale, cartes bancaires
- **Web Workers** : Traitement en arrière-plan pour ne pas bloquer l'interface
- **Licence freemium** : Version gratuite avec watermark, version Pro sans limitation
- **Performance** : Compression d'image optimisée

## 🏗️ Architecture

```
LocalSeal/
├── index.html              # Interface utilisateur
├── package.json            # Dépendances NPM
├── js/
│   ├── LocalSealEngine.js  # Orchestrateur principal
│   ├── WorkerManager.js    # Gestionnaire de Web Workers
│   ├── app.js              # Intégration frontend
│   ├── services/
│   │   ├── OCRService.js       # Service Tesseract.js
│   │   ├── NLPProcessor.js     # Analyse NLP (Compromise.js)
│   │   ├── ImageService.js     # Manipulation Canvas
│   │   └── SecurityManager.js  # Gestion licences
│   └── workers/
│       └── ocr.worker.js   # Worker de traitement OCR
```

## 🚀 Installation

```bash
# Cloner le dépôt
git clone <repo-url>
cd LocalSeal

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
```

L'application sera accessible sur `http://localhost:8080`

## 📖 Utilisation

### Utilisation Simple (avec Worker)

```javascript
import { WorkerManager } from './js/WorkerManager.js';

const worker = new WorkerManager('./js/workers/ocr.worker.js');

// Initialisation
await worker.init();

// Callbacks
worker
  .onProgress((step, progress, message) => {
    console.log(`${step}: ${Math.round(progress * 100)}% - ${message}`);
  })
  .onComplete((result) => {
    console.log('Fichier traité:', result.file);
    console.log('Texte extrait:', result.text);
  })
  .onError((error) => {
    console.error('Erreur:', error);
  });

// Traitement
worker.processFile(file, {
  anonymize: true,
  blurIntensity: 20,
  outputFormat: 'image/jpeg',
  quality: 0.92
});
```

### Utilisation Directe (sans Worker)

```javascript
import { LocalSealEngine } from './js/LocalSealEngine.js';

const engine = new LocalSealEngine();

engine
  .onProgress((step, progress, message) => {
    console.log(`${step}: ${message}`);
  })
  .onComplete((result) => {
    // Téléchargement automatique
    const url = URL.createObjectURL(result.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.file.name;
    a.click();
  });

const outputFile = await engine.processFile(file, {
  anonymize: true,
  extractTextOnly: false
});
```

## 🎨 Options de Traitement

| Option | Type | Défaut | Description |
|--------|------|--------|-------------|
| `anonymize` | Boolean | `false` | Active l'anonymisation des données sensibles |
| `blurIntensity` | Number | `20` | Intensité du flou (1-50) |
| `outputFormat` | String | `'image/jpeg'` | Format de sortie (`image/jpeg`, `image/png`, `image/webp`) |
| `quality` | Number | `0.92` | Qualité de compression (0-1) |
| `extractTextOnly` | Boolean | `false` | Extrait uniquement le texte sans modifier l'image |

## 🔐 Système de Licence

### Version Gratuite
- 5 fichiers par jour
- Watermark sur les images
- Toutes les fonctionnalités OCR + anonymisation

### Version Pro
- Fichiers illimités
- Pas de watermark
- Support prioritaire

### Activation de licence

```javascript
const success = await engine.activateLicense('XXXX-XXXX-XXXX-XXXX');
if (success) {
  console.log('Licence Pro activée !');
}
```

## 🧪 Pipeline de Traitement

1. **Vérification de licence** - Contrôle des crédits disponibles
2. **Détection MIME** - Validation du type de fichier
3. **Chargement image** - Création du canvas
4. **OCR** - Extraction du texte et coordonnées (Tesseract.js)
5. **Analyse NLP** - Détection des entités sensibles (Compromise.js + regex)
6. **Anonymisation** - Floutage des zones identifiées (pixelisation)
7. **Watermark** - Ajout du filigrane (si version gratuite)
8. **Export** - Compression et génération du Blob/File

## 📊 Événements de Progression

| Step | Description |
|------|-------------|
| `license_check` | Vérification de la licence |
| `mime_detection` | Détection du type MIME |
| `image_load` | Chargement de l'image |
| `ocr_processing` | OCR en cours (0-100%) |
| `ocr_complete` | OCR terminé |
| `nlp_analysis` | Analyse NLP des entités |
| `blur_start` | Début de l'anonymisation |
| `blur_complete` | Anonymisation terminée |
| `watermark` | Ajout du watermark |
| `export` | Export du fichier |
| `complete` | Traitement terminé |

## 🛠️ Technologies

- [Tesseract.js](https://tesseract.projectnaptha.com/) - OCR JavaScript
- [Compromise.js](https://compromise.cool/) - Traitement du langage naturel
- [Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) - Manipulation d'images
- [Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) - Traitement asynchrone
- [Tailwind CSS](https://tailwindcss.com/) - Interface moderne

## 🔒 Sécurité & Confidentialité

- **Traitement 100% local** : Aucune donnée n'est envoyée à un serveur externe
- **Pas de tracking** : Aucun analytics ou cookies tiers
- **Open Source** : Code source auditable
- **RGPD Compliant** : Respect total de la vie privée

## 📝 License

MIT License - Voir le fichier LICENSE pour plus de détails.
