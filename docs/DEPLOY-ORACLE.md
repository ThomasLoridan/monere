# Déployer Monere 24/7 gratuitement — Oracle Cloud « Always Free »

Ce guide déploie **toute la stack** (7 micro-services + frontend + PostgreSQL +
Redis + backups) sur une VM ARM gratuite à vie d'Oracle Cloud, avec HTTPS
automatique. À la fin, l'application est accessible en continu sur une URL
stable, sans dépendre de votre Mac.

> **Durée totale : ~45 min** (dont ~15 min d'attente de build).
> **Coût : 0 €** (une carte bancaire est demandée à l'inscription pour
> vérification — aucun débit tant que vous restez sur les ressources
> « Always Free », marquées d'un badge dans la console).

---

## 1. Créer le compte Oracle Cloud (10 min)

1. Allez sur <https://signup.cloud.oracle.com> et créez un compte.
2. **Région d'origine (Home Region)** : choisissez **France Central (Paris)**,
   **France South (Marseille)** ou **Germany Central (Frankfurt)**.
   ⚠️ Ce choix est **définitif** pour les ressources Always Free — prenez une
   région proche de vos utilisateurs.
3. Vérification par carte bancaire (empreinte de 1 € annulée, aucun débit).
4. À la fin, vous arrivez sur la console : <https://cloud.oracle.com>.

## 2. Créer la VM gratuite (10 min)

1. Menu ☰ → **Compute** → **Instances** → **Create instance**.
2. Nom : `monere`.
3. **Image** : cliquez *Edit* dans « Image and shape » → **Ubuntu 24.04**
   (Canonical Ubuntu, *aarch64*).
4. **Shape** : *Change shape* → **Ampere** → **VM.Standard.A1.Flex** →
   **4 OCPU / 24 GB RAM** (le maximum Always Free — badge « Always Free
   eligible »).
   > 💡 **« Out of capacity »** ? C'est fréquent : la capacité ARM gratuite
   > part vite. Réessayez à un autre moment (tôt le matin), essayez un autre
   > *Availability Domain* dans le formulaire, ou réduisez à 2 OCPU / 12 GB
   > (largement suffisant pour Monere).
5. **SSH keys** : « Generate a key pair for me » → **téléchargez la clé
   privée** (`monere.key`) et gardez-la précieusement.
6. **Create**. Notez l'**adresse IP publique** affichée (ex. `143.47.x.y`).

## 3. Ouvrir les ports 80/443 (5 min)

Oracle filtre le trafic à deux niveaux : le pare-feu cloud **et** le pare-feu
de la VM.

**a) Côté console Oracle :**
1. Sur la page de l'instance → cliquez le lien du **Virtual cloud network**
   → **Security Lists** → *Default Security List*.
2. **Add Ingress Rules** — ajoutez deux règles :
   - Source CIDR `0.0.0.0/0`, protocole TCP, port de destination **80**
   - Source CIDR `0.0.0.0/0`, protocole TCP, port de destination **443**

**b) Côté VM (après connexion SSH, étape 4) :**

```bash
sudo iptables -I INPUT 5 -p tcp --dport 80  -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

## 4. Se connecter et installer Docker (5 min)

Depuis votre Mac (Terminal) :

```bash
chmod 600 ~/Downloads/monere.key
ssh -i ~/Downloads/monere.key ubuntu@ADRESSE_IP_PUBLIQUE
```

Puis, sur la VM :

```bash
# Docker officiel (fonctionne nativement sur ARM)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
exit
```

Reconnectez-vous en SSH (nécessaire pour que le groupe `docker` s'applique).

## 5. Déployer Monere (15 min, build compris)

```bash
git clone https://github.com/ThomasLoridan/monere.git
cd monere
cp .env.example .env
nano .env
```

Dans `.env`, renseignez au minimum :

| Variable | Valeur |
|---|---|
| `MONERE_MODE` | `docker` |
| `NODE_ENV` | `production` |
| `JWT_SECRET`, `INTERNAL_API_KEY`, `POSTGRES_PASSWORD` | des secrets longs et aléatoires (générez-les : `openssl rand -hex 32`) |
| `FINNHUB_API_KEY` | votre clé Finnhub |
| `ANTHROPIC_API_KEY` | votre clé Anthropic |
| `RESEND_API_KEY` | votre clé Resend (e-mails de vérification) |

Puis lancez tout (le build des 8 images prend ~10-15 min la première fois —
il compile nativement sur ARM, aucun souci d'architecture) :

```bash
docker compose --profile full up -d --build
docker compose ps        # tous les services doivent être "Up (healthy)"
curl -s localhost:5173/api/../health || curl -s localhost:8080/health
```

L'app répond maintenant sur `http://ADRESSE_IP_PUBLIQUE:5173`.

## 6. HTTPS + URL stable avec Caddy (10 min)

Un navigateur moderne (et la PWA) exige HTTPS. **Caddy** obtient et renouvelle
les certificats tout seul — il lui faut juste un nom de domaine.

**Option gratuite — DuckDNS** (sous-domaine gratuit à vie) :
1. <https://www.duckdns.org> → connectez-vous (GitHub) → créez `monere`
   (→ `monere.duckdns.org`) → renseignez l'**IP publique de la VM**.

**Option payante — votre domaine** (ex. `monere-app.com`, ~10 €/an) :
créez un enregistrement **A** pointant vers l'IP publique de la VM.

Puis, sur la VM :

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

echo 'monere.duckdns.org {
  reverse_proxy localhost:5173
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

*(Remplacez `monere.duckdns.org` par votre domaine le cas échéant.)*

🎉 **L'app est en ligne 24/7 sur `https://monere.duckdns.org`** — le proxy
nginx du conteneur web route déjà `/api` vers la gateway, et Caddy gère le
certificat. Mac éteint ou pas, ça tourne.

Dernière étape : faites du lien stable GitHub Pages une redirection
permanente — remplacez le contenu de `docs/index.html` par une redirection
vers votre domaine (ou communiquez directement le domaine).

## 7. Exploitation au quotidien

| Action | Commande (sur la VM, dossier `monere/`) |
|---|---|
| Mettre à jour l'app | `git pull && docker compose --profile full up -d --build` |
| Voir les logs | `docker compose logs -f gateway` (ou `auth`, `market`…) |
| Redémarrer | `docker compose --profile full restart` |
| Sauvegardes | incluses : le service `backup` exporte PostgreSQL toutes les 6 h (rétention 14 j) dans le volume `backups` |
| Vérifier l'espace | `df -h` et `docker system prune` de temps en temps |

**Sécurité** : les secrets restent dans `.env` (jamais commité), les services
tournent en utilisateur non-root, PostgreSQL n'est pas exposé publiquement
(pensez à retirer `ports: ['5432:5432']` du compose en production), et les
mises à jour Ubuntu s'appliquent avec `sudo apt update && sudo apt upgrade`.

## Dépannage

- **« Out of capacity » à la création de la VM** → réessayez plus tard ou
  réduisez le shape (2 OCPU / 12 GB suffisent).
- **Le site ne répond pas** → vérifiez les DEUX pare-feux (étape 3), puis
  `docker compose ps` et `sudo systemctl status caddy`.
- **Certificat HTTPS refusé** → le DNS ne pointe pas encore vers l'IP
  (propagation : quelques minutes pour DuckDNS) ; `sudo journalctl -u caddy`.
- **Un service redémarre en boucle** → `docker compose logs <service>` ;
  cause fréquente : variable manquante dans `.env`.
