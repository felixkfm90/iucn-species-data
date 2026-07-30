const DISPLAY_NAMES = Object.freeze({
  kingdom: Object.freeze({
    Animalia: "Tiere",
  }),
  phylum: Object.freeze({
    Chordata: "Chordatiere",
  }),
  subphylum: Object.freeze({
    Vertebrata: "Wirbeltiere",
  }),
  class: Object.freeze({
    Aves: "Vögel",
    Mammalia: "Säugetiere",
    Reptilia: "Reptilien",
  }),
  order: Object.freeze({
    Accipitriformes: "Greifvögel",
    Anseriformes: "Gänsevögel",
    Artiodactyla: "Paarhufer",
    Carnivora: "Raubtiere",
    Charadriiformes: "Regenpfeiferartige",
    Coraciiformes: "Rackenvögel",
    Falconiformes: "Falkenartige",
    Galliformes: "Hühnervögel",
    Gruiformes: "Kranichvögel",
    Otidiformes: "Trappenvögel",
    Passeriformes: "Sperlingsvögel",
    Pelecaniformes: "Pelekanvögel",
    Piciformes: "Spechtvögel",
    Primates: "Primaten",
    Psittaciformes: "Papageien",
    Rodentia: "Nagetiere",
    Squamata: "Schuppenkriechtiere",
    Strigiformes: "Eulen",
    Suliformes: "Tölpelartige",
    Trogoniformes: "Trogone",
  }),
  family: Object.freeze({
    Accipitridae: "Habichtartige",
    Alcedinidae: "Eisvögel",
    Alcidae: "Alkenvögel",
    Anatidae: "Entenvögel",
    Ardeidae: "Reiher",
    Atelidae: "Klammerschwanzaffen",
    Balaenopteridae: "Furchenwale",
    Canidae: "Hunde",
    Cebidae: "Kapuzinerartige",
    Cervidae: "Hirsche",
    Charadriidae: "Regenpfeifer",
    Corvidae: "Rabenvögel",
    Cricetidae: "Wühler",
    Falconidae: "Falkenartige",
    Felidae: "Katzen",
    Fringillidae: "Finken",
    Haematopodidae: "Austernfischer",
    Iguanidae: "Leguane",
    Momotidae: "Sägerracken",
    Motacillidae: "Stelzen und Pieper",
    Muscicapidae: "Fliegenschnäpper",
    Otididae: "Trappen",
    Panuridae: "Bartmeisen",
    Paridae: "Meisen",
    Phalacrocoracidae: "Kormorane",
    Phasianidae: "Fasanenartige",
    Picidae: "Spechte",
    Psittacidae: "Eigentliche Papageien",
    Rallidae: "Rallen",
    Ramphastidae: "Tukane",
    Sciuridae: "Hörnchen",
    Scolopacidae: "Schnepfenvögel",
    Sittidae: "Kleiber",
    Strigidae: "Eigentliche Eulen",
    Trogonidae: "Trogone",
    Turdidae: "Drosseln",
  }),
  genus: Object.freeze({
    Turdus: "Echte Drosseln",
  }),
});

export function germanTaxonomyDisplayName(rank, scientificName) {
  const normalizedRank = String(rank ?? "").trim().toLocaleLowerCase("en");
  const normalizedName = String(scientificName ?? "").trim();
  return DISPLAY_NAMES[normalizedRank]?.[normalizedName] ?? "";
}

export function taxonomyHierarchyDisplayEntry(entry = {}) {
  const scientificName = String(
    entry.scientific_name ?? entry.scientificName ?? "",
  ).trim();
  const germanName = germanTaxonomyDisplayName(entry.rank, scientificName);
  return {
    ...entry,
    scientificName,
    germanName: germanName || null,
    displayName: germanName || scientificName,
  };
}

