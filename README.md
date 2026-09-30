# 🛡️ HOLM Security Card

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/)
![Version](https://img.shields.io/github/v/release/kaaribou/holm-security-card)
![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2025.1%2B-03a9f4)

**Mouvements, portes, fenêtres et détections caméra au même endroit : ce qui se passe maintenant, et tout ce qui s'est passé depuis 24 h.**

HOLM Security Card rassemble vos détecteurs de mouvement, vos capteurs d'ouverture et les détections de vos caméras (personne, véhicule, animal) dans une carte claire, avec **deux vues** : des **tuiles** en direct (« il y a 12 min ») et une **chronologie** de l'activité des dernières heures.

> ✨ **Zéro YAML.** Groupes et capteurs se configurent dans l'éditeur visuel ; la chronologie vient de l'historique de Home Assistant.

### En bref

- 🚨 **Bandeau « Détection en cours »** avec les capteurs actifs, et le nombre de capteurs actifs dans la dernière heure.
- 🧱 **Tuiles** par groupe : état, libellé personnalisable (« ouverte », « détection »), temps écoulé depuis le dernier changement.
- 📷 **Caméras** sur une ligne compacte : dernières détections Personne / Véhicule / Animal.
- 📊 **Chronologie** : chaque détection sur une frise (24 h par défaut), avec le nombre d'événements par capteur et une légende par type.
- 🎨 Couleur orange pour ce qui est actif, turquoise pour ce qui vient de se produire.

| Tuiles | Chronologie 24 h |
|---|---|
| ![Tuiles](docs/images/tuiles.png) | ![Chronologie](docs/images/chronologie.png) |

---

## Installation

### Avec HACS (recommandé)

1. HACS → menu ⋮ → **Dépôts personnalisés**.
2. Ajoutez `https://github.com/kaaribou/holm-security-card`, catégorie **Tableau de bord** (*Dashboard / Plugin*).
3. Recherchez la carte → **Télécharger**.
4. Rechargez la page (Ctrl + F5).

### Manuellement

1. Copiez `dist/holm-security-card.js` dans `config/www/community/holm-security-card/`.
2. **Paramètres → Tableaux de bord → ⋮ → Ressources → Ajouter** : `/local/community/holm-security-card/holm-security-card.js`, type **Module JavaScript**.
3. Rechargez la page.

---

## Utilisation

```yaml
type: custom:holm-security-card
title: Sécurité
hours: 24
groups:
  - name: Mouvements
    icon: mdi:motion-sensor
    entities:
      - entity: binary_sensor.mouvement_salon
        name: Salon
        icon: mdi:sofa
  - name: Ouvertures
    icon: mdi:door
    entities:
      - entity: binary_sensor.porte_entree
        name: Porte d'entrée
        on_label: ouverte
  - name: Portail
    icon: mdi:cctv
    layout: camera                    # ligne compacte Personne / Véhicule / Animal
    entities:
      - binary_sensor.portail_personne
      - binary_sensor.portail_vehicule
      - binary_sensor.portail_animal
```

## Options

| Option | Description | Par défaut |
|---|---|---|
| `title` | Titre | `Sécurité` |
| `view` | Vue à l'ouverture : `tiles` ou `timeline` | `tiles` |
| `hours` | Durée de la chronologie (h) | `24` |
| `show_frame` | Afficher le cadre de la carte | `true` |
| `groups` | Groupes : `name`, `icon`, `layout` (`tiles` ou `camera`), `entities` (**obligatoire**) | — |
| `entities` | Entité, ou `entity`, `name`, `icon`, `on_label` (texte quand actif) | — |

En disposition `camera`, le type de détection est reconnu d'après le nom de l'entité (`person` / `personne`, `vehicle` / `véhicule`, `animal` / `pet`).

## FAQ

| Problème | Solution |
|---|---|
| Chronologie vide | Les capteurs doivent être enregistrés dans l'historique (recorder). |
| La nouvelle version ne s'affiche pas | Videz le cache (Ctrl + F5). |

---

## Un petit merci ?

La carte vous plaît ? Vous pouvez m'offrir une bière 🍺

[![Offrez-moi une bière](https://img.shields.io/badge/Offrez--moi_une_bi%C3%A8re-PayPal-0070ba?logo=paypal&logoColor=white)](https://paypal.me/kaaribou)

---

## Licence

Code : licence **MIT** — © kaaribou. Voir le [CHANGELOG](CHANGELOG.md).

Fait partie de la collection **HOLM** : [Carburant HOLM](https://github.com/kaaribou/carburant-holm) · [HOLM Navbar Card](https://github.com/kaaribou/holm-navbar-card) · [HOLM Music Card](https://github.com/kaaribou/holm-music-card) · [HOLM Sentinel Card](https://github.com/kaaribou/holm-sentinel-card).
