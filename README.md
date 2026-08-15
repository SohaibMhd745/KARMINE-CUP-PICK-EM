# Karmine Cup — Pick'em

Application de pronostics pour la Karmine Cup : bracket à 8 équipes, boule de
cristal, classement général avec lots à la clé.

Next.js 15 (App Router) · Supabase (Postgres + Auth Discord + RLS + Realtime) · Vercel.

Le prototype d'origine est conservé dans [`legacy/index.html`](legacy/index.html)
pour référence — toutes ses données (équipes, résultats de poule, roster,
classement Excel, streams) ont été reprises dans `supabase/seed.sql`.

---

## Mise en route (~15 min)

### 1. Supabase

1. Crée un projet sur [supabase.com](https://supabase.com).
2. **SQL Editor** → exécute les migrations **dans l'ordre** :
   `supabase/migrations/0001_init.sql`, puis `0002_auto_link_aliases.sql`.
3. **SQL Editor** → colle et exécute `supabase/seed.sql`.
   Le script se termine par des `assert` : s'il passe sans erreur, les données
   sont bonnes. Il est **rejouable** sans créer de doublons.

> Base déjà en place ? `0002` s'applique seul, à tout moment : il n'annule rien
> et rattrape au passage les comptes déjà inscrits.

### 2. Application Discord

1. [discord.com/developers/applications](https://discord.com/developers/applications)
   → *New Application*.
2. **OAuth2** → *Redirects* → ajoute :
   `https://<ton-projet>.supabase.co/auth/v1/callback`
3. Copie le **Client ID** et le **Client Secret**.
4. Dans Supabase : **Authentication → Providers → Discord** → active, colle les
   deux valeurs.
5. Dans Supabase : **Authentication → URL Configuration → Redirect URLs**, ajoute
   `http://localhost:3000/**` et `https://<ton-domaine-vercel>/**`.

### 3. Variables d'environnement

```bash
cp .env.local.example .env.local
```

Renseigne depuis **Supabase → Settings → API** :

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

> L'application n'utilise **que** la clé anonyme. Toute la sécurité repose sur
> les politiques RLS et les triggers Postgres. Il n'y a aucun chemin privilégié
> côté serveur, donc aucune clé à fuiter.

### 4. Lancer

```bash
npm install
npm run dev
```

### 5. Te donner les droits admin

Connecte-toi une première fois avec Discord (le profil est créé
automatiquement), puis dans le SQL Editor :

```sql
update profiles set is_admin = true where display_name = 'TON_PSEUDO';
-- ou, plus sûr :
select id, discord_id, display_name from profiles;
update profiles set is_admin = true where id = '<uuid>';
```

Le lien **ADMIN** apparaît alors dans la navigation.

> Cette promotion ne peut se faire **que** depuis le SQL Editor. Un utilisateur
> connecté qui tenterait `update profiles set is_admin = true` sur sa propre
> ligne est rejeté par le trigger `prevent_privilege_escalation()`.

### 6. Déployer

Importe le dépôt sur Vercel, ajoute les deux variables d'environnement, déploie.
Puis ajoute l'URL de production aux *Redirect URLs* Supabase (étape 2.5).

---

## Le jour du tournoi

Ordre des opérations dans **/admin** :

1. **Rounds et barème** — ajuste les points par round, puis coche
   « Ouvert aux pronostics » sur le **Cross Play Decider** uniquement.
2. **Résultats et horaires** — pose une **date limite** sur chaque match ouvert.
   ⚠ Sans date limite, les pronostics restent modifiables indéfiniment ; la page
   admin affiche un avertissement en haut si c'est le cas.
3. **Boule de cristal** — ouvre les questions du round en cours.
4. Le round joué : saisis le vainqueur et le score, passe le statut à
   **terminé**. Les slots « à déterminer » du tour suivant se remplissent tout
   seuls, les points sont attribués, le classement bouge en direct chez tout le
   monde.
5. Ouvre le round suivant. Et ainsi de suite jusqu'à la finale.

---

## Rattachement des scores de poule

Les alias du classement Excel **sont** les pseudos Discord des participants. Le
rattachement est donc automatique : à l'inscription, `auto_link_alias()` relie
l'alias au compte, et l'organisateur n'intervient que sur ce que la machine
refuse de trancher.

`normalize_alias()` absorbe les écarts d'écriture sans jamais deviner :

| Alias Excel | Pseudo Discord | Rattachement |
|---|---|---|
| `Sohalia` | `Sohalia` | correspondance exacte |
| `[KDAVRE CORP] Denis` | `Denis` | préfixe d'équipe retiré |
| `ROÏ DES GWERS` | `ROI DES GWERS` | accents et espaces ignorés |
| `Alan ☀` | `Alan` | décorations ignorées |

Le rattachement est **rejoué à chaque changement de pseudo Discord** : un
participant non reconnu reprend son pseudo de l'Excel, se reconnecte, et se
dépanne seul.

**Ce qui remonte à l'organisateur** — trois refus délibérés, parce qu'il y a des
lots et qu'une erreur donnerait les points d'un participant à un autre :

- **alias en double** — `Lornyk` et `[GOONING] Lornyk` se normalisent
  pareil et ne valent pas le même nombre de points ;
- **homonymes** — deux comptes Discord au même pseudo ;
- **alias déjà pris** — le rattachement existant n'est jamais écrasé.

L'onglet **/admin → Étape 4** liste ces cas avec un rapprochement **suggéré**
(ressemblance de pseudo, préfixe d'équipe sans crochets comme
`ZEUB Camthalion`), présélectionné mais jamais appliqué sans ton clic. Le bouton
*Relancer le rattachement automatique* repasse sur les comptes en attente.

Sur les 58 lignes de l'Excel, **55 se rattachent seules** dès que leur
propriétaire se connecte. Les 3 restantes sont les doublons de l'Excel
(`[GOONING] Lornyk`, `[Feet&Fun]Pauシ`, `[ZEUB] Gahann`, soit 1 point au
total) : à toi de dire si ces lignes font double emploi ou si leurs points
s'ajoutent — un compte ne peut porter qu'un seul alias.

Rien de tout cela n'est bloquant : un alias non rattaché figure au classement
dès le départ, marqué « non rattaché ».

---

## Format du tournoi

```
CROSS-PLAY (seeding)          R1 — QUARTS                   R2 — DEMIES      R3 — FINALE
C1 ZEUB      vs FEET&FUN      M1 KANCEL     vs WALLBREAKERS S1 v.M1 v.M3     F  v.S1 v.S2
C2 DEST.CAP  vs FULL TRUST    M2 KDAVRE     vs GOONING      S2 v.M2 v.M4
                              M3 vainq. C1  vs vainq. C2
                              M4 perdant C1 vs perdant C2
```

Le câblage vit **en base** (`matches.team_a_src_match` + `team_a_src_type`),
pas dans le code. Pour corriger un appariement, une requête suffit :

```sql
-- ex. faire jouer le vainqueur de C1 contre le perdant de C2 en R1 #3
update matches set team_b_src_match = (
  select m.id from matches m join stages s on s.id = m.stage_id
   where s.code = 'cross' and m.order_index = 2
), team_b_src_type = 'loser'
where id = (select m.id from matches m join stages s on s.id = m.stage_id
             where s.code = 'r1' and m.order_index = 3);
```

---

## Modèle de sécurité

Avec des lots en jeu, rien n'est laissé au client.

| Règle | Où elle est appliquée |
|---|---|
| Un pronostic après la date limite est refusé | trigger `enforce_pick_window()` |
| Un pronostic pour le compte d'un tiers est refusé | RLS `picks_own_insert` / `picks_own_update` |
| Les pronostics d'autrui sont invisibles avant verrouillage | RLS `picks_own_read` + vue `match_pick_stats` |
| Nul ne peut se déclarer admin | trigger `prevent_privilege_escalation()` |
| Nul ne peut s'attribuer un score de poule | RLS `legacy_scores_admin_write` |
| Un rattachement douteux est refusé, jamais deviné | `auto_link_alias()` |
| `/admin` renvoie 404 pour un non-admin | garde serveur + RLS sur chaque écriture |
| Chaque action d'organisateur est tracée | table `audit_log` |
| Les points sont recalculables à l'identique | `recompute_all_scores()`, idempotente |

L'interface reflète ces règles (boutons désactivés, comptes à rebours) mais
n'en est jamais l'autorité : couper le JavaScript ou taper l'API Supabase
directement ne permet rien de plus.

---

## Structure

```
app/
  page.tsx              accueil : état du tournoi, top 5
  pronostics/           bracket + picks progressifs + boule de cristal
  finale/               vue dédiée à la grande finale
  groupes/              archive de la phase de poule
  classement/           classement général, temps réel
  streams/  reglement/
  admin/                panneau organisateur (+ actions.ts : Server Actions)
  auth/callback/        échange du code OAuth Discord
components/             Nav, MatchCard, PicksBoard, CrystalBall, admin/*
lib/
  data.ts               accès aux données côté serveur
  lock.ts               logique de verrouillage (miroir du trigger SQL)
  alias.ts              suggestions de rattachement (l'autorité est en base)
  types.ts  champions.ts
supabase/
  migrations/0001_init.sql              schéma, RLS, triggers, vues
  migrations/0002_auto_link_aliases.sql rattachement automatique des alias
  seed.sql                              données reprises du prototype
legacy/index.html                       prototype d'origine, pour référence
```

### Deux points d'attention

`lib/lock.ts` (`lockState`) duplique volontairement la logique du trigger
`enforce_pick_window()` pour l'affichage. **Si tu modifies l'un, modifie
l'autre** — sinon l'interface promettra des pronostics que la base refusera.

`lib/alias.ts` ne **suggère** que des rapprochements approximatifs, pour
l'organisateur. Le rattachement qui fait autorité est `auto_link_alias()` en
base, strictement déterministe. Ne déplace jamais le flou vers la base : un
« à peu près » ne doit pas attribuer de points tout seul.

---

## Vérifications

```bash
npm run build       # compilation + types
npm run typecheck   # types seuls
npm run test:db     # schéma + seed + 35 tests de comportement (nécessite Docker)
```

`npm run test:db` monte un Postgres 16 jetable, y reproduit l'environnement
Supabase (schéma `auth`, `auth.uid()`, rôles `anon`/`authenticated`, grants par
défaut, publication realtime), applique les migrations, joue le seed **deux
fois** pour vérifier son idempotence, puis exécute la suite de tests.

Ce qu'elle couvre, en usurpant réellement les rôles Postgres :

```
 1. création automatique du profil à l'inscription
 2. impossible de s'auto-déclarer admin
 3. round fermé → pronostic refusé
 4. pronostic enregistré puis modifiable (upsert)
 5. équipe étrangère au match → refusée
 6. pronostic au nom d'un tiers → refusé par la RLS
 7. les pronostics d'autrui sont invisibles
 8. match aux slots vides → pronostic refusé
 9. date limite dépassée → pronostic refusé
10. un participant ne peut pas publier de résultat
11. propagation du bracket (vainqueurs ET perdants)
12-13. scoring automatique à la publication
14. modifier un barème rescore l'historique
15-17. classement, alias non rattachés, ordre déterministe
18. les statistiques de pronostics ne fuitent pas avant verrouillage
19-21. boule de cristal : réponse, scoring, verrou après publication
22. journal d'audit réservé aux admins
23-24. impossible de s'attribuer des points en écrivant dans `points`
25. effacer sa réponse tant que la question est ouverte
26. normalisation des pseudos : préfixes, accents, décorations
27-28. inscription → alias rattaché seul, préfixe d'équipe compris
29. alias en double → refus de trancher, signalé à l'organisateur
30. homonymes → refus, et le rattachement existant est préservé
31. renommage Discord → profil synchronisé et rattachement rejoué
32. un arbitrage de l'organisateur n'est jamais écrasé
33. la reprise en masse est réservée aux admins
34. un participant ne peut pas s'attribuer un score de poule
35. la reprise en masse rattrape les comptes créés avant `0002`
```

> Deux de ces tests correspondent à des défauts trouvés **pendant** le
> développement, pas à des évidences : publier un résultat échouait parce que
> le scoring réécrit `picks.points` et redéclenchait le verrou de deadline ; et
> la RLS seule n'empêchait pas un participant d'écrire dans sa propre colonne
> `points` (corrigé par des privilèges au niveau colonne). Garde cette suite
> verte si tu touches au schéma.
