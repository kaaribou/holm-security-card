# Changelog

## 1.1.1
- **iPhone / iPad : la page ne remonte plus toute seule.** Quand la carte se redessinait (à chaque détection, chaque minute ou au changement de vue), la page pouvait remonter d'un coup sur iOS (Safari et application Home Assistant). La carte garde maintenant sa hauteur pendant qu'elle se redessine, et la position de défilement est conservée.

## 1.1.0
- **Ordre des groupes respecté** : l'affichage (tuiles et chronologie) suit l'ordre de l'éditeur ; les groupes caméra qui se suivent sont regroupés sous « Caméras » ([#1](https://github.com/kaaribou/holm-security-card/issues/1)).
- **Chronologie de la journée au toucher** : un clic sur un capteur ou une caméra ouvre une fenêtre avec la frise de la journée (survol = heure et durée), les détections par heure, le total actif, la première et la dernière détection et la liste des événements ; jours précédents avec ‹ › ; accès à la fiche du capteur ([#1](https://github.com/kaaribou/holm-security-card/issues/1)).

## 1.0.0
Première version publique.

- Tuiles en direct par groupe (mouvement, ouvertures…) avec temps écoulé.
- Disposition caméra compacte : Personne / Véhicule / Animal.
- Chronologie des détections sur 24 h (durée réglable), légende par type.
- Bandeau « Détection en cours » et compteur d'activité de la dernière heure.
- Éditeur visuel des groupes.
