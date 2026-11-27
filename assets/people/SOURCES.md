# People: sources

What the people of TILT are made from. Nothing here was taken from a paid service by the code in this repository.

## Shipped files

| file | what | made by |
|---|---|---|
| `cloth_atlas.webp` (2048 x 2048), `cloth_atlas_512.webp` (low tier) | the clothing atlas: 24 garments, 16 faces, sleeves and headwear | `tools/people/atlas.py` |
| `faces.webp` (2048 x 1536) | the ten faces of the knight's head | `tools/people/atlas.py` |
| `../../src/people_geo.js` | every body part, piece of headwear and the knight's head, as quantised geometry | `tools/people/geo.py` |

## Fabrics: AI-generated for TILT

The fabric tiles in `tools/people/tiles/` (wool, linen, hemp, damask, velvet, broadcloth, ermine, vair, brocade, leather: 24 tiles of 128 px) are cut by
`tools/people/tiles.py` from six swatch sheets that the owner generated with his own image pipeline for this game (`shots/genart/cloth_*.png`,
not in the repository): `cloth_wool_commons`, `cloth_linen_hemp`, `cloth_silk_damask_noble`, `cloth_velvet_fur_trim`, `cloth_gold_brocade`,
`cloth_leather_goods`. They are AI-generated images made for TILT; no third-party artwork is in them. The garment structure painted over them
(necklines, belts, lacing, hems, fur trims, folds, hose, shoes) and all the faces are procedural (`atlas.py`).

## Reference images (looked at and measured, not shipped)

Downloaded from Wikimedia Commons into `tools/people/ref/` (git-ignored). Eleven files, each under 3 MB.

Bodies (proportions: `tools/people/silhouette.py` reads the same landmarks off these and off the model, see `shots/people/overlay_*.png`):

| local name | Commons file | licence |
|---|---|---|
| `body_male_front.png` | File:Naked human male body front anterior.png | public domain |
| `body_female_front.png` | File:Anterior view of human female, retouched - transparent.png | CC0 |

Dress, headwear, hair and faces (15th century):

| local name | Commons file | what was taken from it |
|---|---|---|
| `philip_good.jpg` | Rogier van der Weyden, presentation miniature of the Chroniques de Hainaut (KBR 9242), 1447 | the men's short pleated gown with padded shoulders and a narrow belted waist, hose and long pointed shoes, the chaperon with its roll, cockscomb and tail, bowl haircuts, the chancellor's long robe |
| `tres_riches_april.jpg`, `tres_riches_may.jpg`, `tres_riches_january.jpg` | Limbourg brothers, Tres Riches Heures du duc de Berry (April, May, January), c. 1412-16 | the ladies' long high-waisted gowns with trains, houppelandes with fur and dagged edges, colours of the gallery |
| `weyden_lady.jpg` | Rogier van der Weyden, Portrait of a Lady, c. 1460 | the truncated hennin and its sheer veil, the plucked hairline, the V neck over a dark stomacher, the broad red belt with a gilt buckle; the heavy-lidded eyes |
| `christus_girl.jpg` | Petrus Christus, Portrait of a Young Girl, c. 1470 | the black truncated hennin with its frontlet loop, the wide ermine collar |
| `man_turban.jpg` | Jan van Eyck, Portrait of a Man (in a red chaperon), 1433 | the chaperon wound up on the head, the fur collar, an older man's face |
| `arnolfini.jpg` | Jan van Eyck, the Arnolfini Portrait, 1434 | fur-edged gowns, the lady's veil, the merchant's hat |
| `manesse_joust.jpg` | Codex Manesse, fol. 52r (Walther von Klingen), c. 1300-40 | the ladies watching from the gallery, colours |

All the paintings and manuscripts are in the public domain (their makers died more than 500 years ago; the Commons files are faithful photographs of
two-dimensional works). The two body photographs are public domain / CC0 anatomical reference photographs.

Not found (the Commons search began refusing automated queries): side views of the same bodies, front views of a heavy and of a thin man and woman,
and a strict front / profile pair of a head. The heavy and thin builds are the fitted medium body with the build delta; the head is checked against
the canon of proportions only (eyes at half the head's height, and so on: `silhouette.py`). Photographs for those would be the next thing to add.
