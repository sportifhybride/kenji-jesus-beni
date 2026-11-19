# Avis clients INNÉ

- `worker.js` : sert le site et l'API des avis (`/api/reviews`, `/api/admin/...`).
- `schema.sql` : tables de la base Cloudflare D1 `inne-reviews` (déjà créées).
- Espace privé de Kenji : `/admin` sur le site (mot de passe, modifiable depuis l'onglet « Mot de passe »).

Pour mettre le site à jour, remplace le contenu de `INNE-site111/INNE-site/` en gardant
`js/reviews.js` et `admin.html`, et ne supprime pas `wrangler.jsonc` ni ce dossier `reviews/`.
