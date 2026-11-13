# Youth Madeline – Suivi

App web de suivi des jeunes du Youth Ministry (Shekinah Tabernacle de Gloire, campus Madeline, Cap-Haïtien).

- Front : HTML/CSS/JS statique, hébergé gratuitement sur GitHub Pages.
- Données et connexions : Supabase (plan gratuit). Les données des jeunes ne sont **pas** dans ce dépôt ; elles sont protégées par les règles d'accès de la base (RLS) : chaque rôle ne voit que ce qui lui est permis.

Rôles : Super Admin, Assistant, Volunteer Care, Pasteur (lecture seule), Core Team (son équipe seulement).

Note : sur le plan gratuit, Supabase met le projet en pause après 7 jours sans aucune activité. Une utilisation chaque semaine suffit à l'éviter ; sinon, le réactiver depuis supabase.com.

## App Bethel (`/bethel/`)

Suivi des Bethels (un leader, un assistant et leurs membres) + dîmes et offrandes : https://mandy-te.github.io/youth-madeline/bethel/

- Même base Supabase et mêmes identifiants que l'app Youth, mais des tables et des droits séparés (`bethel_*`).
- Rôles : Super Admin, Coordinateur (tous les Bethels), Pasteur (lecture seule), Leader / Assistant (seulement son Bethel).
- Dîmes et offrandes : saisies par le leader ou l'assistant, reçu WhatsApp, puis « remis à l'église » ; une entrée remise est verrouillée (seul le coordinateur peut la corriger).
