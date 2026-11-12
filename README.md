# Gen AI Leader Mock Exam

Examen blanc de 60 questions (en anglais, difficulté élevée) pour préparer la certification
**Google Cloud Generative AI Leader**.

## Utilisation

- **Le plus simple :** ouvrir `dist/gen-ai-leader-mock-exam.html` dans un navigateur (fichier unique, fonctionne hors ligne).
- **Version développement :** ouvrir `index.html` (charge les fichiers de `src/`).

Les questions s'affichent une par une. L'application attend votre réponse (clic, touches `A`–`D` ou `1`–`4`, puis `Entrée`),
la corrige, puis affiche la bonne réponse, une explication et des liens sources cliquables.
En fin de session : note sur 60, pourcentage, score par domaine, concepts à réviser (avec liens) et revue des erreurs.
La session en cours et l'historique sont gardés dans le navigateur (localStorage).

## Fonctionnement de l'examen

| Domaine (guide d'examen) | Poids | Questions tirées | Banque |
|---|---|---|---|
| 1. Fundamentals of gen AI | ~30 % | 18 | 24 |
| 2. Google Cloud's gen AI offerings | ~35 % | 21 | 30 |
| 3. Techniques to improve gen AI model output | ~20 % | 12 | 19 |
| 4. Business strategies for a successful gen AI solution | ~15 % | 9 | 14 |

- Chaque examen tire 60 questions au hasard dans une banque de 87, mélangées entre domaines.
- **Bonnes réponses équiréparties :** l'ordre des options est tiré à chaque session pour placer exactement
  15 bonnes réponses en A, 15 en B, 15 en C et 15 en D.
- **Options neutres :** pas de « all of the above », formulations parallèles, et la longueur de la bonne réponse
  n'est pas un indice (vérifié par `scripts/validate.js`).
- Chronomètre indicatif de 90 minutes (non bloquant). Seuil de 70 % indicatif : Google ne publie pas le score de réussite.

## Maintenance

```bash
node scripts/validate.js   # contrôle la banque (structure, couverture, neutralité des options)
node scripts/build.js      # régénère dist/gen-ai-leader-mock-exam.html
```

Les questions se trouvent dans `src/questions.js` (`answer` = bonne réponse, `distractors` = 3 mauvaises réponses,
`sources` = clés de la table `SOURCES`). Les noms de produits suivent le guide d'examen (Vertex AI, Vertex AI Search…) ;
les explications signalent les renommages récents (Gemini Enterprise Agent Platform, Agent Search, Gemini Enterprise…).
Les liens ont été vérifiés en novembre 2026 ; la documentation Google évolue souvent.
